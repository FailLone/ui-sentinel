import { EventEmitter } from 'node:events'
import { it, expect, vi, beforeEach } from 'vitest'
import type { BrowserContext, Page } from 'playwright'
import { createNetworkPolicy } from '../../inspection/network-policy.ts'
import { createResolver, ResolutionFailure } from './resolver.ts'
import { installUiNetworkSession } from './session.ts'
import { readPinnedResponse, TransportRefusal } from './transport.ts'
vi.mock('./transport.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('./transport.ts')>()
  return { ...original, readPinnedResponse: vi.fn() }
})
beforeEach(() => {
  vi.mocked(readPinnedResponse).mockReset()
})
async function harness(resolve: (host: string) => Promise<readonly string[]>) {
  const cdp = Object.assign(new EventEmitter(), {
    send: vi.fn(async (method: string) =>
      method === 'Page.getFrameTree' ? { frameTree: { frame: { id: 'main' } } } : {},
    ),
  })
  const context = Object.assign(new EventEmitter(), {
    newCDPSession: async () => cdp,
  }) as unknown as BrowserContext
  const page = Object.assign(new EventEmitter(), {
    url: () => 'https://entry.invalid/',
  }) as unknown as Page
  const resolver = createResolver({ mode: 'system', timeoutMs: 100, allowedHosts: [] }, resolve)
  const session = await installUiNetworkSession({
    context,
    page,
    resolver,
    policy: createNetworkPolicy({
      entryUrl: 'https://entry.invalid/',
      resourceOrigins: ['https://resource.invalid'],
      dataOrigins: [],
      reachableOrigins: [],
    }),
  })
  return {
    session,
    cdp,
    async request(id: string, url: string, type = 'Document', redirect?: string) {
      cdp.emit('Fetch.requestPaused', {
        requestId: id,
        frameId: 'main',
        resourceType: type,
        redirectedRequestId: redirect,
        request: { url, method: 'GET', headers: {} },
      })
      await session.settle()
    },
  }
}
it('passes only a fully validated public address into the actual transport seam for each hop', async () => {
  const resolve = vi.fn(async () => ['2606:4700:4700::1111', '93.184.216.34'])
  vi.mocked(readPinnedResponse).mockResolvedValue({
    status: 302,
    headers: [{ name: 'location', value: '/next' }],
    body: Buffer.alloc(0),
    remoteAddress: '93.184.216.34',
  })
  const h = await harness(resolve)
  await h.request('one', 'https://entry.invalid/')
  expect(readPinnedResponse).toHaveBeenCalledWith(
    expect.objectContaining({ url: 'https://entry.invalid/', address: '93.184.216.34' }),
  )
  resolve.mockResolvedValueOnce(['93.184.216.34', '::1'])
  await h.request('two', 'https://entry.invalid/next', 'Document', 'one')
  expect(readPinnedResponse).toHaveBeenCalledTimes(1)
  expect(h.session.decisions[1]).toMatchObject({
    reasonCode: 'private-address',
    networkStage: 'address',
    redirectFrom: 'https://entry.invalid/',
  })
  await h.request('resource', 'https://resource.invalid/a.png', 'Image')
  expect(readPinnedResponse).toHaveBeenCalledTimes(2)
  expect(resolve).toHaveBeenCalledTimes(3)
})
it('pins IPv6-only answers without requesting IPv4 fallback', async () => {
  vi.mocked(readPinnedResponse).mockResolvedValue({
    status: 200,
    headers: [],
    body: Buffer.alloc(0),
  })
  const h = await harness(async () => ['2606:4700:4700::1111'])
  await h.request('one', 'https://entry.invalid/')
  expect(readPinnedResponse).toHaveBeenCalledWith(
    expect.objectContaining({ address: '2606:4700:4700::1111' }),
  )
})
it.each(['connection', 'tls', 'timeout'] as const)(
  'records target %s failure without fulfilling or retrying the browser request',
  async (detail) => {
    vi.mocked(readPinnedResponse).mockRejectedValue(new TransportRefusal('transport-error', detail))
    const h = await harness(async () => ['93.184.216.34'])
    await h.request('one', 'https://entry.invalid/')
    expect(h.session.decisions[0]).toMatchObject({
      allow: false,
      reasonCode: 'transport-error',
      networkStage: detail === 'tls' ? 'tls' : 'connection',
      sessionReason: detail,
      selectedAddress: '93.184.216.34',
    })
    expect(h.cdp.send.mock.calls.some(([method]) => method === 'Fetch.fulfillRequest')).toBe(false)
    expect(readPinnedResponse).toHaveBeenCalledTimes(1)
  },
)
it('records DNS timeout, seals pending resolution, and performs no connection', async () => {
  const h = await harness(async () => {
    throw new ResolutionFailure('timeout')
  })
  await h.request('one', 'https://entry.invalid/')
  expect(h.session.decisions[0]).toMatchObject({
    reasonCode: 'resolution-failed',
    networkStage: 'resolution',
    sessionReason: 'resolution-timeout',
  })
  expect(readPinnedResponse).not.toHaveBeenCalled()
  const pending = await harness(() => new Promise(() => {}))
  const task = pending.request('one', 'https://entry.invalid/')
  pending.session.seal()
  await task
  expect(pending.session.decisions[0]).toMatchObject({
    reasonCode: 'execution-stopped',
    finalizationShutdown: true,
  })
})
