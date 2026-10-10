import { expect, it } from 'vitest'
import { requestPopupDecision, type PopupTransportRecord } from './transport.ts'
const options = { requestId: 'local-a', runId: 'child-a', wire: '{}', key: 'synthetic-private-key' }

it.each([400, 401, 429, 500, 503])(
  'retains HTTP %s and bounded redacted diagnostics despite synchronous stop',
  async (status) => {
    const controller = new AbortController(),
      records: PopupTransportRecord[] = []
    await expect(
      requestPopupDecision({
        ...options,
        signal: controller.signal,
        http: async () =>
          new Response(
            JSON.stringify({
              error: {
                message: 'bad schema',
                authorization: 'Bearer synthetic-private-key',
                api_key: 'another-secret',
              },
              padding: 'x'.repeat(12000),
            }),
            {
              status,
              headers: {
                'x-request-id': 'req-upstream',
                'retry-after': '2',
                'set-cookie': 'secret-cookie',
              },
            },
          ),
        observe: (r) => {
          records.push(r)
          if (r.failureSequence) controller.abort(Error('batch-stop'))
        },
      }),
    ).rejects.toThrow('popup-provider-http:' + status)
    const final = records.at(-1)!
    expect(final).toMatchObject({
      requestId: 'local-a',
      outcome: 'http-error',
      httpStatus: status,
      responseHeaders: { 'x-request-id': 'req-upstream', 'retry-after': '2' },
      errorBodyTruncated: true,
    })
    expect(final.failureSequence).toBe(records[0]!.failureSequence)
    expect(Buffer.byteLength(final.errorBody!)).toBeLessThanOrEqual(4096)
    expect(final.errorBody).toContain('bad schema')
    expect(JSON.stringify(records)).not.toMatch(
      /synthetic-private-key|another-secret|secret-cookie|set-cookie/,
    )
  },
)
it('distinguishes transport failure, timeout and cancellation; no retry and logger errors cannot replace failure', async () => {
  for (const kind of ['transport-error', 'timeout', 'cancelled'] as const) {
    const c = new AbortController(),
      records: PopupTransportRecord[] = []
    let calls = 0
    const error = Error('original-transport-error')
    await expect(
      requestPopupDecision({
        ...options,
        signal: c.signal,
        http: async () => {
          calls++
          if (kind === 'transport-error') throw error
          queueMicrotask(() =>
            c.abort(
              new DOMException('synthetic', kind === 'timeout' ? 'TimeoutError' : 'AbortError'),
            ),
          )
          return new Promise<Response>(() => {})
        },
        observe: (r) => {
          records.push(r)
          throw Error('logger-broken')
        },
      }),
    ).rejects.toThrow(kind === 'transport-error' ? 'original-transport-error' : 'synthetic')
    expect(calls).toBe(1)
    expect(records.at(-1)).toMatchObject({ outcome: kind, loggingFailed: true })
  }
})
it('bounds an endless error body and records supplier generation ID on success', async () => {
  const records: PopupTransportRecord[] = []
  await expect(
    requestPopupDecision({
      ...options,
      signal: new AbortController().signal,
      http: async () => new Response(new ReadableStream({ start() {} }), { status: 502 }),
      observe: (r) => records.push(r),
    }),
  ).rejects.toThrow('502')
  expect(records.at(-1)).toMatchObject({ outcome: 'http-error', errorBodyIncomplete: true })
  await requestPopupDecision({
    ...options,
    signal: new AbortController().signal,
    http: async () => Response.json({ id: 'gen-dec-real-id' }),
    observe: (r) => records.push(r),
  })
  expect(records.at(-1)).toMatchObject({ outcome: 'success', generationId: 'gen-dec-real-id' })
})
