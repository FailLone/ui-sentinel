import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { openCampaignLedger, type CampaignLedger } from './campaign-ledger.ts'
import {
  startGateway,
  AGENT_MODEL,
  VISION_MODEL,
  REVIEW_MODEL,
  type GatewayLedger,
} from './model-gateway.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const clean of cleanups.splice(0).reverse()) await clean()
})
function barrier<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
const reservation = (requestId: string) => ({
  requestId,
  runId: 'fixture',
  phase: 'free-only',
  model: 'fixture',
  provider: 'fixture',
  reservedUsd: 0.1,
  priceSource: 'synthetic',
  stopEpoch: 0,
})
async function setup(
  transport: typeof fetch,
  wrap: (ledger: CampaignLedger) => GatewayLedger = (l) => l,
) {
  const directory = await mkdtemp(join(tmpdir(), 'request-stop-free-'))
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  const ledger = await openCampaignLedger({
    directory,
    campaignId: 'isolated-free-fixture',
    limitUsd: 2,
  })
  cleanups.push(async () => ledger.close())
  const gateway = await startGateway('fixture-secret', directory, transport, {
    limitUsd: 2,
    estimateCost: () => 0.1,
    ledger: wrap(ledger),
  })
  cleanups.push(() => gateway.close())
  gateway.begin('free-run', 20, 10000)
  const call = (model = AGENT_MODEL, signal?: AbortSignal) =>
    fetch(gateway.url + (model === REVIEW_MODEL ? '/decisions' : '/chat/completions'), {
      method: 'POST',
      signal,
      headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, state: {}, questions: { q: { type: 'choice' } } }),
    })
  return { directory, ledger, gateway, call }
}

it('unknown rejects original, SDK retry, vision and Decisions without another upstream dispatch; reconciliation does not revive the gateway', async () => {
  let calls = 0
  const { ledger, gateway, call } = await setup((async () => {
    calls++
    return Response.json({ id: 'fixture-generation', choices: [] })
  }) as typeof fetch)
  expect((await call()).status).toBe(200)
  for (const model of [AGENT_MODEL, AGENT_MODEL, VISION_MODEL, REVIEW_MODEL])
    expect((await call(model)).status).toBe(429)
  const records = await gateway.end()
  expect(calls).toBe(1)
  expect(records).toHaveLength(1)
  expect(records[0].dispatchedAt).toBeTypeOf('string')
  expect(await ledger.spending()).toMatchObject({ unknownCount: 1, unknownReservedUsd: 0.1 })
  await ledger.reconcile({
    requestId: records[0].requestId,
    generationId: 'fixture-generation',
    model: AGENT_MODEL,
    provider: 'unknown',
    actualUsd: 0.02,
    evidence: { synthetic: true },
  })
  expect(await ledger.spending()).toMatchObject({ unknownCount: 0, knownCostUsd: 0.02 })
  expect(() => gateway.begin('forbidden-resume')).toThrow('validation-cost-unknown')
  expect(await ledger.reserve({ ...reservation('old-batch'), stopEpoch: 0 })).toMatchObject({
    ok: false,
    reason: 'campaign-stopped',
  })
  expect((await ledger.entries())[0].status).toBe('unknown')
})

it('a retry already reserved and queued at dispatch loses to committed unknown on another ledger connection', async () => {
  const queued = barrier(),
    resume = barrier()
  let calls = 0
  const { directory, ledger, gateway, call } = await setup(
    (async () => {
      calls++
      return Response.json({ usage: { cost: 0.01 } })
    }) as typeof fetch,
    (l) => ({
      ...l,
      dispatch: async (...args) => {
        queued.resolve()
        await resume.promise
        return l.dispatch(...args)
      },
    }),
  )
  const request = call()
  await queued.promise
  const other = await openCampaignLedger({ directory, campaignId: ledger.campaignId, limitUsd: 2 })
  try {
    await other.reserve(reservation('lost'))
    await other.markUnknown('lost', 'fixture-no-usage')
  } finally {
    other.close()
  }
  resume.resolve()
  expect((await request).status).toBe(429)
  const records = await gateway.end()
  expect(calls).toBe(0)
  expect(records[0]).toMatchObject({ status: 'not-sent', usage: null })
  expect(records[0].dispatchedAt).toBeUndefined()
  expect(await ledger.spending()).toMatchObject({ heldReservedUsd: 0, unknownCount: 1 })
  expect((await ledger.entries()).find((e) => e.requestId === records[0].requestId)?.status).toBe(
    'released',
  )
})

