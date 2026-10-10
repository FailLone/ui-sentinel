import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { imagePng } from '../image-shape.ts'

/** Same process-private pattern as URL-scan fixtures. Immutable per run; no HTTP control surface.
 * All UI state belongs to the document. A new browser context + GET / resets it deterministically.
 * Run separate instances for concurrent cases. Never serve source files or the private catalog.
 */
export async function startArena(html: string, port = 0) {
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    )
    if (!['GET', 'HEAD'].includes(req.method ?? '')) return void res.writeHead(405).end()
    const url = new URL(req.url ?? '/', 'http://arena.invalid')
    if (url.search) return void res.writeHead(404).end()
    if (url.pathname === '/favicon.ico') return void res.writeHead(204).end()
    const body = url.pathname === '/' ? html : url.pathname === '/emblem.png' ? imagePng : undefined
    if (body === undefined) return void res.writeHead(404).end()
    res.writeHead(200, {
      'Content-Type': typeof body === 'string' ? 'text/html; charset=utf-8' : 'image/png',
    })
    res.end(req.method === 'HEAD' ? undefined : body)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
    },
  }
}
