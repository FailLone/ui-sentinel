import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { launchBrowser, observePage, type BrowserWorker } from '../execution/browser.ts'
import { readImagePaintFacts } from '../execution/image-paint.ts'
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

const editors =
  '<input id="input" style="color:blue" value="Synthetic input">' +
  '<textarea id="textarea" style="color:green">Synthetic text</textarea>' +
  '<div id="editable" contenteditable="true" style="color:red">Synthetic editor</div>'
type MutationReceipt = {
  type: string
  target: string
  attribute: string | null
  oldValue: string | null
  value: string | null
}
async function watchCaretMutations() {
  await worker.page.evaluate(() => {
    const host = window as typeof window & { caretRecords?: MutationReceipt[] }
    host.caretRecords = []
    new MutationObserver((records) => {
      for (const record of records)
        host.caretRecords!.push({
          type: record.type,
          target: (record.target as Element).id || record.target.nodeName,
          attribute: record.attributeName,
          oldValue: record.oldValue,
          value:
            record.target instanceof Element && record.attributeName
              ? record.target.getAttribute(record.attributeName)
              : null,
        })
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      childList: true,
      characterData: true,
    })
  })
}
async function caretRecords() {
  return worker.page.evaluate(
    () => (window as typeof window & { caretRecords: MutationReceipt[] }).caretRecords,
  )
}
// Optional local handoff receipts; the normal test still removes its temporary artifacts.
async function retainCaretEvidence(name: string, details: unknown, evidenceRunId = runId) {
  if (!process.env.IMAGE_CARET_EVIDENCE_DIR) return
  const directory = resolve(process.env.IMAGE_CARET_EVIDENCE_DIR, name)
  await mkdir(directory, { recursive: true })
  const rows = await getDbClient().execute({
    sql: 'SELECT id,type,file_path FROM artifacts WHERE run_id=?',
    args: [evidenceRunId],
  })
  const artifacts = await Promise.all(
    rows.rows.map(async (row) => {
      const path = join(directory, String(row.id))
      const bytes = await readFile(String(row.file_path))
      await copyFile(String(row.file_path), path)
      return {
        id: row.id,
        type: row.type,
        path,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }
    }),
  )
  await writeFile(
    join(directory, 'receipt.json'),
    JSON.stringify(
      { runId: evidenceRunId, details, artifacts, events: await getEvents(evidenceRunId) },
      null,
      2,
    ),
  )
}

it.each(['default', 'initial'] as const)('caret screenshot control: %s', async (caret) => {
  html = image().replace('height:60px', 'height:120px') + editors
  await worker.page.goto(origin + '/page')
  await worker.page.locator('img').evaluate((img: HTMLImageElement) => img.decode())
  const before = (await readImagePaintFacts(worker.page, ['#mark']))[0]!
  await watchCaretMutations()
  const observed = await observePage(
    worker.page,
    runId,
    undefined,
    ['#mark'],
    caret === 'initial' ? { caret } : undefined,
  )
  const after = (await readImagePaintFacts(worker.page, ['#mark']))[0]!
  const records = await caretRecords()
  const { mutationEpoch: beforeEpoch, ...beforeTarget } = before
  const { mutationEpoch: afterEpoch, ...afterTarget } = after
  expect(afterTarget).toEqual(beforeTarget)
  if (caret === 'default') {
    expect(afterEpoch).toBeGreaterThan(beforeEpoch!)
    expect(records).toHaveLength(6)
    expect([...new Set(records.map((r) => r.target))].sort()).toEqual([
      'editable',
      'input',
      'textarea',
    ])
    expect(records.every((r) => r.type === 'attributes' && r.attribute === 'style')).toBe(true)
    expect(records.some((r) => r.oldValue?.includes('caret-color: transparent'))).toBe(true)
  } else {
    expect(afterEpoch).toBe(beforeEpoch)
    expect(records).toEqual([])
  }
  expect(observed.snapshot.imagePaint![0]!.stable).toBe(caret === 'initial')
  expect(imageRequests).toBe(1)
  await retainCaretEvidence(`control-${caret}`, { before, after, records, observed })
})

