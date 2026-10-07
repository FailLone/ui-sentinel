import { it, expect } from 'vitest'
import { createServer as httpServer } from 'node:http'
import { createServer as httpsServer } from 'node:https'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { gzipSync } from 'node:zlib'
import { readPinnedResponse, createBodyBudget } from './transport.ts'

const exec = promisify(execFile)
it('retains SNI/Host on a pinned TLS socket and refuses wrong-host or untrusted certificates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sentinel-tls-'))
  const ca = join(dir, 'ca.pem')
  const seen: { host: string | undefined; sni: string | false | null }[] = []
  let server: ReturnType<typeof httpsServer> | undefined
  try {
    await exec('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-keyout',
      join(dir, 'ca.key'),
      '-out',
      ca,
      '-subj',
      '/CN=Sentinel test CA',
      '-addext',
      'basicConstraints=critical,CA:TRUE',
    ])
    await exec('openssl', [
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      join(dir, 'server.key'),
      '-out',
      join(dir, 'server.csr'),
      '-subj',
      '/CN=entry.invalid',
    ])
    await writeFile(
      join(dir, 'extensions'),
      'subjectAltName=DNS:entry.invalid\nbasicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\n',
    )
    await exec('openssl', [
      'x509',
      '-req',
      '-in',
      join(dir, 'server.csr'),
      '-CA',
      ca,
      '-CAkey',
      join(dir, 'ca.key'),
      '-CAcreateserial',
      '-days',
      '1',
      '-out',
      join(dir, 'server.pem'),
      '-extfile',
      join(dir, 'extensions'),
    ])
    server = httpsServer(
      {
        key: await readFile(join(dir, 'server.key')),
        cert: await readFile(join(dir, 'server.pem')),
      },
      (q, r) => {
        seen.push({
          host: q.headers.host,
          sni: (q.socket as import('node:tls').TLSSocket).servername,
        })
        r.end('verified transport')
      },
    )
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r))
    const port = (server.address() as import('node:net').AddressInfo).port
    const helper = join(dir, 'check.mts')
    await writeFile(
      helper,
      `import {readPinnedResponse,createBodyBudget} from ${JSON.stringify(resolve('src/execution/network/transport.ts'))};
      try { const r=await readPinnedResponse({url:process.argv[2],address:'127.0.0.1',method:'GET',headers:{},budget:createBodyBudget(1024,1024),signal:new AbortController().signal}); console.log(r.body.toString()) } catch(e) {console.log(e.message)} `,
    )
    const child = (host: string, trusted: boolean) =>
      exec(
        process.execPath,
        [resolve('node_modules/tsx/dist/cli.mjs'), helper, `https://${host}:${port}/`],
        {
          env: {
            ...process.env,
            NODE_EXTRA_CA_CERTS: trusted ? ca : '',
            NODE_TLS_REJECT_UNAUTHORIZED: '1',
          },
          timeout: 10000,
        },
      )
    expect((await child('entry.invalid', true)).stdout.trim()).toBe('verified transport')
    expect(seen).toEqual([{ host: `entry.invalid:${port}`, sni: 'entry.invalid' }])
    expect((await child('wrong.invalid', true)).stdout.trim()).toBe('transport-error')
    expect((await child('entry.invalid', false)).stdout.trim()).toBe('transport-error')
    expect(seen).toHaveLength(1)
  } finally {
    server?.closeAllConnections()
    if (server) await new Promise<void>((r) => server!.close(() => r()))
    await rm(dir, { recursive: true, force: true })
  }
}, 20000)

it('bounds decompressed payloads and promptly aborts a live stream on cancellation', async () => {
  let closed: Promise<void> = Promise.resolve()
  let began: () => void = () => {}
  const streaming = new Promise<void>((r) => (began = r))
  const server = httpServer((q, r) => {
    if (q.url === '/compressed') {
      r.writeHead(200, { 'content-encoding': 'gzip' }).end(gzipSync('x'.repeat(8192)))
      return
    }
    closed = new Promise<void>((done) => r.once('close', done))
    r.write('open')
    began()
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as import('node:net').AddressInfo).port
  const input = { address: '127.0.0.1', method: 'GET', headers: {}, timeoutMs: 5000 }
  try {
    await expect(
      readPinnedResponse({
        ...input,
        url: `http://127.0.0.1:${port}/compressed`,
        budget: createBodyBudget(512, 1024),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('response-budget-exhausted')
    const controller = new AbortController()
    const request = readPinnedResponse({
      ...input,
      url: `http://127.0.0.1:${port}/stream`,
      budget: createBodyBudget(512, 1024),
      signal: controller.signal,
    })
    const rejected = expect(request).rejects.toThrow('execution-stopped')
    await streaming
    controller.abort()
    await rejected
    await Promise.race([
      closed,
      new Promise((_, reject) =>
        setTimeout(() => reject(Error('stream still open')), 1000).unref(),
      ),
    ])
  } finally {
    server.closeAllConnections()
    await new Promise<void>((r) => server.close(() => r()))
  }
})
