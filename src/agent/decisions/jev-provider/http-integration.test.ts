import { it, expect } from 'vitest'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createJevTransport } from './http.ts'
import { compileInput } from './compile.ts'
import { DEFAULT_PROFILE } from './profile.ts'
import { buildScoringRequest } from '../exploration/prompt.ts'
import { testInput, replyFor } from '../../../../scripts/r1-jev-real/test-support.ts'
it('uses actual Node HTTP with an isolated loopback fake provider', async () => {
  let received: unknown
  let auth: string | undefined
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    received = body
    auth = req.headers.authorization
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(replyFor({ questions: body.questions })))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('port')
  const loopback = `http://127.0.0.1:${address.port}`
  try {
    const input = testInput()
    const compiled = compileInput(input, DEFAULT_PROFILE).compiled
    const request = buildScoringRequest(input)
    const transport = createJevTransport({
      profile: DEFAULT_PROFILE,
      apiKey: 'fake-loopback-test-only',
      fetch: async (url, init) => {
        expect(url).toBe(DEFAULT_PROFILE.endpoint)
        return fetch(loopback, init)
      },
    })
    const result: any = await transport(
      { system: request.system, body: request.body },
      {
        attemptId: 'loopback',
        requestDigest: request.requestDigest,
        signal: new AbortController().signal,
        deadline: Date.now() + 2000,
      },
    )
    expect(received).toEqual(JSON.parse(compiled.wire))
    expect(auth).toBe('Bearer fake-loopback-test-only')
    expect(result.receipt.kind).toBe('scores')
  } finally {
    server.closeAllConnections()
    await new Promise<void>((r) => server.close(() => r()))
  }
})
