import { beforeAll, afterAll, it, expect, vi } from 'vitest'
import { createServer, type Server } from 'node:https'
import { createServer as httpServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getCACertificates, setDefaultCACertificates, type TLSSocket } from 'node:tls'
import packet from 'dns-packet'
import { readDnsConfig } from '../../shared/dns-config.ts'
import { createResolver } from './resolver.ts'
import { checkDestination } from './address.ts'
import { launchBrowser, type BrowserWorker } from '../browser.ts'
import { createNetworkPolicy } from '../../inspection/network-policy.ts'
import { installUiNetworkSession } from './session.ts'

let server: Server, dir: string, port: number
let reply: (q: packet.DecodedPacket) => Buffer
let status = 200,
  mime = 'application/dns-message',
  stall = false
let calls: { name: string; type: string; host: string; sni: string | false | null }[] = []
const originalCAs = getCACertificates('default')
const exec = promisify(execFile)
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sentinel-doh-'))
  await exec('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-keyout',
    join(dir, 'key'),
    '-out',
    join(dir, 'cert'),
    '-subj',
    '/CN=resolver.invalid',
    '-addext',
    'subjectAltName=DNS:resolver.invalid',
  ])
  const cert = await readFile(join(dir, 'cert'), 'utf8')
  setDefaultCACertificates([...originalCAs, cert])
  server = createServer({ key: await readFile(join(dir, 'key')), cert }, (req, res) => {
    const query = packet.decode(
      Buffer.from(
        new URL(req.url!, 'https://resolver.invalid').searchParams.get('dns')!,
        'base64url',
      ),
    )
    calls.push({
      name: query.questions![0]!.name,
      type: query.questions![0]!.type,
      host: req.headers.host!,
      sni: (req.socket as TLSSocket).servername,
    })
    if (!stall) res.writeHead(status, { 'content-type': mime }).end(reply(query))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as import('node:net').AddressInfo).port
})
afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((r) => server.close(() => r()))
  setDefaultCACertificates(originalCAs)
  await rm(dir, { recursive: true, force: true })
})
function resolver(timeoutMs = 1000, endpointHost = 'resolver.invalid') {
  return createResolver(
    readDnsConfig({
      URL_SCAN_DNS_MODE: 'doh',
      URL_SCAN_DOH_ENDPOINT: `https://${endpointHost}:${port}/dns-query`,
      URL_SCAN_DOH_BOOTSTRAP_ADDRESS: '127.0.0.1',
      URL_SCAN_DOH_ALLOWED_HOSTS: 'entry.invalid,resource.invalid',
      URL_SCAN_DNS_TIMEOUT_MS: String(timeoutMs),
    }),
  )
}
function answer(addresses = ['93.184.216.34', '2606:4700:4700::1111']) {
  calls = []
  status = 200
  mime = 'application/dns-message'
  stall = false
  reply = (q) =>
    packet.encode({
      type: 'response',
      id: q.id,
      flags: packet.RECURSION_AVAILABLE,
      questions: q.questions,
      answers: addresses
        .filter((a) => (a.includes(':') ? 'AAAA' : 'A') === q.questions![0]!.type)
        .map((data) => ({
          type: data.includes(':') ? ('AAAA' as const) : ('A' as const),
          class: 'IN',
          name: q.questions![0]!.name,
          ttl: 1,
          data,
        })),
    })
}
it('uses default system lookup with every answer, and handles literals without DNS', async () => {
  const system = vi.fn(async () => ['93.184.216.34', '::1'])
  const r = createResolver(readDnsConfig({}), system)
  expect(r.mode).toBe('system')
  expect(await r.resolve('entry.invalid')).toEqual(['93.184.216.34', '::1'])
  expect(await r.resolve('[2606:4700:4700::1111]')).toEqual(['2606:4700:4700::1111'])
  expect(system).toHaveBeenCalledTimes(1)
})
it('uses explicit bootstrap with original TLS SNI/Host, both families and no target lookup', async () => {
  answer()
  const addresses = await resolver().resolve('entry.invalid')
  expect(addresses).toEqual(['93.184.216.34', '2606:4700:4700::1111'])
  expect(calls.map((c) => c.type).sort()).toEqual(['A', 'AAAA'])
  expect(
    calls.every((c) => c.sni === 'resolver.invalid' && c.host === `resolver.invalid:${port}`),
  ).toBe(true)
})
it.each([
  '10.0.0.1',
  '127.0.0.1',
  '169.254.169.254',
  '198.18.1.1',
  '100.64.0.1',
  '224.0.0.1',
  '192.0.2.1',
  '::1',
  'fc00::1',
  'fe80::1',
  '2001:db8::1',
  '::ffff:127.0.0.1',
])('refuses mixed public and restricted answers: %s', async (unsafe) => {
  answer(['93.184.216.34', unsafe])
  const addresses = await resolver().resolve('entry.invalid')
  expect(
    checkDestination({
      host: 'entry.invalid',
      port: 443,
      fixtureOrigins: [],
      lookup: () => addresses,
    }),
  ).toMatchObject({ allow: false, reasonCode: 'private-address' })
})
it('does not disclose hosts outside exact deployment scope or consult system fallback', async () => {
  answer()
  const system = vi.fn(async () => ['93.184.216.34'])
  const r = createResolver(
    readDnsConfig({
      URL_SCAN_DNS_MODE: 'doh',
      URL_SCAN_DOH_ENDPOINT: `https://resolver.invalid:${port}/`,
      URL_SCAN_DOH_BOOTSTRAP_ADDRESS: '127.0.0.1',
      URL_SCAN_DOH_ALLOWED_HOSTS: 'entry.invalid',
    }),
    system,
  )
  await expect(r.resolve('secret.corp.example')).rejects.toThrow('scope-denied')
  expect(calls).toHaveLength(0)
  expect(system).not.toHaveBeenCalled()
})
it.each([
  'status',
  'mime',
  'garbage',
  'question',
  'rcode',
  'truncated',
  'unrelated',
  'empty',
  'oversize',
  'redirect',
])('fails closed for resolver response %s', async (failure) => {
  answer()
  if (failure === 'status' || failure === 'redirect') status = failure === 'status' ? 503 : 302
  if (failure === 'mime') mime = 'application/json'
  if (failure === 'garbage') reply = () => Buffer.from('bad')
  if (failure === 'oversize') reply = () => Buffer.alloc(70000)
  if (['question', 'rcode', 'truncated', 'empty', 'unrelated'].includes(failure))
    reply = (q) =>
      packet.encode({
        type: 'response',
        id: 0,
        flags: failure === 'rcode' ? 3 : failure === 'truncated' ? packet.TRUNCATED_RESPONSE : 0,
        questions:
          failure === 'question' ? [{ name: 'different.invalid', type: 'A' }] : q.questions,
        answers:
          failure === 'unrelated'
            ? [{ name: 'different.invalid', type: 'A', data: '93.184.216.34' }]
            : [],
      })
  await expect(resolver().resolve('entry.invalid')).rejects.toThrow('resolution-')
  expect(calls.length).toBeLessThanOrEqual(2)
})
it('reports TLS identity failure and unavailable bootstrap, without fallback', async () => {
  answer()
  await expect(resolver(1000, 'wrong.invalid').resolve('entry.invalid')).rejects.toThrow(
    'resolution-tls',
  )
  expect(calls).toHaveLength(0)
  const r = createResolver(
    readDnsConfig({
      URL_SCAN_DNS_MODE: 'doh',
      URL_SCAN_DOH_ENDPOINT: 'https://resolver.invalid:1/',
      URL_SCAN_DOH_BOOTSTRAP_ADDRESS: '127.0.0.1',
      URL_SCAN_DOH_ALLOWED_HOSTS: 'entry.invalid',
    }),
  )
  await expect(r.resolve('entry.invalid')).rejects.toThrow('resolution-unavailable')
})
it('bounds a stalled response and cancels both families promptly with no retry', async () => {
  answer()
  stall = true
  await expect(resolver(80).resolve('entry.invalid')).rejects.toThrow('resolution-timeout')
  const controller = new AbortController()
  const request = resolver(5000).resolve('entry.invalid', controller.signal)
  const assertion = expect(request).rejects.toThrow('resolution-cancelled')
  setTimeout(() => controller.abort(), 30)
  await assertion
  const before = calls.length
  await expect(resolver().resolve('entry.invalid', controller.signal)).rejects.toThrow(
    'resolution-cancelled',
  )
  expect(calls).toHaveLength(before)
})
it('settles a cancelled non-cancellable system lookup without late connections', async () => {
  const controller = new AbortController()
  const r = createResolver(readDnsConfig({}), () => new Promise(() => {}))
  const request = r.resolve('entry.invalid', controller.signal)
  controller.abort()
  await expect(request).rejects.toThrow('resolution-cancelled')
})
it('rejects incomplete or unsafe deployment config, never echoes secret input', () => {
  expect(() => readDnsConfig({ URL_SCAN_DNS_MODE: 'auto' })).toThrow()
  expect(() =>
    readDnsConfig({
      URL_SCAN_DNS_MODE: 'doh',
      URL_SCAN_DOH_ENDPOINT: 'https://user:secret@resolver.invalid/',
    }),
  ).toThrow('Invalid URL_SCAN_DOH_ENDPOINT')
  expect(() =>
    readDnsConfig({ URL_SCAN_DNS_MODE: 'doh', URL_SCAN_DOH_ENDPOINT: 'https://resolver.invalid/' }),
  ).toThrow('BOOTSTRAP')
})
it('supplies real Chromium through pinned DoH results; resource rebinding and cross-origin redirects remain blocked', async () => {
  answer(['127.0.0.1'])
  const seen: string[] = []
  const web = httpServer((q, r) => {
    seen.push(q.url!)
    if (q.url === '/redirect')
      return void r.writeHead(302, { location: `http://resource.invalid:${webPort}/escape` }).end()
    r.writeHead(200, { 'content-type': 'text/html' }).end(
      '<title>fixture observation</title><img src="http://resource.invalid/image.png"><p>observed</p>',
    )
  })
  await new Promise<void>((r) => web.listen(0, '127.0.0.1', r))
  const webPort = (web.address() as import('node:net').AddressInfo).port
  const entry = `http://entry.invalid:${webPort}`
  let worker: BrowserWorker | undefined
  try {
    worker = await launchBrowser({ uiScan: true })
    const session = await installUiNetworkSession({
      context: worker.context,
      page: worker.page,
      resolver: resolver(),
      policy: createNetworkPolicy({
        entryUrl: entry,
        resourceOrigins: ['http://resource.invalid'],
        dataOrigins: [],
        reachableOrigins: [entry],
      }),
    })
    await worker.page.goto(entry, { waitUntil: 'load' })
    expect(await worker.page.title()).toBe('fixture observation')
    expect(session.decisions.find((d) => d.allow && d.destination === 'document')).toMatchObject({
      dnsMode: 'doh',
      resolvedAddresses: ['127.0.0.1'],
      selectedAddress: '127.0.0.1',
      connectedAddress: '127.0.0.1',
    })
    expect(session.decisions.find((d) => d.destination === 'image')).toMatchObject({
      reasonCode: 'private-address',
      networkStage: 'address',
    })
    await worker.page.goto(`${entry}/redirect`).catch(() => {})
    await session.settle()
    expect(
      session.decisions.some(
        (d) =>
          d.reasonCode === 'outside-navigation-scope' && d.redirectFrom === `${entry}/redirect`,
      ),
    ).toBe(true)
    expect(seen).not.toContain('/escape')
    expect(seen).not.toContain('/image.png')
  } finally {
    await worker?.close()
    web.closeAllConnections()
    await new Promise<void>((r) => web.close(() => r()))
  }
}, 15000)

it('accepts recursive CNAME answers without performing extra queries', async () => {
  answer()
  reply = (q) =>
    packet.encode({
      type: 'response',
      id: 0,
      questions: q.questions,
      answers: [
        { name: 'entry.invalid', type: 'CNAME', data: 'alias.invalid' },
        ...(q.questions![0]!.type === 'A'
          ? [{ name: 'alias.invalid', type: 'A' as const, data: '93.184.216.34' }]
          : []),
      ],
    })
  expect(await resolver().resolve('entry.invalid')).toEqual(['93.184.216.34'])
  expect(calls).toHaveLength(2)
})
it('refuses an untrusted resolver certificate', async () => {
  answer()
  setDefaultCACertificates(originalCAs)
  try {
    await expect(resolver().resolve('entry.invalid')).rejects.toThrow('resolution-tls')
  } finally {
    setDefaultCACertificates([...originalCAs, await readFile(join(dir, 'cert'), 'utf8')])
  }
  expect(calls).toHaveLength(0)
})
