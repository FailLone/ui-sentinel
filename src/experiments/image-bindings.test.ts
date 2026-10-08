import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { launchBrowser, type BrowserWorker } from '../execution/browser.ts'
import { createEvidenceIntegrity } from '../execution/evidence-integrity.ts'
import { installUiNetworkSession } from '../execution/network/session.ts'
import { createNetworkPolicy } from '../inspection/network-policy.ts'
import { createRun, getFindings, getEvents } from '../execution/run-manager.ts'
import { getDbClient } from '../storage/database.ts'
import { imagePng, imageContract } from '../../evaluation/fixtures/image-shape.ts'
import { imageShapeDistortionRule } from '../rules/builtin/image-shape-distortion.ts'
import { createImageBindingExperiment, type ImageBindingCandidate } from './image-bindings.ts'
import { openImageBindingExperiment } from './image-binding-host.ts'

let worker: BrowserWorker,
  experiment: ReturnType<typeof createImageBindingExperiment>,
  runId: string
let integrity: ReturnType<typeof createEvidenceIntegrity>
let origin = '',
  html = '',
  time = Date.now(),
  imageRequests = 0,
  writes = 0,
  changedBytes = false
const image = (id = 'mark') =>
  `<img id="${id}" alt="Company logo" src="/image.png" style="display:block;width:240px;height:60px;margin:30px">`