it('unknown propagates cancellation to an already dispatched request, whose late real usage is still settled', async () => {
  const started = barrier(),
    aborted = barrier(),
    late = barrier<Response>()
  let calls = 0
  const { ledger, gateway, call } = await setup((async (_url, init) => {
    calls++
    if (calls === 1) {
      init!.signal!.addEventListener('abort', () => aborted.resolve(), { once: true })
      started.resolve()
      return late.promise
    }
    return Response.json({ choices: [] })
  }) as typeof fetch)
  const first = call()
  await started.promise
  await (await call()).text()
  await aborted.promise
  late.resolve(Response.json({ id: 'late', usage: { cost: 0.03 }, choices: [] }))
  await (await first).text()
  const records = await gateway.end()
  expect(calls).toBe(2)
  expect(records.every((r) => typeof r.dispatchedAt === 'string')).toBe(true)
  expect(records[0]).toMatchObject({ status: 'success', usage: { cost: 0.03 }, responseId: 'late' })
  expect(await ledger.spending()).toMatchObject({
    knownCostUsd: 0.03,
    unknownCount: 1,
    unknownReservedUsd: 0.1,
    heldReservedUsd: 0,
  })
  expect((await call()).status).toBe(429)
})

it('the ledger serializes both orderings and never releases an actually dispatched request as not sent', async () => {
  const { ledger } = await setup((async () =>
    Response.json({ usage: { cost: 0 } })) as typeof fetch)
  await ledger.reserve(reservation('sent'))
  let dispatched = 0
  expect(
    await ledger.dispatch('sent', 0, () => {
      dispatched++
      return true
    }),
  ).toEqual({ ok: true })
  await ledger.release('sent', 'false-not-sent')
  expect((await ledger.entries())[0].status).toBe('held')
  await ledger.reserve(reservation('queued'))
  await ledger.markUnknown('sent', 'fixture-timeout')
  expect(
    await ledger.dispatch('queued', 0, () => {
      dispatched++
      return true
    }),
  ).toMatchObject({ ok: false, reason: 'cost-unknown' })
  expect(dispatched).toBe(1)
  await ledger.markUnknown('sent', 'repeat')
  expect(await ledger.stopState()).toEqual({ epoch: 1, unknownCount: 1 })
})

it('cancel before dispatch releases only the hold, without upstream operation or unknown cost', async () => {
  const queued = barrier(),
    resume = barrier()
  let calls = 0
  const { ledger, gateway, call } = await setup(
    (async () => {
      calls++
      return Response.json({ usage: { cost: 0.01 } })
    }) as typeof fetch,
    (l) => ({
      ...l,
      dispatch: async (...args) => {
        queued.resolve()
        await resume.promise
        return l.dispatch(...args)
      },
    }),
  )
  const controller = new AbortController()
  const request = call(AGENT_MODEL, controller.signal).catch(() => undefined)
  await queued.promise
  controller.abort()
  await request
  const ending = gateway.end()
  resume.resolve()
  const records = await ending
  expect(calls).toBe(0)
  expect(records[0].dispatchedAt).toBeUndefined()
  expect(await ledger.spending()).toMatchObject({
    heldReservedUsd: 0,
    unknownCount: 0,
    knownCostUsd: 0,
  })
})

it('a real dispatched cancellation keeps unknown reserved cost and blocks the next request', async () => {
  const started = barrier()
  let calls = 0
  const { ledger, gateway, call } = await setup((async (_url, init) => {
    calls++
    started.resolve()
    return new Promise((_resolve, reject) =>
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true }),
    )
  }) as typeof fetch)
  const request = call()
  await started.promise
  const records = await gateway.end()
  await request
  expect(calls).toBe(1)
  expect(records[0]).toMatchObject({ status: 'error', usage: null })
  expect(records[0].dispatchedAt).toBeTypeOf('string')
  expect(await ledger.spending()).toMatchObject({ unknownCount: 1, unknownReservedUsd: 0.1 })
  expect(() => gateway.begin('forbidden')).toThrow('validation-cost-unknown')
})

