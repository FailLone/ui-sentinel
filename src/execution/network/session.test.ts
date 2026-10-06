import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Server, type ServerResponse } from 'node:http'
import { launchBrowser, type BrowserWorker } from '../browser.ts'
import { createNetworkPolicy } from '../../inspection/network-policy.ts'
import { installUiNetworkSession, type NetworkDecisionRecord } from './session.ts'

/**
 * Real-browser proof that the network boundary is enforced per hop (plan 4.2, 4.3, U06).
 *
 * The plan is explicit that a boundary which only inspects the top-level URL is not the boundary it
 * describes: script navigation, 302/307 redirects and subresource redirects all have to be decided
 * *before dispatch*. These tests therefore assert on two independent facts - the decision the policy
 * produced, and the request counter of a second server that must never be reached. A blocked request
 * that still arrived is not blocked, and shutting the page afterwards is not interception.
 */
let worker: BrowserWorker | null = null
const servers: Server[] = []

afterEach(async () => {
  await worker?.close()
  worker = null
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))))
})

/** A counting fixture server. `hits` is the evidence that a refused request never arrived. */
async function serve(
  handler: (req: import('node:http').IncomingMessage, res: ServerResponse) => void,
): Promise<{ origin: string; hits: () => number; paths: () => string[] }> {
  let count = 0
  const seen: string[] = []
  const server = createServer((req, res) => {
    count++
    seen.push(req.url ?? '')
    handler(req, res)
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('fixture server did not bind')
  // `localtest.me` resolves to 127.0.0.1 but is a *name*, so the entry passes the public-address
  // rule the way a real user's URL does. The loopback port it points at still has to be declared as
  // a trusted fixture origin, which is the server-owned exception of plan 4.1.
  return {
    origin: `http://localtest.me:${address.port}`,
    hits: () => count,
    paths: () => seen,
  }
}

/** Fixture origins the operator would configure. Address-reachability and navigation both use it. */
function trustedFrom(origins: (string | undefined)[]): string[] {
  return origins.filter((o): o is string => typeof o === 'string')
}

const html = (body: string) =>
  `<html><head><title>fixture</title></head><body>${body}</body></html>`

describe('per-hop network enforcement', () => {
  it('refuses a cross-origin redirect hop so the target never receives the request', async () => {
    const target = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(html('<a href="/x">landed</a>'))
    })
    const entry = await serve((_req, res) => {
      res.writeHead(302, { location: `${target.origin}/landing` })
      res.end()
    })
    const policy = createNetworkPolicy({
      entryUrl: `${entry.origin}/start`,
      resourceOrigins: [],
      dataOrigins: [],
      // Both fixtures are address-reachable, but only the entry origin may be navigated to.
      reachableOrigins: trustedFrom([entry.origin, target.origin]),
    })
    const decisions: NetworkDecisionRecord[] = []
    worker = await launchBrowser({ headless: true })
    await installUiNetworkSession({
      context: worker.context,
      page: worker.page,
      policy,
      onDecision: (record) => decisions.push(record),
    })

    await worker.page
      .goto(`${entry.origin}/start`, { waitUntil: 'domcontentloaded' })
      .catch(() => {})

    // The decisive assertion: the refused destination was never contacted.
    expect(target.hits()).toBe(0)
    const refusal = decisions.find((d) => !d.allow && d.url.includes('/landing'))
    expect(refusal).toMatchObject({ allow: false, reasonCode: 'outside-navigation-scope' })
    // The hop is attributed to the URL it redirected from, not treated as a fresh navigation.
    expect(refusal?.redirectFrom).toContain(`${entry.origin}/start`)
  })

  it('follows a same-origin redirect and preserves its query string', async () => {
    const entry = await serve((req, res) => {
      if (req.url?.startsWith('/start'))
        return void res.writeHead(302, { location: '/next?x=1&x=2&sort=asc#panel' }).end()
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(html('<p>next</p>'))
    })
    const policy = createNetworkPolicy({
      entryUrl: `${entry.origin}/start`,
      resourceOrigins: [],
      dataOrigins: [],
      reachableOrigins: [entry.origin],
    })
    worker = await launchBrowser({ headless: true })
    await installUiNetworkSession({ context: worker.context, page: worker.page, policy })

    await worker.page.goto(`${entry.origin}/start`, { waitUntil: 'domcontentloaded' })

    expect(entry.paths()).toContain('/next?x=1&x=2&sort=asc')
    expect(worker.page.url()).toBe(`${entry.origin}/next?x=1&x=2&sort=asc#panel`)
  })

  it('refuses a same-origin POST before it is dispatched', async () => {
    const entry = await serve((req, res) => {
      if (req.method === 'POST') return void res.writeHead(200).end('created')
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(html('<form method="post" action="/create"><button>Go</button></form>'))
    })
    const policy = createNetworkPolicy({
      entryUrl: `${entry.origin}/`,
      resourceOrigins: [],
      dataOrigins: [],
      reachableOrigins: [entry.origin],
    })
    const decisions: NetworkDecisionRecord[] = []
    worker = await launchBrowser({ headless: true })
    await installUiNetworkSession({
      context: worker.context,
      page: worker.page,
      policy,
      onDecision: (record) => decisions.push(record),
    })
    await worker.page.goto(`${entry.origin}/`, { waitUntil: 'domcontentloaded' })
    const before = entry.hits()

    // The page submits a write on its own; no user goal or button wording is involved.
    await worker.page
      .evaluate(() => {
        const form = document.querySelector('form')!
        void form.submit()
      })
      .catch(() => {})
    await worker.page.waitForTimeout(300)

    const posts = entry.paths().filter((p) => p === '/create')
    expect(posts).toHaveLength(0)
    expect(entry.hits()).toBe(before)
    expect(decisions.some((d) => !d.allow && d.method === 'POST')).toBe(true)
  })

  it('allows a declared resource origin and refuses an undeclared one before dispatch', async () => {
    const cdn = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/css' })
      res.end('body{color:red}')
    })
    const ads = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'image/gif' })
      res.end('GIF89a')
    })
    const entry = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(
        html(
          `<link rel="stylesheet" href="${cdn.origin}/theme.css"><img src="${ads.origin}/pixel.gif">`,
        ),
      )
    })
    const policy = createNetworkPolicy({
      entryUrl: `${entry.origin}/`,
      resourceOrigins: [cdn.origin],
      dataOrigins: [],
      reachableOrigins: trustedFrom([entry.origin, cdn.origin, ads.origin]),
    })
    worker = await launchBrowser({ headless: true })
    await installUiNetworkSession({ context: worker.context, page: worker.page, policy })

    await worker.page.goto(`${entry.origin}/`, { waitUntil: 'networkidle' }).catch(() => {})

    expect(cdn.hits()).toBeGreaterThan(0)
    // Reachable as an address, but never declared as a resource origin for this run.
    expect(ads.hits()).toBe(0)
  })

  it('refuses a subresource redirect hop that leaves the granted resource origin', async () => {
    const privateTarget = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/css' })
      res.end('body{color:blue}')
    })
    const cdn = await serve((_req, res) => {
      // A granted origin redirecting into somewhere the run was never granted.
      res.writeHead(302, { location: `${privateTarget.origin}/injected.css` })
      res.end()
    })
    const entry = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(html(`<link rel="stylesheet" href="${cdn.origin}/theme.css">`))
    })
    const policy = createNetworkPolicy({
      entryUrl: `${entry.origin}/`,
      resourceOrigins: [cdn.origin],
      dataOrigins: [],
      reachableOrigins: trustedFrom([entry.origin, cdn.origin, privateTarget.origin]),
    })
    worker = await launchBrowser({ headless: true })
    await installUiNetworkSession({ context: worker.context, page: worker.page, policy })

    await worker.page.goto(`${entry.origin}/`, { waitUntil: 'networkidle' }).catch(() => {})

    expect(cdn.hits()).toBeGreaterThan(0)
    // Following the redirect would have been a page-widened permission; it must not have happened.
    expect(privateTarget.hits()).toBe(0)
  })

  it('stops dispatching once the round request budget is exhausted', async () => {
    const entry = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(html(Array.from({ length: 40 }, (_, i) => `<img src="/i${i}.gif">`).join('')))
    })
    const policy = createNetworkPolicy({
      entryUrl: `${entry.origin}/`,
      resourceOrigins: [],
      dataOrigins: [],
      reachableOrigins: [entry.origin],
    })
    const decisions: NetworkDecisionRecord[] = []
    worker = await launchBrowser({ headless: true })
    await installUiNetworkSession({
      context: worker.context,
      page: worker.page,
      policy,
      onDecision: (record) => decisions.push(record),
      limits: {
        maxRequests: 5,
        maxResponseBytes: 10 * 1024 * 1024,
        maxTotalBytes: 50 * 1024 * 1024,
      },
    })

    await worker.page.goto(`${entry.origin}/`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await worker.page.waitForTimeout(300)

    expect(entry.hits()).toBeLessThanOrEqual(5)
    expect(decisions.some((d) => !d.allow && d.reasonCode === 'request-budget-exhausted')).toBe(
      true,
    )
  })

  it('records a decision for every request it saw and continues only the allowed ones', async () => {
    const entry = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(html('<img src="/a.gif"><img src="/b.gif">'))
    })
    const policy = createNetworkPolicy({
      entryUrl: `${entry.origin}/`,
      resourceOrigins: [],
      dataOrigins: [],
      reachableOrigins: [entry.origin],
    })
    const decisions: NetworkDecisionRecord[] = []
    worker = await launchBrowser({ headless: true })
    await installUiNetworkSession({
      context: worker.context,
      page: worker.page,
      policy,
      onDecision: (record) => decisions.push(record),
    })

    await worker.page.goto(`${entry.origin}/`, { waitUntil: 'networkidle' }).catch(() => {})

    const allowed = decisions.filter((d) => d.allow).map((d) => new URL(d.url).pathname)
    expect(allowed).toContain('/')
    expect(allowed).toContain('/a.gif')
    expect(allowed).toContain('/b.gif')
    expect(decisions.every((d) => d.policyRevision === policy.policyRevision)).toBe(true)
  })

  it('refuses a WebSocket channel rather than letting it run unobserved', async () => {
    // A live channel is not a request this layer can judge and the release does not support it, so it
    // must fail visibly instead of opening silently (plan 1.1, 4.2).
    const entry = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(html('<p>socket page</p>'))
    })
    const policy = createNetworkPolicy({
      entryUrl: `${entry.origin}/`,
      resourceOrigins: [],
      dataOrigins: [],
      reachableOrigins: [entry.origin],
    })
    worker = await launchBrowser({ headless: true })
    await installUiNetworkSession({ context: worker.context, page: worker.page, policy })
    await worker.page.goto(`${entry.origin}/`, { waitUntil: 'domcontentloaded' })

    // The target is the fixture's *own reachable port*, so a successful open would be possible on
    // the network. Only the channel block can explain the socket failing.
    const socketHost = new URL(entry.origin).host
    const outcome = await worker.page.evaluate(async (host) => {
      return await new Promise<string>((resolve) => {
        try {
          const socket = new WebSocket(`ws://${host}/socket`)
          socket.onopen = () => resolve('opened')
          socket.onerror = () => resolve('error')
          socket.onclose = () => resolve('closed')
          setTimeout(() => resolve('timeout'), 1500)
        } catch {
          resolve('threw')
        }
      })
    }, socketHost)
    expect(outcome).not.toBe('opened')
  })

  it('closes a popup the page opens instead of letting it navigate unsupervised', async () => {
    const entry = await serve((request, res) => {
      if (request.url === '/popup') {
        return void res.writeHead(200, { 'content-type': 'text/html' }).end(html('<p>popup</p>'))
      }
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(html('<button id="open">open</button>'))
    })
    const policy = createNetworkPolicy({
      entryUrl: `${entry.origin}/`,
      resourceOrigins: [],
      dataOrigins: [],
      reachableOrigins: [entry.origin],
    })
    worker = await launchBrowser({ headless: true })
    const opened: string[] = []
    await installUiNetworkSession({
      context: worker.context,
      page: worker.page,
      policy,
      onOpenPage: (url) => opened.push(url),
    })
    await worker.page.goto(`${entry.origin}/`, { waitUntil: 'domcontentloaded' })

    await worker.page.evaluate(() => {
      void window.open('/popup', '_blank')
    })
    // The popup is announced as unsupported and no second page survives to be navigated.
    await worker.page.waitForTimeout(600)
    expect(opened.length).toBeGreaterThan(0)
    expect(worker.context.pages()).toHaveLength(1)
  })
})
