import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'

export class TransportRefusal extends Error {
  constructor(
    readonly reason: 'response-budget-exhausted' | 'transport-error' | 'execution-stopped',
  ) {
    super(reason)
  }
}

/** Shared synchronous reservations: concurrent streams cannot each spend the same bytes. */
export function createBodyBudget(maxResponse: number, maxTotal: number) {
  let wire = 0
  let decoded = 0
  return {
    exhausted: () => wire >= maxTotal || decoded >= maxTotal,
    stream() {
      let received = 0
      let expanded = 0
      return (bytes: number, layer: 'wire' | 'decoded') => {
        if (layer === 'wire') {
          if (received + bytes > maxResponse || wire + bytes > maxTotal)
            throw new TransportRefusal('response-budget-exhausted')
          received += bytes
          wire += bytes
        } else {
          if (expanded + bytes > maxResponse || decoded + bytes > maxTotal)
            throw new TransportRefusal('response-budget-exhausted')
          expanded += bytes
          decoded += bytes
        }
      }
    },
  }
}

/** One hop, one vetted address, no redirect following or ambient proxy/credential lookup.
 * The original hostname is retained for Host, SNI and TLS certificate validation.
 * Bodies are bounded while streaming (including decompression), before Chromium receives them.
 */
export async function readPinnedResponse(input: {
  url: string
  address: string
  method: string
  headers: Readonly<Record<string, string>>
  budget: ReturnType<typeof createBodyBudget>
  signal: AbortSignal
  timeoutMs?: number
}) {
  const url = new URL(input.url)
  const headers = Object.fromEntries(
    Object.entries(input.headers).filter(
      ([name]) =>
        ![
          'host',
          'connection',
          'proxy-authorization',
          'proxy-connection',
          'authorization',
          'transfer-encoding',
          'content-length',
          'accept-encoding',
        ].includes(name.toLowerCase()),
    ),
  )
  headers['accept-encoding'] = 'identity'
  const reserve = input.budget.stream()
  return new Promise<{ status: number; headers: { name: string; value: string }[]; body: Buffer }>(
    (resolve, reject) => {
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
        method: input.method,
        headers,
        agent: false,
        signal: input.signal,
        // Node's lookup is replaced with the already checked answer. No second DNS lookup.
        lookup: (_host, options, callback) => {
          const answer = { address: input.address, family: isIP(input.address) }
          if (options.all) callback(null, [answer] as never)
          else callback(null, answer.address, answer.family)
        },
      })
      const timer = setTimeout(
        () => request.destroy(new TransportRefusal('transport-error')),
        input.timeoutMs ?? 15_000,
      )
      const fail = (error: unknown) => {
        clearTimeout(timer)
        request.destroy()
        reject(
          error instanceof TransportRefusal
            ? error
            : new TransportRefusal(input.signal.aborted ? 'execution-stopped' : 'transport-error'),
        )
      }
      request.on('error', fail)
      request.on('response', (response) => {
        const encoding = String(response.headers['content-encoding'] ?? 'identity').toLowerCase()
        const decoder =
          encoding === 'gzip'
            ? createGunzip()
            : encoding === 'br'
              ? createBrotliDecompress()
              : encoding === 'deflate'
                ? createInflate()
                : null
        if (!decoder && !['', 'identity'].includes(encoding)) {
          response.destroy()
          fail(new TransportRefusal('transport-error'))
          return
        }
        const stream = decoder ? response.pipe(decoder) : response
        const chunks: Buffer[] = []
        const stop = (error: unknown) => {
          response.destroy()
          decoder?.destroy()
          fail(error)
        }
        response.on('data', (chunk: Buffer) => {
          try {
            reserve(chunk.length, 'wire')
          } catch (error) {
            stop(error)
          }
        })
        response.on('error', stop)
        stream.on('error', stop)
        stream.on('data', (chunk: Buffer) => {
          try {
            reserve(chunk.length, 'decoded')
            chunks.push(chunk)
          } catch (error) {
            stop(error)
          }
        })
        stream.on('end', () => {
          clearTimeout(timer)
          if (response.destroyed && !response.complete) {
            fail(new TransportRefusal('transport-error'))
            return
          }
          const kept: { name: string; value: string }[] = []
          for (let i = 0; i < response.rawHeaders.length; i += 2) {
            const name = response.rawHeaders[i]!
            if (
              ![
                'content-encoding',
                'content-length',
                'transfer-encoding',
                'connection',
                'keep-alive',
                'upgrade',
                'proxy-authenticate',
              ].includes(name.toLowerCase())
            )
              kept.push({ name, value: response.rawHeaders[i + 1]! })
          }
          resolve({
            status: response.statusCode ?? 502,
            headers: kept,
            body: Buffer.concat(chunks),
          })
        })
      })
      request.end()
    },
  )
}
