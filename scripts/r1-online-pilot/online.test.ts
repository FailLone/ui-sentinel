import { it, expect } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openCampaignSession } from '../../evaluation/support/campaign-session.ts'
import { startGateway } from '../../evaluation/support/model-gateway.ts'
import { createBatch } from './batch.ts'
import { makeManifest, POLICY, authorize, AGENT } from './manifest.ts'
import {
  onlinePriority,
  digest,
  createControlledHost,
} from '../../src/agent/exploration/integration/host.ts'
import { replyFor, jsonResponse } from '../r1-jev-real/test-support.ts'
import { checkPublishedPrice } from './preflight.ts'
function frame() {
  const f = JSON.parse(readFileSync('plans/r1-controlled-loop-v1/paid/frame.json', 'utf8'))
  f.input.task.goal = f.facts.goal =
    'Check this page and the UI interactions within the permitted scope, and report grounded problems and unverified scope.'
  for (const c of f.facts.inspectionScope.checks)
    if (f.input.candidates.some((x: any) => x.id === c.itemId))
      c.checks.effects = [{ state: 'pending', late: false }]
  return f
}
async function setup(limit: number = POLICY.batchMaxUsd) {
  const dir = mkdtempSync(join(tmpdir(), 'r1-online-'))
  const session = await openCampaignSession(join(dir, 'account'), String(limit))
  const m = makeManifest('test-source'),
    batch = createBatch(session.ledger, m, dir),
    f = frame()
  batch.activate(
    m.rows.find((r) => r.id === 'ambiguity-jev')!,
    'run-test',
    new URL(f.input.state.url).origin,
  )
  return {
    dir,
    session,
    batch,
    f,
    async close() {
      await batch.drain()
      batch.dispose()
      await session.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
it('strong program baseline handles the known quoted target and permits only residual ambiguity', () => {
  const f = JSON.parse(readFileSync('plans/r1-controlled-loop-v1/paid/frame.json', 'utf8'))
  expect(onlinePriority(f)).toMatchObject({ ambiguity: false })
  expect(f.input.candidates.find((c: any) => c.id === onlinePriority(f).ids[0]).text).toBe('Reveal')
  expect(onlinePriority(frame()).ambiguity).toBe(true)
})
it('actual wire identity is only available under its own atomic ledger dispatch', async () => {
  const t = await setup()
  try {
    expect(() => t.batch.auditWire('unused', '{}')).toThrow('wire-outside')
    for (const id of ['a', 'b']) {
      await t.batch.ledger.reserve({
        requestId: id,
        runId: 'run-test',
        model: AGENT,
        provider: 'Wafer',
        reservedUsd: 0.053,
        phase: 'test',
        priceSource: 'test',
        stopEpoch: 0,
      })
      await t.batch.ledger.dispatch(id, 0, () => {
        t.batch.auditWire('local-fixed', JSON.stringify({ messages: [id] }))
        return true
      })
    }
    const wires = readFileSync(join(t.dir, 'bindings.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((s) => JSON.parse(s))
      .filter((e) => e.stage === 'actual-wire-binding')
    expect(wires.map((w) => [w.requestId, w.state[0]])).toEqual([
      ['a', 'a'],
      ['b', 'b'],
    ])
  } finally {
    await t.close()
  }
})
it('old static approval cannot authorize dynamic frames or a changed manifest', () => {
  const m = makeManifest('test-source')
  expect(() => authorize(m, { freezeHash: 'old', approvedBy: 'x' }, 'test-source')).toThrow()
  const approval = {
    manifestHash: digest(m),
    approvedBy: 'x',
    approvalReference: 'test-only',
    maxRuns: 9,
    maxCostUsd: POLICY.batchMaxUsd,
    expiresAt: new Date(Date.now() + 1000).toISOString(),
  }
  expect(() => authorize(m, approval, 'test-source')).not.toThrow()
  expect(() => authorize({ ...m, sourceSha: 'changed' }, approval, 'test-source')).toThrow()
})
it('checks both pinned official quotes without inference and rejects an increased Jev rate', async () => {
  const snapshot = JSON.parse(readFileSync('plans/r1-online-pilot/price-source.json', 'utf8'))
  const reader = (higher = false) =>
    (async (url: any) => {
      const e = structuredClone(
        String(url).includes('typesafe') ? snapshot.jev.endpoint : snapshot.endpoint,
      )
      if (higher && String(url).includes('typesafe')) e.pricing.prompt = '0.000001'
      return Response.json({ data: { endpoints: [e] } })
    }) as typeof fetch
  await expect(checkPublishedPrice(reader())).resolves.toHaveProperty(
    'jevEndpoint.provider_name',
    'TypeSafe',
  )
  await expect(checkPublishedPrice(reader(true))).rejects.toThrow('jev-price')
})
it('online host rejects a receipt from another full frame and never proposes its action', async () => {
  const f = frame()
  const host = createControlledHost({
    onlinePolicy: true,
    score: async (frame) => ({
      binding: frame.binding,
      packetHash: 'previous-frame',
      kind: 'scores',
      orderedIds: frame.input.candidates.map((c) => c.id),
    }),
  })
  expect(
    await host.decide(f.facts, {
      signal: new AbortController().signal,
      version: { key: f.binding, reusable: true, reason: 'test' },
    }),
  ).toMatchObject({ kind: 'handoff', reason: 'stale-score' })
})
it('an Agent reservation consumes the same dollars that Jev would need', async () => {
  const t = await setup(0.055)
  let sent = 0
  try {
    await t.batch.ledger.reserve({
      requestId: 'held-main',
      runId: 'run-test',
      model: AGENT,
      provider: 'Wafer',
      reservedUsd: 0.053,
      phase: 'test',
      priceSource: 'test',
      stopEpoch: 0,
    })
    expect(
      (
        await t.batch.score(t.f, 'run-test', new AbortController().signal, 'test-key', async () => {
          sent++
          throw Error('must-not-dispatch')
        })
      ).kind,
    ).toBe('handoff')
    expect(sent).toBe(0)
    expect((await t.session.ledger.spending()).heldReservedUsd).toBe(0.053)
  } finally {
    await t.close()
  }
})
it('Jev unknown stops the actual Agent gateway; later reconciliation cannot revive its epoch', async () => {
  const t = await setup()
  let agentFetches = 0
  const gateway = await startGateway(
    'test-key',
    t.dir,
    (async () => {
      agentFetches++
      throw Error('should-not-dispatch')
    }) as typeof fetch,
    {
      limitUsd: POLICY.batchMaxUsd,
      ledger: t.batch.ledger,
      estimateCost: t.batch.estimate,
      providers: { agent: 'Wafer', vision: 'disabled' },
    },
  )
  gateway.begin('run-test', 8, 30000)
  try {
    const result = await t.batch.score(
      t.f,
      'run-test',
      new AbortController().signal,
      'test-key',
      async (_url, init) => {
        const body = JSON.parse(String(init.body))
        expect(body.provider).toEqual({ allow_fallbacks: false, only: ['TypeSafe'] })
        const r: any = replyFor(body)
        delete r.usage.cost
        return jsonResponse(r)
      },
    )
    expect(result.kind).toBe('handoff')
    expect((await t.session.ledger.spending()).unknownCount).toBe(1)
    const request = (await t.session.ledger.entries())[0]
    await t.session.ledger.reconcile({
      requestId: request.requestId,
      generationId: 'late',
      model: POLICY.jev.model,
      provider: 'TypeSafe',
      actualUsd: 0.001,
      evidence: { explicit: 'late-test-receipt' },
    })
    expect((await t.session.ledger.spending()).unknownCount).toBe(0)
    const r = await fetch(gateway.url + '/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + gateway.token, 'content-type': 'application/json' },
      body: JSON.stringify({ model: AGENT, messages: [] }),
    })
    expect(r.status).toBe(429)
    expect(agentFetches).toBe(0)
  } finally {
    await gateway.close()
    await t.close()
  }
})
it('Agent unknown stops Jev before fetch on the same account', async () => {
  const t = await setup()
  let jevFetches = 0
  const gateway = await startGateway(
    'test-key',
    t.dir,
    (async () =>
      Response.json({
        id: 'unknown',
        model: AGENT,
        provider: 'Wafer',
        choices: [],
        usage: {},
      })) as typeof fetch,
    {
      limitUsd: POLICY.batchMaxUsd,
      ledger: t.batch.ledger,
      estimateCost: t.batch.estimate,
      providers: { agent: 'Wafer', vision: 'disabled' },
    },
  )
  gateway.begin('run-test', 8, 30000)
  try {
    await (
      await fetch(gateway.url + '/chat/completions', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + gateway.token, 'content-type': 'application/json' },
        body: JSON.stringify({ model: AGENT, messages: [] }),
      })
    ).text()
    await gateway.end()
    await expect(
      t.batch.score(t.f, 'run-test', new AbortController().signal, 'test-key', async () => {
        jevFetches++
        throw Error('not-sent')
      }),
    ).rejects.toThrow()
    expect(jevFetches).toBe(0)
    expect((await t.session.ledger.spending()).unknownCount).toBe(1)
  } finally {
    await gateway.close()
    await t.close()
  }
})
it('shared request cap and held money bound both models; wrong run/frame source dispatches nothing', async () => {
  const t = await setup()
  try {
    for (let i = 0; i < 8; i++)
      expect(
        (
          await t.batch.ledger.reserve({
            requestId: 'main-' + i,
            runId: 'run-test',
            model: AGENT,
            provider: 'Wafer',
            reservedUsd: 0.053,
            phase: 'test',
            priceSource: 'test',
            stopEpoch: 0,
          })
        ).ok,
      ).toBe(true)
    expect((await t.session.ledger.spending()).heldReservedUsd).toBeCloseTo(0.424)
    const bad = structuredClone(t.f)
    bad.input.state.url = 'https://outside.invalid/'
    await expect(
      t.batch.score(bad, 'run-test', new AbortController().signal, 'test-key', async () => {
        throw Error('must-not-send')
      }),
    ).rejects.toThrow('frame-scope')
    expect(
      (
        await t.batch.ledger.reserve({
          requestId: 'over-limit',
          runId: 'run-test',
          model: AGENT,
          provider: 'Wafer',
          reservedUsd: 0.053,
          phase: 'test',
          priceSource: 'test',
          stopEpoch: 0,
        })
      ).ok,
    ).toBe(false)
  } finally {
    await t.close()
  }
})
it('cancelled in-flight Jev keeps late cost evidence but never returns scores or revives the batch', async () => {
  const t = await setup(),
    cancel = new AbortController()
  try {
    const r = await t.batch.score(
      t.f,
      'run-test',
      cancel.signal,
      'test-key',
      async (_url, init) => {
        setTimeout(() => cancel.abort(), 5)
        await new Promise((r) => setTimeout(r, 25))
        return jsonResponse(replyFor(JSON.parse(String(init.body))))
      },
    )
    expect(r.kind).toBe('handoff')
    await t.batch.drain()
    expect((await t.session.ledger.spending()).knownCostUsd).toBe(0.001)
    expect((await t.session.ledger.stopState()).epoch).toBe(1)
    expect(() => t.batch.guard()).toThrow()
  } finally {
    await t.close()
  }
})
it('an already-dispatched Agent reply settles late after Jev unknown; no new request is admitted', async () => {
  const t = await setup()
  let resolveReply!: (r: Response) => void, started!: () => void
  const ready = new Promise<void>((r) => (started = r))
  const gateway = await startGateway(
    'test-key',
    t.dir,
    (async () => {
      started()
      return new Promise<Response>((r) => (resolveReply = r))
    }) as typeof fetch,
    {
      limitUsd: POLICY.batchMaxUsd,
      ledger: t.batch.ledger,
      estimateCost: t.batch.estimate,
      providers: { agent: 'Wafer', vision: 'disabled' },
    },
  )
  gateway.begin('run-test', 8, 30000)
  try {
    const call = fetch(gateway.url + '/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + gateway.token, 'content-type': 'application/json' },
      body: JSON.stringify({ model: AGENT, messages: [] }),
    }).then((r) => r.text())
    await ready
    await t.batch.score(
      t.f,
      'run-test',
      new AbortController().signal,
      'test-key',
      async (_url, init) => {
        const r: any = replyFor(JSON.parse(String(init.body)))
        delete r.usage.cost
        return jsonResponse(r)
      },
    )
    resolveReply(
      Response.json({
        id: 'late-main',
        model: AGENT,
        provider: 'Wafer',
        choices: [],
        usage: { cost: 0.02 },
      }),
    )
    await call
    await gateway.end()
    expect((await t.session.ledger.spending()).knownCostUsd).toBe(0.02)
    expect((await t.session.ledger.spending()).unknownReservedUsd).toBe(0.003)
    expect(() => t.batch.guard()).toThrow()
  } finally {
    await gateway.close()
    await t.close()
  }
})