const server = createServer((req, res) => {
  if (req.method !== 'GET') {
    writes++
    res.end('unexpected')
    return
  }
  if (req.url?.startsWith('/image')) {
    imageRequests++
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' })
    res.end(changedBytes ? Buffer.concat([imagePng, Buffer.from([0])]) : imagePng)
  } else if (req.url === '/favicon.ico') res.writeHead(204).end()
  else {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<!doctype html><title>Synthetic binding fixture, not Jira</title>${html}`)
  }
})
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})
beforeEach(async () => {
  html = image()
  imageRequests = 0
  writes = 0
  changedBytes = false
  time = Date.now()
  runId = (
    await createRun({
      goal: 'Synthetic candidate materials only',
      environmentId: 'test',
      entryUrl: origin + '/page',
    })
  ).id
  worker = await launchBrowser({ uiScan: true })
  integrity = createEvidenceIntegrity()
  await installUiNetworkSession({
    context: worker.context,
    page: worker.page,
    policy: createNetworkPolicy({
      entryUrl: origin + '/page',
      resourceOrigins: [],
      dataOrigins: [],
      reachableOrigins: [origin],
    }),
    onDecision: (d) => {
      if (!d.allow) integrity.intervene({ kind: 'network-denied', url: d.url, method: d.method })
    },
  })
  experiment = createImageBindingExperiment({
    page: worker.page,
    runId,
    evidenceIntegrity: integrity.snapshot,
    now: () => time,
  })
})
afterEach(async () => {
  await experiment.close()
  await worker.close()
  await rm(`data/artifacts/${runId}`, { recursive: true, force: true })
})
async function discover() {
  await worker.page.goto(origin + '/page')
  return experiment.observe()
}
function review(candidate: ImageBindingCandidate) {
  return {
    candidateId: candidate.candidateId,
    observationId: candidate.observationId,
    intent: 'preserve',
    basis: imageContract().basis,
  }
}
async function artifactPath(ref: string) {
  const rows = await getDbClient().execute({
    sql: 'SELECT file_path FROM artifacts WHERE id=? AND run_id=?',
    args: [ref, runId],
  })
  return String(rows.rows[0]!.file_path)
}

it('collects exact facts for distinct same-name images without inventing intent or fetching again', async () => {
  html =
    image('first') +
    image('second') +
    '<img src="data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\"/%3E" style="display:block;width:100px;height:100px">'
  const batch = await discover()
  expect(batch.totalImages).toBe(3)
  expect(batch.omittedImages).toBe(0)
  expect(batch.candidates.filter((c) => c.status === 'facts-ready')).toHaveLength(2)
  for (const candidate of batch.candidates.slice(0, 2)) {
    expect(candidate.measured.contractFields).toMatchObject({
      pageUrl: origin + '/page',
      resourceUrl: origin + '/image.png',
      resourceSha256: createHash('sha256').update(imagePng).digest('hex'),
      viewport: { width: 1280, height: 768 },
    })
    expect(candidate.pending).toEqual({
      intent: null,
      basis: { reference: null, statement: null, confirmedBy: null },
    })
    expect(candidate.missingFields).toEqual([
      'intent',
      'basis.reference',
      'basis.statement',
      'basis.confirmedBy',
    ])
    expect(candidate.measured.locator.matchCount).toBe(1)
  }
  expect(batch.candidates[0]!.candidateId).not.toBe(batch.candidates[1]!.candidateId)
  expect(batch.candidates[2]!.status).toBe('facts-incomplete')
  expect(batch.candidates[2]!.missingFields).toContain('resourceSha256')
  expect(imageRequests).toBe(1)
  expect((await getEvents(runId)).some((e) => e.type === 'rule:evaluated')).toBe(false)
  expect(await getFindings(runId)).toHaveLength(0)
  const saved = JSON.parse(await readFile(await artifactPath(batch.artifactRef), 'utf8'))
  expect(saved.candidates[0].pending.basis.confirmedBy).toBeNull()
})

it('requires explicit basis and consumes only fresh measured fields through the existing checker/report', async () => {
  const candidate = (await discover()).candidates[0]!
  expect(
    (
      await experiment.check({
        candidateId: candidate.candidateId,
        observationId: candidate.observationId,
      })
    ).verdict,
  ).toBe('unknown')
  expect(
    (
      await experiment.check({
        ...review(candidate),
        basis: { ...imageContract().basis, confirmedBy: '' },
      })
    ).verdict,
  ).toBe('unknown')
  // Caller cannot smuggle replacement measured fields or mutate the returned export to redirect binding.
  expect(
    (
      await experiment.check({
        ...review(candidate),
        resourceUrl: 'https://invented.test/image.png',
      })
    ).verdict,
  ).toBe('unknown')
  candidate.measured.contractFields.resourceUrl = 'https://invented.test/image.png'
  const result = await experiment.check(review(candidate))
  expect(result.verdict, result.actual).toBe('fail')
  expect((result.details.rows as any[])[0].contract.resourceUrl).toBe(origin + '/image.png')
  expect(imageRequests).toBe(1)
  expect(imageShapeDistortionRule.enabled).toBe(false)
  const { buildReport } = await import('../server/reports/run-report.ts')
  const report = await buildReport(runId)
  expect(report!.evaluations.some((r) => r.verdict === 'fail')).toBe(true)
  expect(report!.findings).toHaveLength(1)
  expect(report!.findings[0]).toMatchObject({ source: 'rule', ruleId: 'image-shape-distortion' })
  expect(
    result.evidenceRefs.every((ref) => report!.artifacts.some((a) => a.id === ref && a.available)),
  ).toBe(true)
})

it('records duplicate IDs as ambiguity and detects replacement at the same structural selector', async () => {
  html = image('duplicate') + image('duplicate')
  const ambiguous = await discover()
  expect(ambiguous.candidates).toHaveLength(2)
  expect(
    ambiguous.candidates.every(
      (c) => c.measured.locator.matchCount === 2 && c.status === 'facts-incomplete',
    ),
  ).toBe(true)
  expect((await experiment.check(review(ambiguous.candidates[0]!))).verdict).toBe('unknown')
  await worker.page.setContent(image('').replace('src="/image.png"', `src="${origin}/image.png"`))
  await worker.page.locator('img').evaluate((img: HTMLImageElement) => img.decode())
  const candidate = (await experiment.observe()).candidates[0]!
  expect(candidate.status).toBe('facts-ready')
  expect(candidate.measured.locator.kind).toBe('structural')
  await worker.page.locator('img').evaluate((node) => node.replaceWith(node.cloneNode(true)))
  expect((await experiment.check(review(candidate))).actual).toContain('target-lost-or-ambiguous')
  expect(await getFindings(runId)).toHaveLength(0)
})

it('refuses changed resource URLs and changed bytes at the same URL rather than reusing a confirmation', async () => {
  const candidate = (await discover()).candidates[0]!
  const confirmation = review(candidate)
  await worker.page.locator('img').evaluate(async (img: HTMLImageElement) => {
    img.src = '/image-v2.png'
    await img.decode()
  })
  expect((await experiment.check(confirmation)).actual).toContain('resource-changed-or-unverified')
  changedBytes = true
  await worker.page.locator('img').evaluate(async (img: HTMLImageElement) => {
    img.src = '/image.png'
    await img.decode()
  })
  expect((await experiment.check(confirmation)).actual).toContain('resource-changed-or-unverified')
  const newBatch = await experiment.observe()
  expect(newBatch.candidates[0]!.missingFields).toContain('resourceSha256')
  expect((await experiment.check(confirmation)).actual).toContain('superseded-candidate')
  expect(await getFindings(runId)).toHaveLength(0)
})

it('identifies expired, superseded and missing/modified evidence without carrying confirmation to a new observation', async () => {
  const candidate = (await discover()).candidates[0]!
  time += 5 * 60 * 1000
  expect((await experiment.check(review(candidate))).actual).toContain('evidence-expired')
  const next = (await experiment.observe()).candidates[0]!
  expect((await experiment.check(review(candidate))).actual).toContain('superseded-candidate')
  const path = await artifactPath(next.measured.evidenceRefs[1]!)
  await writeFile(path, '{}')
  expect((await experiment.check(review(next))).actual).toContain('evidence-changed')
  await rm(path)
  expect((await experiment.check(review(next))).actual).toContain('evidence-unavailable')
  expect(await getFindings(runId)).toHaveLength(0)
})

it('invalidates layout/viewport/document changes and retains partial inventory limits', async () => {
  const candidate = (await discover()).candidates[0]!
  await worker.page.locator('img').evaluate((el) => {
    el.style.height = '120px'
  })
  expect((await experiment.check(review(candidate))).actual).toContain('observation-facts-changed')
  const fresh = (await experiment.observe()).candidates[0]!
  expect((await experiment.check(review(fresh))).verdict).toBe('pass')
  await worker.page.setViewportSize({ width: 800, height: 600 })
  expect((await experiment.check(review(fresh))).actual).toContain('page-or-viewport-changed')
  await worker.page.reload()
  expect((await experiment.check(review(fresh))).actual).toContain('target-lost-or-ambiguous')
  html = Array.from({ length: 33 }, (_, i) => image(`image-${i}`)).join('')
  await worker.page.reload()
  const limited = await experiment.observe()
  expect(limited.totalImages).toBe(33)
  expect(limited.candidates).toHaveLength(32)
  expect(limited.omittedImages).toBe(1)
})

it('uses the independent host with the existing network boundary; denied writes cannot produce valid bindings', async () => {
  html = image() + '<script>fetch("/write", {method:"POST"}).catch(()=>{})</script>'
  const host = await openImageBindingExperiment({
    entryUrl: origin + '/page',
    trustedOrigins: [origin],
  })
  try {
    const batch = await host.observe()
    expect(batch.candidates[0]!.issues).toContain('evidence-intervened')
    expect((await host.check(review(batch.candidates[0]!))).verdict).toBe('unknown')
    expect(writes).toBe(0)
    expect(
      (await getEvents(host.runId)).some(
        (e) => e.type === 'network:decision' && e.payload.reasonCode === 'unsupported-data-method',
      ),
    ).toBe(true)
  } finally {
    await host.close()
    await rm(`data/artifacts/${host.runId}`, { recursive: true, force: true })
  }
})

it('opens the standalone normal-browser host, consumes explicit review, and rejects review from a closed session', async () => {
  const host = await openImageBindingExperiment({
    entryUrl: origin + '/page',
    trustedOrigins: [origin],
  })
  try {
    const batch = await host.observe()
    expect(batch.candidates[0]!.status).toBe('facts-ready')
    const input = review(batch.candidates[0]!)
    expect((await host.check(input)).verdict).toBe('fail')
    expect(imageRequests).toBe(1)
    await host.close()
    const eventCount = (await getEvents(host.runId)).length
    const result = await host.check(input)
    expect((await getEvents(host.runId)).length).toBe(eventCount)
    expect(result.verdict).toBe('unknown')
    expect(result.actual).toContain('session-closed')
    expect((await getEvents(host.runId)).some((e) => e.type === 'finish:accepted')).toBe(false)
  } finally {
    await host.close()
    await rm(`data/artifacts/${host.runId}`, { recursive: true, force: true })
  }
})

it('runs the free interactive CLI end to end with a separate database and explicit review file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'image-binding-cli-'))
  const output = join(root, 'experiment')
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/experiments/image-bindings.ts',
      '--url',
      origin + '/page',
      '--out',
      output,
      '--interactive',
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, URL_SCAN_TRUSTED_ORIGINS: origin, AGENT_MODEL: '', VISION_MODEL: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )
  let stdout = '',
    stderr = '',
    cliRunId = ''
  const completed = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout.on('data', (bytes) => {
      stdout += String(bytes)
      if (stdout.includes('Interactive') || stdout.includes('Review candidates')) resolve()
    })
    child.once('exit', () => reject(Error('CLI exited before review: ' + stderr + stdout)))
    child.once('error', reject)
  })
  child.stderr.on('data', (bytes) => {
    stderr += String(bytes)
  })
  const deadline = setTimeout(() => child.kill('SIGTERM'), 20000)
  try {
    await ready
    const batch = JSON.parse(await readFile(join(output, 'candidates-1.json'), 'utf8'))
    cliRunId = batch.runId
    const template = JSON.parse(await readFile(join(output, 'review-template.json'), 'utf8'))
    expect(template.basis.confirmedBy).toBeNull()
    expect(template.candidateId).toBeNull()
    const reviewFile = join(output, 'explicit-review.json')
    await writeFile(reviewFile, JSON.stringify(review(batch.candidates[0])))
    child.stdin.end('check ' + reviewFile + '\nquit\n')
    expect(await completed, stderr + stdout).toBe(0)
    expect(JSON.parse(await readFile(join(output, 'check-2.json'), 'utf8')).verdict).toBe('fail')
    expect((await readFile(join(output, 'experiment.db'))).length).toBeGreaterThan(0)
    expect(imageRequests).toBe(1)
    expect(writes).toBe(0)
  } finally {
    clearTimeout(deadline)
    child.kill()
    await completed
    await rm(root, { recursive: true, force: true })
    if (cliRunId) await rm(resolve('data/artifacts', cliRunId), { recursive: true, force: true })
  }
})