it('caret-safe experiment preserves static binding and screenshot/source evidence', async () => {
  html = image().replace('height:60px', 'height:120px') + editors
  await worker.page.goto(origin + '/page')
  await watchCaretMutations()
  const batch = await experiment.observe()
  const candidate = batch.candidates[0]!
  expect(candidate.status).toBe('facts-ready')
  expect(candidate.pending.basis.confirmedBy).toBeNull()
  const result = await experiment.check(review(candidate))
  // The only semantic obligation here is the existing synthetic fixture's authored contract.
  expect(result.verdict, result.actual).toBe('pass')
  expect(await caretRecords()).toEqual([])
  const after = (await readImagePaintFacts(worker.page, ['#mark']))[0]!
  expect(after.nodeId).toBe(candidate.measured.paint!.nodeId)
  expect(after.mutationEpoch).toBe(candidate.measured.paint!.mutationEpoch)
  const { buildReport } = await import('../server/reports/run-report.ts')
  const report = (await buildReport(runId))!
  expect(
    result.evidenceRefs.every((ref) => report.artifacts.some((a) => a.id === ref && a.available)),
  ).toBe(true)
  for (const artifact of report.artifacts.filter((a) => result.evidenceRefs.includes(a.id))) {
    const bytes = await readFile(await artifactPath(artifact.id))
    if (artifact.type === 'screenshot')
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    if (artifact.type === 'image-resource') {
      const resource = JSON.parse(bytes.toString())
      expect(Buffer.from(resource.bytes, 'base64')).toEqual(imagePng)
      expect(resource.sha256).toBe(createHash('sha256').update(imagePng).digest('hex'))
    }
  }
  expect(report.artifacts.filter((a) => a.type === 'screenshot')).toHaveLength(2)
  expect(report.artifacts.filter((a) => a.type === 'image-resource')).toHaveLength(2)
  expect(imageRequests).toBe(1)
  expect(imageShapeDistortionRule.enabled).toBe(false)
  await retainCaretEvidence('static-binding', {
    batch,
    result,
    after,
    records: await caretRecords(),
  })
})

it.each(['target', 'unrelated'] as const)(
  'caret-safe binding still rejects real %s DOM changes',
  async (kind) => {
    html = image().replace('height:60px', 'height:120px') + editors
    const candidate = (await discover()).candidates[0]!
    expect(candidate.status).toBe('facts-ready')
    await watchCaretMutations()
    if (kind === 'target')
      await worker.page.locator('#mark').evaluate((img: HTMLImageElement) => {
        img.style.width = '260px'
      })
    else
      await worker.page.locator('#editable').evaluate((el) => {
        el.setAttribute('title', 'Synthetic unrelated page update')
      })
    const result = await experiment.check(review(candidate))
    expect(result.verdict).toBe('unknown')
    expect(result.actual).toContain('observation-facts-changed')
    const after = (await readImagePaintFacts(worker.page, ['#mark']))[0]!
    expect(after.nodeId).toBe(candidate.measured.paint!.nodeId)
    expect(after.mutationEpoch).toBeGreaterThan(candidate.measured.paint!.mutationEpoch!)
    expect(after.contentWidth).toBe(
      kind === 'target' ? 260 : candidate.measured.paint!.contentWidth,
    )
    const records = await caretRecords()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      target: kind === 'target' ? 'mark' : 'editable',
      attribute: kind === 'target' ? 'style' : 'title',
    })
    expect(imageRequests).toBe(1)
    expect(await getFindings(runId)).toHaveLength(0)
    await retainCaretEvidence(`changed-${kind}`, { candidate, after, records, result })
  },
)

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

