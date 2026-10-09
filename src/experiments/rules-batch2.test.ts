import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest'
import { createServer } from 'node:http'
import { mkdtemp, readFile, mkdir, copyFile, writeFile, rm, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { launchBrowser, type BrowserWorker } from '../execution/browser.ts'
import { createRun, getEvents, getFindings } from '../execution/run-manager.ts'
import { installUiNetworkSession } from '../execution/network/session.ts'
import { createNetworkPolicy } from '../inspection/network-policy.ts'
import { createEvidenceIntegrity } from '../execution/evidence-integrity.ts'
import { getDbClient } from '../storage/database.ts'
import { buildReport } from '../server/reports/run-report.ts'
import { createRulesBatch2Experiment } from './rules-batch2.ts'
import {
  createControlTextDisappearanceRule,
  controlTextDisappearanceRule,
  type ControlTextReceipt,
} from '../rules/builtin/control-text-disappearance.ts'
import type { PageSnapshot } from '../rules/types.ts'
import { imagePng } from '../../evaluation/fixtures/image-shape.ts'

let origin = '',
  html = '',
  runId = '',
  worker: BrowserWorker,
  session: ReturnType<typeof createRulesBatch2Experiment>,
  integrity: ReturnType<typeof createEvidenceIntegrity>,
  requests = 0,
  writes = 0
let network: Awaited<ReturnType<typeof installUiNetworkSession>>
const style =
  '<style>html{background:#fff}body{margin:20px}button,a{display:block;appearance:none;border:0;border-radius:0;padding:8px;width:210px;height:40px;box-sizing:border-box;margin:8px 0;background:#fff;color:#000;font:16px Arial;text-decoration:none}img{width:80px;height:40px}</style>'
const control = (id: string, css = '', attrs = '') =>
  `<button id="${id}" style="${css}" ${attrs}>Continue ${id}</button>`
const server = createServer((req, res) => {
  if (req.method !== 'GET') {
    writes++
    res.end('unexpected')
    return
  }
  if (req.url === '/ok.png') {
    requests++
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' }).end(imagePng)
  } else if (req.url === '/broken.png') {
    requests++
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found')
  } else if (req.url === '/bad.png') {
    requests++
    res.writeHead(200, { 'content-type': 'image/png' }).end('not an image')
  } else if (req.url === '/slow.png') {
    requests++ /* A real pending local response, closed at teardown. */
  } else if (req.url === '/favicon.ico') res.writeHead(204).end()
  else
    res
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      .end('<!doctype html><title>Synthetic batch2 fixture; not Jira</title>' + style + html)
})
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((r) => server.close(() => r()))
})
beforeEach(async () => {
  html = ''
  requests = 0
  writes = 0
  runId = (
    await createRun({
      goal: 'Synthetic batch2 limited checks; no acceptance claim',
      environmentId: 'test',
      entryUrl: origin + '/page',
    })
  ).id
  worker = await launchBrowser({ uiScan: true, collectImageResources: true })
  integrity = createEvidenceIntegrity()
  network = await installUiNetworkSession({
    page: worker.page,
    context: worker.context,
    policy: createNetworkPolicy({
      entryUrl: origin + '/page',
      resourceOrigins: [],
      dataOrigins: [],
      reachableOrigins: [origin],
    }),
    onDecision: (d) => {
      if (!d.allow && !d.finalizationShutdown)
        integrity.intervene({ kind: 'network-denied', url: d.url, method: d.method })
    },
  })
  session = createRulesBatch2Experiment({
    page: worker.page,
    runId,
    evidenceIntegrity: integrity.snapshot,
  })
})
afterEach(async () => {
  await session.close()
  network.seal()
  await worker.close()
  await network.settle()
  await rm(resolve('data/artifacts', runId), { recursive: true, force: true })
})
async function visit() {
  await worker.page.goto(origin + '/page', { waitUntil: 'domcontentloaded' })
}
async function owned(ref: string) {
  const r = await getDbClient().execute({
    sql: 'SELECT file_path FROM artifacts WHERE id=? AND run_id=?',
    args: [ref, runId],
  })
  return readFile(String(r.rows[0]!.file_path))
}
async function retain(name: string, result: unknown) {
  if (!process.env.BATCH2_EVIDENCE_DIR) return
  const dir = resolve(process.env.BATCH2_EVIDENCE_DIR, name)
  await mkdir(dir, { recursive: true })
  const rows = await getDbClient().execute({
    sql: 'SELECT id,type,file_path FROM artifacts WHERE run_id=?',
    args: [runId],
  })
  const artifacts = []
  for (const r of rows.rows) {
    const dest = join(dir, String(r.id))
    await copyFile(String(r.file_path), dest)
    const b = await readFile(dest)
    artifacts.push({
      id: r.id,
      type: r.type,
      path: dest,
      bytes: b.length,
      sha256: createHash('sha256').update(b).digest('hex'),
    })
  }
  await writeFile(
    join(dir, 'receipt.json'),
    JSON.stringify(
      {
        runId,
        result,
        requests,
        writes,
        artifacts,
        events: await getEvents(runId),
        report: await buildReport(runId),
      },
      null,
      2,
    ),
  )
}
function textRows(r: Awaited<ReturnType<typeof session.capture>>) {
  return r.result.details.rows as {
    selector: string
    verdict: string
    reason: string
    fact: { issues: string[] }
  }[]
}
it('batch2: native text disappearance, alpha composition, healthy names and disabled exception', async () => {
  html =
    control('white', 'color:white') +
    control('alpha', 'color:rgba(0,0,0,0)') +
    control('healthy') +
    '<a id="link" href="/next">Open docs</a>' +
    control('disabled', 'color:white', 'disabled') +
    control('near', 'color:rgb(254,254,254)')
  await visit()
  const result = await session.capture()
  const rows = textRows(result)
  const verdict = (id: string) => rows.find((r) => r.selector === '#' + id)!
  expect(verdict('white'), JSON.stringify(rows)).toMatchObject({ verdict: 'fail' })
  expect(verdict('alpha')).toMatchObject({ verdict: 'fail' })
  expect(verdict('healthy')).toMatchObject({ verdict: 'pass' })
  expect(verdict('link')).toMatchObject({ verdict: 'pass' })
  expect(verdict('disabled')).toMatchObject({ verdict: 'not-applicable' })
  for (const id of ['near']) expect(verdict(id)).toMatchObject({ verdict: 'unknown' })
  expect(result.result.verdict).toBe('fail')
  expect(controlTextDisappearanceRule.enabled).toBe(false)
  const report = await buildReport(runId)
  expect(report!.evaluations).toHaveLength(1)
  expect((await getFindings(runId))[0]?.ruleId).toBe('control-text-disappearance')
  expect(report!.artifacts.some((a) => a.type === 'image-fallback-review' && a.available)).toBe(
    true,
  )
  expect(result.review.ruleEvaluated).toBe(false)
  expect(writes).toBe(0)
  await retain('text-matrix', result)
})
it('batch2: shadows, strokes, gradients and pseudo expression are unsupported rather than defects', async () => {
  html =
    control('shadow', 'color:white;text-shadow:1px 1px black') +
    control('stroke', 'color:white;-webkit-text-stroke:1px black') +
    control('gradient', 'color:white;background:linear-gradient(black,white)') +
    '<style>#pseudo::first-letter{color:blue;background:yellow}</style>' +
    control('pseudo', 'color:white')
  await visit()
  const result = await session.capture()
  expect(textRows(result).every((r) => r.verdict === 'unknown')).toBe(true)
  expect(textRows(result).find((r) => r.selector === '#shadow')!.fact.issues).toContain(
    'stroke-shadow-or-decoration',
  )
  expect(textRows(result).find((r) => r.selector === '#pseudo')!.fact.issues).toContain(
    'pseudo-text-style',
  )
  expect(await getFindings(runId)).toHaveLength(0)
  await retain('text-effects', result)
})
it('batch2: transparent backgrounds compose, alternative paint and duplicate targets stay unknown', async () => {
  html =
    '<div style="background:black"><button id="layer" style="background:rgba(255,255,255,0);color:black">Layer action</button></div>' +
    control('covered', 'position:relative;color:white') +
    '<div style="position:absolute;left:20px;top:76px;width:210px;height:40px;background:white;pointer-events:none"></div>' +
    '<button id="icon"><span>★</span>Action</button>' +
    control('same') +
    control('same')
  await visit()
  const result = await session.capture()
  const rows = textRows(result)
  expect(
    rows.find((r) => r.selector === '#layer'),
    JSON.stringify(rows),
  ).toMatchObject({ verdict: 'fail' })
  expect(rows.find((r) => r.selector === '#covered')).toMatchObject({ verdict: 'unknown' })
  expect(rows.find((r) => r.selector === '#icon')).toMatchObject({ verdict: 'unknown' })
  expect(rows.filter((r) => r.selector === '#same').every((r) => r.verdict === 'unknown')).toBe(
    true,
  )
  const saved = JSON.parse((await owned(result.receiptRef)).toString())
    .receipt as ControlTextReceipt
  const rule = createControlTextDisappearanceRule(saved)
  const context = {
    runId,
    currentUrl: saved.dom.url,
    pageTitle: 'fixture',
    timestamp: saved.expiresAt,
    events: [],
    snapshot: {
      url: saved.dom.url,
      title: 'fixture',
      viewport: saved.dom.viewport,
      elements: [],
      screenshotPath: saved.screenshotRef,
      evidenceIntegrity: saved.evidenceIntegrity,
    } as PageSnapshot,
  }
  expect((await rule.evaluate(context)).actual).toContain('evidence-expired')
  expect(
    (await rule.evaluate({ ...context, timestamp: saved.observedAt, runId: 'different-run' }))
      .actual,
  ).toContain('receipt-context-mismatch')
  await retain('text-boundaries', result)
})
it('batch2: image failure, absent source, loaded image and explicit presentation form review materials only', async () => {
  html =
    '<section><img id="broken" src="/broken.png" alt="A name"><span>Public name</span><img id="alternative" src="/ok.png" alt="Generic pattern"></section><section><img id="absent"><span>Text can be enough</span></section><img id="presentation" role="presentation" alt="" src="/broken.png"><img id="bad" src="/bad.png">'
  await visit()
  await worker.page.waitForLoadState('load')
  const result = await session.capture()
  const rows = result.review.rows
  const row = (id: string) => rows.find((r) => r.selector === '#' + id)!
  expect(row('broken')).toMatchObject({
    resourceState: 'http-failed',
    disposition: 'review-needed',
    association: { identityEquivalence: 'unknown' },
  })
  expect(row('broken').measured.image?.nearby.map((n) => n.text)).toContain('Public name')
  expect(row('broken').measured.image?.alternatives).toHaveLength(1)
  expect(row('alternative')).toMatchObject({
    resourceState: 'loaded',
    disposition: 'not-applicable',
  })
  expect(row('absent')).toMatchObject({
    resourceState: 'source-absent',
    disposition: 'review-needed',
  })
  expect(row('presentation')).toMatchObject({ disposition: 'not-applicable' })
  expect(row('bad')).toMatchObject({
    resourceState: 'load-or-decode-failed',
    disposition: 'review-needed',
  })
  expect(result.review.confirmedDefects).toBe(0)
  expect(result.review.healthyPasses).toBe(0)
  expect(await getFindings(runId)).toHaveLength(0)
  expect((await getEvents(runId)).filter((e) => e.type === 'review:recorded')).toHaveLength(1)
  expect(
    (await buildReport(runId))!.evaluations.every(
      (e) => (e as Record<string, unknown>).ruleId !== 'image-fallback-review',
    ),
  ).toBe(true)
  await retain('image-states', result)
})
it('batch2: loading and deferred lazy images do not become missing-image defects', async () => {
  html =
    '<img id="pending" src="/slow.png"><img id="lazy" loading="lazy" src="/ok.png" style="position:absolute;top:20000px">'
  await visit()
  const result = await session.capture()
  expect(result.review.rows.find((r) => r.selector === '#pending')).toMatchObject({
    resourceState: 'loading',
    disposition: 'unknown',
  })
  expect(result.review.rows.find((r) => r.selector === '#lazy')).toMatchObject({
    resourceState: 'lazy-no-request-observed',
    disposition: 'unknown',
  })
  expect(requests).toBe(1)
  expect(await getFindings(runId)).toHaveLength(0)
  await retain('image-deferred', result)
})
it('batch2: network intervention and DOM instability block both conclusions', async () => {
  html =
    control('white', 'color:white') +
    '<img id="denied" src="http://127.0.0.1:54321/no.png"><script>fetch("/write",{method:"POST"}).catch(()=>{})</script>'
  await visit()
  await worker.page.waitForLoadState('load')
  const result = await session.capture()
  expect(result.result.verdict).toBe('unknown')
  expect(result.result.actual).toContain('evidence-intervened')
  expect(result.review.rows[0]).toMatchObject({ disposition: 'unknown' })
  expect(result.review.rows[0]!.reasons).toContain('evidence-intervened-or-missing')
  expect(writes).toBe(0)
  expect(await getFindings(runId)).toHaveLength(0)
  // Reuse captured machine facts; changing only the host's stability receipt never allows a fail.
  const saved = JSON.parse((await owned(result.receiptRef)).toString())
    .receipt as ControlTextReceipt
  const changed = createControlTextDisappearanceRule({
    ...saved,
    stable: false,
    evidenceIntegrity: { version: 1, status: 'clean', interventionIds: [] },
  })
  const verdict = await changed.evaluate({
    runId,
    currentUrl: saved.dom.url,
    pageTitle: 'fixture',
    timestamp: saved.observedAt,
    events: [],
    snapshot: {
      url: saved.dom.url,
      title: 'fixture',
      viewport: saved.dom.viewport,
      elements: [],
      screenshotPath: saved.screenshotRef,
      evidenceIntegrity: { version: 1, status: 'clean', interventionIds: [] },
    },
  })
  expect(verdict.actual).toContain('observation-changed')
  await retain('intervention', { result, syntheticStabilityGate: verdict })
})
it('batch2: node replacement during capture invalidates both fresh fact sets', async () => {
  html = control('target', 'color:white') + '<img id="missing">'
  await visit()
  const screenshot = worker.page.screenshot.bind(worker.page)
  worker.page.screenshot = async (options) => {
    await worker.page.locator('#target').evaluate((el) => el.replaceWith(el.cloneNode(true)))
    await worker.page.locator('#missing').evaluate((el) => el.replaceWith(el.cloneNode(true)))
    return screenshot(options)
  }
  const result = await session.capture()
  worker.page.screenshot = screenshot
  expect(result.result.verdict).toBe('unknown')
  expect(result.result.actual).toContain('observation-changed')
  expect(result.review.rows[0]!.disposition).toBe('unknown')
  expect(result.review.rows[0]!.reasons).toContain('observation-changed')
  const raw = JSON.parse((await owned(result.receiptRef)).toString()).receipt as ControlTextReceipt
  expect(raw.stable).toBe(false)
  expect(await getFindings(runId)).toHaveLength(0)
  await retain('node-replaced', result)
})
it('batch2: one-shot CLI exports ordinary report and separate review without a contract', async () => {
  html = control('white', 'color:white') + '<img src="/broken.png">'
  const root = await mkdtemp(join(tmpdir(), 'batch2-cli-')),
    output = join(root, 'out')
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/experiments/rules-batch2.ts',
      '--url',
      origin + '/page',
      '--out',
      output,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, URL_SCAN_TRUSTED_ORIGINS: origin },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let stdout = '',
    stderr = '',
    cliRunId = ''
  child.stdout.on('data', (b) => (stdout += b))
  child.stderr.on('data', (b) => (stderr += b))
  const completed = new Promise<number | null>((r, j) => {
    child.once('exit', r)
    child.once('error', j)
  })
  const timer = setTimeout(() => child.kill(), 20000)
  try {
    expect(await completed, stderr).toBe(0)
    const result = JSON.parse(await readFile(join(output, 'batch2.json'), 'utf8'))
    cliRunId = result.runId
    const report = JSON.parse(await readFile(join(output, 'report.json'), 'utf8'))
    expect(result.result.verdict).toBe('fail')
    expect(result.review.ruleEvaluated).toBe(false)
    expect(report.evaluations).toHaveLength(1)
    expect(report.artifacts.some((a: { type: string }) => a.type === 'image-fallback-review')).toBe(
      true,
    )
    expect(
      report.events.some(
        (e: { type: string; payload: Record<string, unknown> }) =>
          e.type === 'run:completed' && e.payload.acceptanceClaim === false,
      ),
    ).toBe(true)
    if (process.env.BATCH2_EVIDENCE_DIR) {
      const dest = resolve(process.env.BATCH2_EVIDENCE_DIR, 'cli')
      await cp(output, dest, { recursive: true })
      await cp(resolve('data/artifacts', cliRunId), join(dest, 'artifacts'), { recursive: true })
      await writeFile(join(dest, 'stdout.log'), stdout)
    }
  } finally {
    clearTimeout(timer)
    child.kill()
    await completed
    await rm(root, { recursive: true, force: true })
    if (cliRunId) await rm(resolve('data/artifacts', cliRunId), { recursive: true, force: true })
  }
})
