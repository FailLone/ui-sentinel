import { afterEach, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { launchBrowser, type BrowserWorker } from '../browser.ts'
import { createNetworkPolicy } from '../../inspection/network-policy.ts'
import { installUiNetworkSession, type NetworkDecisionRecord } from './session.ts'
import { createBodyBudget, readPinnedResponse } from './transport.ts'

const servers: Server[] = []
const workers: BrowserWorker[] = []
afterEach(async () => {
  await Promise.all(workers.splice(0).map((w) => w.close()))
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((r) => {
          s.closeAllConnections()
          s.close(() => r())
        }),
    ),
  )
})
async function serve(
  handler: (
    request: import('node:http').IncomingMessage,
    response: import('node:http').ServerResponse,
  ) => void,
) {
  const s = createServer(handler as any)
  servers.push(s)
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  return `http://127.0.0.1:${(s.address() as any).port}`
}
async function session(
  entry: string,
  dependencies: { resources?: string[]; data?: string[] } = {},
  scope = { maxPages: 3, maxDepth: 1 },
  limits = {},
) {
  const worker = await launchBrowser({ uiScan: true })
  workers.push(worker)
  const decisions: NetworkDecisionRecord[] = []
  const network = await installUiNetworkSession({
    context: worker.context,
    page: worker.page,
    policy: createNetworkPolicy({
      entryUrl: entry,
      resourceOrigins: dependencies.resources ?? [],
      dataOrigins: dependencies.data ?? [],
      reachableOrigins: [
        new URL(entry).origin,
        ...(dependencies.resources ?? []),
        ...(dependencies.data ?? []),
      ],
    }),
    scope,
    limits,
    onDecision: (d) => decisions.push(d),
  })
  return { ...worker, decisions, network }
}
it('keeps CDP data and resource grants separate in the actual browser', async () => {
  let hits = 0
  const dependency = await serve((_q: any, r: any) => {
    hits++
    r.writeHead(200, { 'access-control-allow-origin': '*' }).end('data')
  })
  const entry = await serve((_q: any, r: any) => r.end('<p>entry</p>'))
  for (const grant of ['resources', 'data'] as const) {
    const w = await session(entry, { [grant]: [dependency] })
    await w.page.goto(entry)
    const before = hits
    const ok = await w.page.evaluate(
      async (url) =>
        fetch(url)
          .then((r) => r.text())
          .catch(() => null),
      dependency + '/data',
    )
    expect(ok).toBe(grant === 'data' ? 'data' : null)
    expect(hits - before).toBe(grant === 'data' ? 1 : 0)
  }
})
it('opens the vetted socket without resolving the hostname again, preserving Host', async () => {
  let host = ''
  const entry = await serve((q: any, r: any) => {
    host = q.headers.host
    r.end('pinned')
  })
  const url = new URL(entry)
  url.hostname = 'does-not-resolve.invalid'
  const response = await readPinnedResponse({
    url: url.href,
    address: '127.0.0.1',
    method: 'GET',
    headers: {},
    budget: createBodyBudget(1024, 1024),
    signal: new AbortController().signal,
  })
  expect(response.body.toString()).toBe('pinned')
  expect(host).toBe(url.host)
})
it('applies page limits to script navigation before the destination server sees a request', async () => {
  const paths: string[] = []
  const entry = await serve((q: any, r: any) => {
    paths.push(q.url)
    r.end('<p>entry</p>')
  })
  const w = await session(entry, {}, { maxPages: 1, maxDepth: 0 })
  await w.page.goto(entry)
  await w.page.evaluate(() => {
    location.href = '/extra/deep'
  })
  await w.page.waitForTimeout(150)
  expect(paths).not.toContain('/extra/deep')
  expect(w.decisions.some((d) => !d.allow && d.reasonCode === 'outside-navigation-scope')).toBe(
    true,
  )
})
it('shares the response budget across parallel reads and never supplies a partial successful body', async () => {
  const entry = await serve((q: any, r: any) =>
    r.end(q.url === '/' ? '<p>entry</p>' : 'x'.repeat(400)),
  )
  const w = await session(
    entry,
    {},
    { maxPages: 3, maxDepth: 1 },
    { maxResponseBytes: 1024, maxTotalBytes: 512 },
  )
  await w.page.goto(entry)
  const sizes = await w.page.evaluate(() =>
    Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        fetch('/body?i=' + i)
          .then((r) => r.text())
          .then((b) => b.length)
          .catch(() => 0),
      ),
    ),
  )
  expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(512)
  expect(sizes.every((n) => n === 0 || n === 400)).toBe(true)
  expect(w.decisions.some((d) => !d.allow && d.reasonCode === 'response-budget-exhausted')).toBe(
    true,
  )
})
it('rejects chunked overflow and cancels an endless response within its deadline', async () => {
  const entry = await serve((q: any, r: any) => {
    r.writeHead(200)
    r.write('x'.repeat(q.url === '/huge' ? 2048 : 1))
    if (q.url === '/huge') r.end()
  })
  await expect(
    readPinnedResponse({
      url: entry + '/huge',
      address: '127.0.0.1',
      method: 'GET',
      headers: {},
      budget: createBodyBudget(128, 256),
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow('response-budget-exhausted')
  await expect(
    readPinnedResponse({
      url: entry + '/forever',
      address: '127.0.0.1',
      method: 'GET',
      headers: {},
      budget: createBodyBudget(128, 256),
      signal: new AbortController().signal,
      timeoutMs: 50,
    }),
  ).rejects.toThrow('transport-error')
})
it('denies direct popup and worker network paths at the browser egress barrier', async () => {
  let targetHits = 0
  const target = await serve((_q: any, r: any) => {
    targetHits++
    r.end('target')
  })
  const entry = await serve((_q: any, r: any) => r.end('<p>entry</p>'))
  const w = await session(entry)
  await w.page.goto(entry)
  await w.page.evaluate((url) => {
    window.open(url)
    const script = `fetch(${JSON.stringify(url)}).catch(()=>{})`
    new Worker(URL.createObjectURL(new Blob([script], { type: 'text/javascript' })))
  }, target)
  await w.page.waitForTimeout(200)
  expect(targetHits).toBe(0)
})

it('prevents hash and history routes from committing beyond the navigation scope', async () => {
  const entry = await serve((_q, r) => r.end('<p>entry</p>'))
  const w = await session(entry, {}, { maxPages: 1, maxDepth: 0 })
  await w.page.goto(entry)
  await w.page.evaluate(() => {
    location.hash = 'other'
  })
  await w.page.waitForTimeout(80)
  expect(w.page.url()).toBe(entry + '/')
  await w.page
    .evaluate(() => {
      history.pushState({}, '', '/route?x=1')
    })
    .catch(() => {})
  await w.page.waitForTimeout(80)
  expect(w.page.url()).toBe(entry + '/')
  expect(
    w.decisions.filter((d) => !d.allow && d.requestId.startsWith('route:')).length,
  ).toBeGreaterThanOrEqual(2)
})