const diagnosticRequest = (c: ImageBindingCandidate) => ({
  candidateId: c.candidateId,
  observationId: c.observationId,
})
it('diagnostic: valid machines need no semantic statement and cause no page actions', async () => {
  html = image().replace('height:60px', 'height:120px') + editors
  await worker.page.goto(origin + '/page')
  await watchCaretMutations()
  const batch = await experiment.observe(),
    candidate = batch.candidates[0]!
  const diagnosis = await experiment.diagnose(diagnosticRequest(candidate))
  expect(diagnosis.sections.identity.status).toBe('available')
  expect(diagnosis.sections.resource.status).toBe('available')
  expect(diagnosis.sections.paint.status).toBe('available')
  expect(diagnosis.sections.evidence.status).toBe('available')
  expect(diagnosis.sections.machineBinding.status).toBe('available')
  expect(diagnosis.sections.semantics.status).toBe('unknown')
  expect(diagnosis.consumption).toMatchObject({
    canConsumeNow: false,
    checkInvoked: false,
    ruleEvaluated: false,
    actualInputGateReasons: ['missing-or-invalid-explicit-basis'],
  })
  expect(diagnosis.lifecycle).toMatchObject({
    candidateReplaced: false,
    newCandidateId: null,
    freshReadPerformed: true,
  })
  expect(candidate.pending.basis.confirmedBy).toBeNull()
  expect(await caretRecords()).toEqual([])
  expect(imageRequests).toBe(1)
  expect(writes).toBe(0)
  expect((await getEvents(runId)).some((e) => e.type === 'rule:evaluated')).toBe(false)
  expect(await getFindings(runId)).toHaveLength(0)
  await retainCaretEvidence('diagnostic-valid', {
    batch,
    diagnosis,
    imageRequests,
    writes,
    mutations: await caretRecords(),
  })
})
it('diagnostic: a replaced target is not rebound, and a closed session is immutable', async () => {
  const candidate = (await discover()).candidates[0]!
  await worker.page.locator('img').evaluate((img) => img.replaceWith(img.cloneNode(true)))
  const diagnosis = await experiment.diagnose(diagnosticRequest(candidate))
  expect(diagnosis.sections.identity.status).toBe('unavailable')
  expect(diagnosis.sections.resource.status).toBe('available')
  expect(diagnosis.sections.machineBinding.reasons).toContain('target-lost-or-ambiguous')
  expect(diagnosis.sections.identity.facts.current!.nodeId).not.toBe(
    diagnosis.sections.identity.facts.source!.nodeId,
  )
  expect(diagnosis.lifecycle.confirmationTransferred).toBe(false)
  const check = await experiment.check(review(candidate))
  expect(check.actual).toContain('target-lost-or-ambiguous')
  await experiment.close()
  const count = (await getEvents(runId)).length
  const closed = await experiment.diagnose(diagnosticRequest(candidate))
  expect(closed.artifactRef).toBeNull()
  expect(closed.sections.machineBinding.reasons).toContain('session-closed')
  expect((await getEvents(runId)).length).toBe(count)
  await retainCaretEvidence('diagnostic-replaced', { candidate, diagnosis, check, closed })
})
it('diagnostic: denied target image has a direct request receipt and no invented SHA', async () => {
  html = image().replace('/image.png', 'http://127.0.0.1:54321/image.png')
  const host = await openImageBindingExperiment({
    entryUrl: origin + '/page',
    trustedOrigins: [origin],
  })
  try {
    const batch = await host.observe(),
      diagnosis = await host.diagnose(diagnosticRequest(batch.candidates[0]!))
    expect(diagnosis.sections.resource.status).toBe('unavailable')
    expect(diagnosis.sections.resource.facts.current?.resource).toBeNull()
    expect(diagnosis.sections.network.facts.directResourceDenials).toHaveLength(1)
    expect(diagnosis.sections.network.facts.directResourceDenials[0]!.payload.url).toBe(
      'http://127.0.0.1:54321/image.png',
    )
    expect(diagnosis.sections.network.facts.targetImpact).toBe('unknown')
    expect(diagnosis.sections.machineBinding.reasons).toContain('evidence-intervened')
    expect(imageRequests).toBe(0)
    await retainCaretEvidence('diagnostic-image-denied', { batch, diagnosis }, host.runId)
  } finally {
    await host.close()
    await rm(`data/artifacts/${host.runId}`, { recursive: true, force: true })
  }
})
it('diagnostic: verified image does not excuse another denied request or repeat business work', async () => {
  html = image() + '<script>fetch("/diagnostic-test-read",{method:"POST"}).catch(()=>{})</script>'
  const host = await openImageBindingExperiment({
    entryUrl: origin + '/page',
    trustedOrigins: [origin],
  })
  try {
    const batch = await host.observe(),
      c = batch.candidates[0]!
    const first = await host.diagnose(diagnosticRequest(c)),
      second = await host.diagnose(diagnosticRequest(c))
    for (const d of [first, second]) {
      expect(d.sections.resource.status).toBe('available')
      expect(d.sections.network.status).toBe('unavailable')
      expect(d.sections.network.facts.directResourceDenials).toHaveLength(0)
      expect(d.sections.network.facts.otherDenials).toHaveLength(1)
      expect(d.sections.network.facts.targetImpact).toBe('unknown')
      expect(d.sections.machineBinding.reasons).toContain('evidence-intervened')
    }
    expect(first.sections.network.facts.otherDenials[0]!.id).toBe(
      second.sections.network.facts.otherDenials[0]!.id,
    )
    expect(imageRequests).toBe(1)
    expect(writes).toBe(0)
    expect((await host.check(review(c))).actual).toContain('evidence-intervened')
    await retainCaretEvidence(
      'diagnostic-other-denied',
      { batch, first, second, imageRequests, writes },
      host.runId,
    )
  } finally {
    await host.close()
    await rm(`data/artifacts/${host.runId}`, { recursive: true, force: true })
  }
})
it('diagnostic: synthetic contract consumption and evidence/expiry/supersession gates remain intact', async () => {
  const candidate = (await discover()).candidates[0]!
  const diagnosis = await experiment.diagnose(diagnosticRequest(candidate))
  const checked = await experiment.check(review(candidate))
  expect(checked.verdict).toBe('fail') // existing stretched circular fixture contract
  const path = await artifactPath(candidate.measured.evidenceRefs[0]!)
  await writeFile(path, 'modified evidence')
  const changed = await experiment.diagnose(diagnosticRequest(candidate))
  expect(changed.sections.evidence.status).toBe('unavailable')
  expect(changed.sections.machineBinding.reasons).toContain('evidence-changed')
  time += 5 * 60 * 1000
  const expired = await experiment.diagnose(diagnosticRequest(candidate))
  expect(expired.sections.machineBinding.reasons).toContain('evidence-expired')
  const fresh = await experiment.observe()
  const superseded = await experiment.diagnose(diagnosticRequest(candidate))
  expect(superseded.sections.machineBinding.reasons).toContain('unknown-or-superseded-candidate')
  expect(superseded.lifecycle.freshReadPerformed).toBe(false)
  expect(fresh.observationId).not.toBe(candidate.observationId)
  expect(imageShapeDistortionRule.enabled).toBe(false)
  await retainCaretEvidence('diagnostic-gates', {
    candidate,
    diagnosis,
    checked,
    changed,
    expired,
    superseded,
    newObservationId: fresh.observationId,
  })
})
it('diagnostic: interactive CLI consumes only selected IDs, without a review file', async () => {
  html = image() + editors
  const root = await mkdtemp(join(tmpdir(), 'image-diagnostic-cli-')),
    output = join(root, 'experiment')
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
      if (stdout.includes('Review candidates')) resolve()
    })
    child.once('exit', () => reject(Error(stderr + stdout)))
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
    child.stdin.end('diagnose ' + batch.candidates[0].candidateId + '\nquit\n')
    expect(await completed, stderr + stdout).toBe(0)
    const diagnosis = JSON.parse(await readFile(join(output, 'diagnosis-2.json'), 'utf8'))
    expect(diagnosis.sections.machineBinding.status).toBe('available')
    expect(diagnosis.consumption.ruleEvaluated).toBe(false)
    expect(diagnosis.request.observationId).toBe(batch.observationId)
    expect(imageRequests).toBe(1)
    expect(writes).toBe(0)
    if (process.env.IMAGE_CARET_EVIDENCE_DIR) {
      const dest = resolve(process.env.IMAGE_CARET_EVIDENCE_DIR, 'diagnostic-cli')
      await cp(output, dest, { recursive: true })
      await cp(resolve('data/artifacts', cliRunId), join(dest, 'artifacts'), { recursive: true })
      await writeFile(join(dest, 'stdout.log'), stdout)
    }
  } finally {
    clearTimeout(deadline)
    child.kill()
    await completed
    await rm(root, { recursive: true, force: true })
    if (cliRunId) await rm(resolve('data/artifacts', cliRunId), { recursive: true, force: true })
  }
})