it('local accounting without a shared ledger also latches unknown instead of resetting on begin', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'request-stop-local-'))
  let calls = 0
  const gateway = await startGateway('fixture', directory, (async () => {
    calls++
    throw Error('fixture transport fault')
  }) as typeof fetch)
  try {
    gateway.begin('original', 5)
    const request = () =>
      fetch(gateway.url + '/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${gateway.token}` },
        body: JSON.stringify({ model: AGENT_MODEL }),
      })
    expect((await request()).status).toBe(502)
    expect((await request()).status).toBe(429)
    await gateway.end()
    expect(() => gateway.begin('retry')).toThrow('cost-unknown')
    expect(calls).toBe(1)
  } finally {
    await gateway.close()
    await rm(directory, { recursive: true, force: true })
  }
})

it('an immediate dispatched transport rejection stays an error with unknown cost, never not-sent', async () => {
  let calls = 0
  const { ledger, gateway, call } = await setup((async () => {
    calls++
    throw Error('fixture transport failure')
  }) as typeof fetch)
  expect((await call()).status).toBe(502)
  const [record] = await gateway.end()
  expect(record).toMatchObject({ status: 'error', usage: null })
  expect(record.dispatchedAt).toBeTypeOf('string')
  expect(record.error).toContain('fixture transport failure')
  expect(await ledger.spending()).toMatchObject({ unknownCount: 1, unknownReservedUsd: 0.1 })
  expect(calls).toBe(1)
})

it('a dispatch admission failure closes the gateway without claiming an upstream operation', async () => {
  let calls = 0
  const { ledger, gateway, call } = await setup(
    (async () => {
      calls++
      return Response.json({ usage: { cost: 0 } })
    }) as typeof fetch,
    (l) => ({
      ...l,
      dispatch: async () => {
        throw Error('fixture ledger unavailable')
      },
    }),
  )
  expect((await call()).status).toBe(502)
  expect((await call()).status).toBe(429)
  const [record] = await gateway.end()
  expect(record.dispatchedAt).toBeUndefined()
  expect(calls).toBe(0)
  expect(await ledger.spending()).toMatchObject({ unknownCount: 0, heldReservedUsd: 0 })
  expect(() => gateway.begin('forbidden')).toThrow('ledger-unavailable')
})

it('a committed unknown in another process cancels an already dispatched transport and closes admission', async () => {
  const started = barrier(),
    aborted = barrier()
  let calls = 0
  const { directory, ledger, gateway, call } = await setup((async (_url, init) => {
    calls++
    started.resolve()
    return new Promise((_r, reject) =>
      init!.signal!.addEventListener(
        'abort',
        () => {
          aborted.resolve()
          reject(init!.signal!.reason)
        },
        { once: true },
      ),
    )
  }) as typeof fetch)
  const request = call()
  await started.promise
  const moduleUrl = pathToFileURL(resolve('evaluation/support/campaign-ledger.ts')).href
  const code = `import {openCampaignLedger} from ${JSON.stringify(moduleUrl)}; const l=await openCampaignLedger(${JSON.stringify({ directory, campaignId: ledger.campaignId, limitUsd: 2 })}); await l.reserve(${JSON.stringify(reservation('external'))}); await l.markUnknown('external','fixture-no-usage');l.close();`
  await promisify(execFile)(process.execPath, [
    '--import',
    'tsx',
    '--input-type=module',
    '-e',
    code,
  ])
  await aborted.promise
  await request
  expect((await call()).status).toBe(429)
  const records = await gateway.end()
  expect(calls).toBe(1)
  expect(records[0].dispatchedAt).toBeTypeOf('string')
  expect(await ledger.spending()).toMatchObject({
    unknownCount: 2,
    unknownReservedUsd: 0.2,
    heldReservedUsd: 0,
  })
})
