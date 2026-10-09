import { it, expect, vi, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_MODEL_REQUEST_TIMEOUT_MS } from '../../src/shared/model-defaults.ts'
vi.mock('../../src/shared/config.ts', () => ({
  config: { budget: { modelRequestTimeoutMs: 60000, modelRequestMaxRetries: 0 } },
}))
import { executeModelRequest } from '../../src/agent/model/request.ts'
import { createPhaseTracker } from '../../src/execution/run-phase.ts'
import { startGateway, AGENT_MODEL } from '../../evaluation/support/model-gateway.ts'
import { openCampaignSession } from '../../evaluation/support/campaign-session.ts'
import { createBatch } from '../r1-online-pilot/batch.ts'
import { makeProductManifest, LIMITS } from './manifest.ts'
import { createValidatedUpstream, type UpstreamTiming } from './upstream.ts'
afterEach(() => vi.useRealTimers())
const event = (extra: any = {}) =>
  'data: ' +
  JSON.stringify({ model: AGENT_MODEL, provider: 'Wafer', choices: [], ...extra }) +
  '\n\n'
const end =
  event({ usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0.001 } }) + 'data: [DONE]\n\n'
function segmented(completeMs: number, firstEventMs = 20000): typeof fetch {
  return async () => {
    const start = Date.now()
    await new Promise((r) => setTimeout(r, 100))
    let timers: ReturnType<typeof setTimeout>[] = []
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const [at, text, close] of [
            [1000, ': upstream ping\n', false],
            [firstEventMs, event(), false],
            [completeMs, end, true],
          ] as const) {
            timers.push(
              setTimeout(
                () => {
                  controller.enqueue(new TextEncoder().encode(text))
                  if (close) controller.close()
                },
                at - (Date.now() - start),
              ),
            )
          }
        },
        cancel() {
          for (const t of timers) clearTimeout(t)
        },
      }),
      { headers: { 'content-type': 'text/event-stream', 'set-cookie': 'must-not-be-logged' } },
    )
  }
}
function harness(fetcher: typeof fetch) {
  const timings: UpstreamTiming[] = [],
    stops: string[] = []
  const upstream = createValidatedUpstream(fetcher, {
    context: () => ({ row: 'C10-1', sequence: 1 }),
    auditWire: () => {},
    stop: (r) => {
      stops.push(r)
    },
    record: (t) => {
      timings.push(t)
    },
  })
  let dispatched = 0
  const agent = {
    generate: async (_input: any, options: any) => {
      dispatched++
      const response = await upstream('https://fixture.invalid', {
        body: '{}',
        signal: options.abortSignal,
      })
      await response.text()
      return { text: 'validated', toolResults: [], usage: { inputTokens: 10, outputTokens: 10 } }
    },
  } as unknown as Parameters<typeof executeModelRequest>[0]
  return { timings, stops, agent, upstream, dispatched: () => dispatched }
}
it('accepts a segmented response finishing after15s and before60s, with independent upstream and release times', async () => {
  vi.useFakeTimers()
  const h = harness(segmented(45000))
  const records: any[] = []
  const work = executeModelRequest(
    h.agent,
    '{}',
    {
      runSignal: new AbortController().signal,
      timeRemainingMs: 180000,
      attemptBudget: 8,
      transport: 'generate',
    },
    {
      onFinish: (r) => {
        records.push(r)
      },
    },
  )
  await vi.advanceTimersByTimeAsync(16000)
  expect(h.timings).toHaveLength(0)
  await vi.advanceTimersByTimeAsync(29000)
  expect((await work).text).toBe('validated')
  expect(h.timings[0]).toMatchObject({
    headersMs: 100,
    firstByteMs: 1000,
    firstEventMs: 20000,
    responseCompleteMs: 45000,
    validationEndMs: 45000,
    releaseMs: 45000,
    outcome: 'validated',
  })
  expect(records[0].deadlineAt - records[0].startedAt).toBe(DEFAULT_MODEL_REQUEST_TIMEOUT_MS)
  console.info(
    'R1_TIMING_EVIDENCE',
    JSON.stringify({ mode: 'virtual-clock', case: '45s-success', timing: h.timings[0] }),
  )
  expect(records[0].status).toBe('success')
  expect(h.dispatched()).toBe(1)
  expect(JSON.stringify(h.timings)).not.toContain('must-not-be-logged')
})
it.each([
  [65000, 180000, 60000, 'model-request-timeout'],
  [45000, 25000, 25000, 'budget-exhausted'],
] as const)(
  'cancels unfinished response at min(model, remaining run) without retry: %s/%s',
  async (complete, remaining, deadline, error) => {
    vi.useFakeTimers()
    const h = harness(segmented(complete))
    const records: any[] = []
    const work = executeModelRequest(
      h.agent,
      '{}',
      {
        runSignal: new AbortController().signal,
        timeRemainingMs: remaining,
        attemptBudget: 8,
        transport: 'generate',
      },
      {
        onFinish: (r) => {
          records.push(r)
        },
      },
    )
    const check = expect(work).rejects.toThrow(error)
    await vi.advanceTimersByTimeAsync(deadline + 1)
    await check
    expect(h.dispatched()).toBe(1)
    expect(records[0].usage).toBeUndefined()
    expect(h.timings[0]).toMatchObject({
      headersMs: 100,
      firstByteMs: 1000,
      firstEventMs: 20000,
      responseCompleteMs: null,
      validationEndMs: null,
      releaseMs: null,
      abortedMs: deadline,
      outcome: 'aborted',
    })
    console.info(
      'R1_TIMING_EVIDENCE',
      JSON.stringify({ mode: 'virtual-clock', case: error, timing: h.timings[0] }),
    )
    expect(h.stops).toContain('transport-error')
  },
)
it('reserves36s/two final calls but never promises two60s turns; remaining time bounds finalization', async () => {
  vi.useFakeTimers()
  const tracker = createPhaseTracker({
    maxActions: 6,
    maxModelCalls: 8,
    totalTimeoutMs: 180000,
  } as any)
  expect(
    tracker.shouldFinalize({ elapsedMs: 144000, modelCallsUsed: 2, noProgressStreak: 0 }),
  ).toMatchObject({ should: true, reason: 'time-budget-reserve' })
  tracker.enterFinalizing('time-budget-reserve')
  const h = harness(segmented(45000))
  const work = executeModelRequest(h.agent, '{}', {
    runSignal: new AbortController().signal,
    timeRemainingMs: 36000,
    attemptBudget: 2,
    transport: 'generate',
  })
  const check = expect(work).rejects.toThrow('budget-exhausted')
  await vi.advanceTimersByTimeAsync(36001)
  await check
  expect(h.timings[0].abortedMs).toBe(36000)
  expect(h.dispatched()).toBe(1)
})
it.each([
  { provider: 'Other' },
  { model: 'other/model' },
  { error: { message: 'upstream-error' } },
])('never releases a response with invalid provider/model/error metadata: %j', async (extra) => {
  const h = harness(async () => new Response(event(extra) + end))
  await expect(h.upstream('https://fixture.invalid', { body: '{}' })).rejects.toThrow(
    'provider-response-error',
  )
  expect(h.timings[0]).toMatchObject({ outcome: 'validation-error', releaseMs: null })
  expect(h.stops).toContain('provider-response-error')
})
it('records malformed event validation and HTTP failure without permitting success', async () => {
  const bad = harness(async () => new Response('data: {broken}\n'))
  await expect(bad.upstream('https://fixture.invalid', { body: '{}' })).rejects.toThrow(
    'provider-response-error',
  )
  const http = harness(async () => new Response('error', { status: 400 }))
  expect((await http.upstream('https://fixture.invalid', { body: '{}' })).status).toBe(400)
  expect(http.timings[0]).toMatchObject({ httpStatus: 400, outcome: 'http-error', releaseMs: null })
  expect(http.stops).toEqual(['provider-http-error'])
})
it.each([false, true])(
  'actual local gateway retains usage on success or unknown on cancellation; complete=%s',
  async (complete) => {
    const dir = await mkdtemp(join(tmpdir(), 'r1-upstream-time-'))
    const session = await openCampaignSession(join(dir, 'account'), '14.112')
    const manifest = makeProductManifest('free-test')
    const batch = createBatch(session.ledger, manifest, dir, undefined, undefined, {
      mainRequests: 224,
      jevRequests: 0,
      windowMs: 5400000,
    })
    const timings: UpstreamTiming[] = []
    let reached!: () => void,
      calls = 0
    const seen = new Promise<void>((r) => {
      reached = r
    })
    const upstream = createValidatedUpstream(
      async () => {
        calls++
        return new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode(event()))
              if (complete) {
                c.enqueue(new TextEncoder().encode(end))
                c.close()
              }
              reached()
            },
            cancel() {},
          }),
        )
      },
      {
        context: () => ({ row: 'C10-1', sequence: 1 }),
        auditWire: (u, b) => batch.auditWire(u, b),
        stop: (r) => batch.stop(r),
        record: (t) => {
          timings.push(t)
        },
      },
    )
    const gateway = await startGateway('synthetic-only-key', dir, upstream, {
      limitUsd: LIMITS.maxCostUsd,
      estimateCost: batch.estimate,
      ledger: batch.ledger,
      providers: { agent: 'Wafer', vision: 'disabled' },
      phase: manifest.version,
    })
    batch.activate(manifest.rows[0], 'row-test', 'http://fixture.test')
    gateway.begin('row-test', 8, 180000)
    try {
      const ac = new AbortController()
      const request = fetch(gateway.url + '/chat/completions', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + gateway.token, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: AGENT_MODEL,
          stream: true,
          messages: [],
          tools: [],
          tool_choice: 'required',
        }),
        signal: ac.signal,
      }).catch(() => null)
      await seen
      await new Promise((r) => setTimeout(r, 15))
      if (!complete) ac.abort()
      const response = await request
      if (complete) expect(await response!.text()).toBe(event() + end)
      const records = await gateway.end()
      await batch.drain()
      expect(records).toHaveLength(1)
      if (complete) {
        expect(records[0].usage.cost).toBe(0.001)
        expect(records[0].status).toBe('success')
        expect(await session.ledger.spending()).toMatchObject({
          knownCostUsd: 0.001,
          unknownCount: 0,
          heldReservedUsd: 0,
        })
        expect(timings[0].outcome).toBe('validated')
      } else {
        expect(records[0].receivedBytes).toBe(0)
        expect(timings[0].upstreamBytes).toBeGreaterThan(0)
        expect(timings[0]).toMatchObject({
          outcome: 'aborted',
          responseCompleteMs: null,
          releaseMs: null,
        })
        expect(await session.ledger.spending()).toMatchObject({
          unknownCount: 1,
          unknownReservedUsd: 0.063,
          knownCostUsd: 0,
          heldReservedUsd: 0,
        })
        expect(() => batch.guard()).toThrow()
        expect(() => gateway.begin('no-retry')).toThrow()
      }
      console.info(
        'R1_TIMING_EVIDENCE',
        JSON.stringify({
          mode: 'local-gateway-synthetic-no-real-model',
          case: complete ? 'success' : 'cancel',
          timing: timings[0],
          spending: await session.ledger.spending(),
        }),
      )
      expect(calls).toBe(1)
    } finally {
      await gateway.close()
      batch.dispose()
      await session.close()
      await rm(dir, { recursive: true, force: true })
    }
  },
)
