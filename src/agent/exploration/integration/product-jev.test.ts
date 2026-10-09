import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { productJevConfiguration, createProductJevScore } from './product-jev.ts'
import { openCampaignSession } from '../../../../evaluation/support/campaign-session.ts'
import { testInput, replyFor, jsonResponse } from '../../../../scripts/r1-jev-real/test-support.ts'
import { compileFrame, requestFor } from './jev.ts'
import { DEFAULT_PROFILE } from '../../decisions/jev-provider/profile.ts'
import { digest, REVISION, type PublicFrame } from './host.ts'
const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'r1-score-test-'))
  dirs.push(directory)
  const session = await openCampaignSession(directory, '1')
  await session.close()
  const input = structuredClone(testInput())
  input.candidates = input.candidates.slice(0, 2)
  input.scope.executableCandidateIds = input.candidates.map((c) => c.id)
  const frame: PublicFrame = {
    revision: REVISION,
    binding: input.state.observationVersion,
    input,
    facts: { observation: { pageText: 'Public controls' }, inspectionScope: { checks: [] } },
  }
  const events: any[] = [],
    saved: any[] = []
  let calls = 0,
    keys = 0,
    fetches = 0
  const score = createProductJevScore({
    runId: 'free-test',
    configuration: {
      directory,
      limitUsd: 1,
      key: () => {
        keys++
        return 'synthetic-secret-never-real'
      },
    },
    quote: async () => {},
    countCall: async () => {
      calls++
    },
    timeRemaining: () => 10000,
    save: async (kind, body) => {
      saved.push({ kind, body })
      return 'ref-' + saved.length
    },
    emit: async (p, refs) => {
      events.push({ ...p, refs })
    },
    http: async () => {
      fetches++
      return jsonResponse(
        replyFor(
          compileFrame(requestFor(frame), {
            ...DEFAULT_PROFILE,
            readinessConfidence: 0.5,
            maxQuestions: 7,
            maxResponseBytes: 65536,
          }),
        ),
      )
    },
  })
  return { directory, frame, score, events, saved, counts: () => ({ calls, keys, fetches }) }
}
it('default or missing-account configuration cannot create or activate a fee account', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'r1-no-account-'))
  dirs.push(directory)
  expect(productJevConfiguration({})).toBeUndefined()
  expect(
    productJevConfiguration({
      EXECUTION_R1_JEV: '1',
      R1_JEV_ACCOUNT_DIRECTORY: directory,
      R1_JEV_LIMIT_USD: '1',
      R1_JEV_API_KEY: 'fake',
    }),
  ).toBeUndefined()
  expect(await readdir(directory)).toEqual([])
})
it('binds one synthetic receipt to the exact frame, counts a model call, settles actual cost and stores evidence', async () => {
  const x = await setup(),
    result = await x.score(x.frame, new AbortController().signal)
  expect(result).toMatchObject({
    binding: x.frame.binding,
    packetHash: digest(x.frame),
    kind: 'scores',
  })
  expect(x.counts()).toEqual({ calls: 1, keys: 1, fetches: 1 })
  expect(x.saved.map((x) => x.kind)).toEqual(['r1-jev-request', 'r1-jev-response'])
  expect(JSON.parse(x.saved[0].body).provider).toEqual({
    allow_fallbacks: false,
    only: ['TypeSafe'],
  })
  expect(x.events[0]).toMatchObject({ dispatched: true, actualUsd: 0.001 })
  const session = await openCampaignSession(x.directory, '1')
  try {
    expect((await session.ledger.entries())[0]).toMatchObject({
      status: 'settled',
      actualUsd: 0.001,
    })
  } finally {
    await session.close()
  }
})
it('an existing unknown blocks credential access and dispatch; it remains unknown', async () => {
  const x = await setup(),
    session = await openCampaignSession(x.directory, '1')
  await session.ledger.reserve({
    requestId: 'old',
    runId: 'old',
    phase: 'test',
    model: 'm',
    provider: 'p',
    reservedUsd: 0.053,
    priceSource: 'synthetic',
    stopEpoch: 0,
  })
  await session.ledger.markUnknown('old', 'simulated-old-unknown')
  await session.close()
  const before = await readFile(join(x.directory, 'campaign.db'))
  await expect(x.score(x.frame, new AbortController().signal)).rejects.toThrow('account-stopped')
  expect(await readFile(join(x.directory, 'campaign.db'))).toEqual(before)
  expect(x.counts()).toEqual({ calls: 0, keys: 0, fetches: 0 })
  const reread = await openCampaignSession(x.directory, '1')
  try {
    expect((await reread.ledger.stopState()).unknownCount).toBe(1)
  } finally {
    await reread.close()
  }
})
it('a synthetic HTTP 400 is dispatched once, becomes unknown, and prevents further calls', async () => {
  const x = await setup()
  let sent = 0
  const events: any[] = []
  const score = createProductJevScore({
    runId: 'free-http-error',
    configuration: {
      directory: x.directory,
      limitUsd: 1,
      key: () => 'synthetic-secret-never-real',
    },
    quote: async () => {},
    countCall: async () => {},
    timeRemaining: () => 10000,
    save: async () => 'request-ref',
    emit: async (p) => {
      events.push(p)
    },
    http: async () => {
      sent++
      return new Response('{}', { status: 400 })
    },
  })
  await expect(score(x.frame, new AbortController().signal)).rejects.toThrow('account-stopped')
  await expect(score(x.frame, new AbortController().signal)).rejects.toThrow('account-stopped')
  expect(sent).toBe(1)
  expect(events[0]).toMatchObject({ dispatched: true, actualUsd: null })
})
it('cancellation and an unambiguous explicit target dispatch nothing', async () => {
  const x = await setup()
  const controller = new AbortController()
  controller.abort()
  await expect(x.score(x.frame, controller.signal)).rejects.toThrow()
  x.frame.input.task.goal = 'Inspect "' + x.frame.input.candidates[0].text + '"'
  await expect(x.score(x.frame, new AbortController().signal)).rejects.toThrow('program-sufficient')
  expect(x.counts()).toEqual({ calls: 0, keys: 0, fetches: 0 })
})
