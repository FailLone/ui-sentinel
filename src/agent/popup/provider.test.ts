import { createPopupAccountOwner } from './account-owner.ts'
import { afterEach, it, expect, vi } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPopupProvider, normalizePopupResponse, popupConfiguration } from './provider.ts'
import { choices, wireQuestion, type PopupQuestion } from './contract.ts'
import { openCampaignSession } from '../../../evaluation/support/campaign-session.ts'
const dirs: string[] = []
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
})
const packet: PopupQuestion = {
  revision: 'popup-viewport-1',
  stage: 'entry',
  binding: 'state',
  goal: 'popup bounds',
  candidates: [{ id: 'entry', description: 'Open details' }],
  evidenceRefs: ['public'],
  missing: ['entry'],
  attempts: [],
}
const response = () => ({
  id: 'fixed',
  model: 'typesafe/jev-1.13-20260917',
  provider: 'TypeSafe',
  answers: {
    popup: {
      type: 'choice',
      choice: 'entry',
      confidence: 0.9,
      probabilities: Object.fromEntries(
        Object.keys(choices(packet)).map((id) => [id, id === 'entry' ? 1 : 0]),
      ),
    },
  },
  usage: { input_tokens: 100, output_tokens: 0, cost: 0.00001 },
})
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'popup-provider-'))
  dirs.push(directory)
  const account = await openCampaignSession(directory, '1')
  await account.close()
  const key = vi.fn(() => 'synthetic-only'),
    countCall = vi.fn(async () => {}),
    http = vi.fn<typeof fetch>(async (_url, init) => {
      const wire = JSON.parse(String(init?.body)),
        q = wire.questions.popup
      // Protocol oracle follows the documented Decisions shape, independently of wireQuestion.
      if (
        q.type !== 'choice' ||
        typeof q.instructions !== 'string' ||
        !q.criteria ||
        typeof q.criteria !== 'object' ||
        Array.isArray(q.criteria) ||
        'choices' in q
      )
        return Response.json(
          { error: { code: 400, message: 'invalid choice schema' } },
          { status: 400 },
        )
      return Response.json(response())
    })
  const saved: string[] = []
  const options = {
    configuration: { directory, limitUsd: 1, key },
    runId: 'free',
    countCall,
    timeRemaining: () => 20000,
    save: async (kind: string, _body: string) => {
      saved.push(kind)
      return kind
    },
    emit: async () => {},
    quote: async () => {},
    http,
  }
  return { directory, key, countCall, http, saved, options }
}
it('uses a finite semantic choice rather than ranking, validates identity/distribution and confidence', () => {
  const body = JSON.parse(wireQuestion(packet))
  expect(body.questions.popup.type).toBe('choice')
  expect(body.questions.popup.instructions).toContain('floating panel or another entry')
  expect(normalizePopupResponse(response(), packet).choice).toBe('entry')
  const r = response()
  r.answers.popup.confidence = 0.4
  expect(normalizePopupResponse(r, packet).choice).toBe('handoff')
  expect(() => normalizePopupResponse({ ...r, provider: 'Other' }, packet)).toThrow()
  r.answers.popup.probabilities = { invented: 1 }
  expect(() => normalizePopupResponse(r, packet)).toThrow()
  expect(popupConfiguration({})).toBeUndefined()
})
it('settles exactly one accounted synthetic call and stores request/response before returning', async () => {
  const x = await setup(),
    decide = createPopupProvider(x.options)
  expect((await decide(packet, new AbortController().signal)).choice).toBe('entry')
  expect(x.countCall).toHaveBeenCalledTimes(1)
  expect(x.key).toHaveBeenCalledTimes(1)
  expect(x.http).toHaveBeenCalledTimes(1)
  expect(x.saved).toEqual(['popup-jev-request', 'popup-jev-response', 'popup-jev-transport'])
  const s = await openCampaignSession(x.directory, '1')
  try {
    expect((await s.ledger.entries())[0]).toMatchObject({ status: 'settled', actualUsd: 0.00001 })
  } finally {
    await s.close()
  }
})
it('preserves stopped/unknown accounts before reading a credential; cancellation never dispatches', async () => {
  const x = await setup(),
    s = await openCampaignSession(x.directory, '1')
  await s.ledger.reserve({
    requestId: 'old',
    runId: 'old',
    phase: 'test',
    model: 'synthetic',
    provider: 'synthetic',
    reservedUsd: 0.1,
    priceSource: 'test',
    stopEpoch: 0,
  })
  await s.ledger.markUnknown('old', 'test')
  await s.close()
  const before = await readFile(join(x.directory, 'campaign.db'))
  await expect(
    createPopupProvider(x.options)(packet, new AbortController().signal),
  ).rejects.toThrow('stopped')
  expect(await readFile(join(x.directory, 'campaign.db'))).toEqual(before)
  expect(x.key).not.toHaveBeenCalled()
  expect(x.http).not.toHaveBeenCalled()
  const y = await setup(),
    aborted = new AbortController()
  aborted.abort(Error('cancelled'))
  await expect(createPopupProvider(y.options)(packet, aborted.signal)).rejects.toThrow('cancelled')
  expect(y.key).not.toHaveBeenCalled()
  expect(y.http).not.toHaveBeenCalled()
})
it('records unknown response cost, stops future decisions and never retries', async () => {
  const x = await setup()
  x.http.mockImplementation(async () => Response.json({ ...response(), usage: {} }))
  const decide = createPopupProvider(x.options)
  await expect(decide(packet, new AbortController().signal)).rejects.toThrow('stopped')
  await expect(decide(packet, new AbortController().signal)).rejects.toThrow('budget')
  expect(x.http).toHaveBeenCalledTimes(1)
  const s = await openCampaignSession(x.directory, '1')
  try {
    expect((await s.ledger.stopState()).unknownCount).toBe(1)
  } finally {
    await s.close()
  }
})
it('refuses an insufficient fee reserve before credential access and bounds six decisions', async () => {
  const x = await setup()
  const account = await openCampaignSession(x.directory, '1')
  await account.ledger.reserve({
    requestId: 'held',
    runId: 'other',
    phase: 'test',
    model: 'synthetic',
    provider: 'synthetic',
    reservedUsd: 0.999,
    priceSource: 'test',
    stopEpoch: 0,
  })
  await account.close()
  await expect(
    createPopupProvider(x.options)(packet, new AbortController().signal),
  ).rejects.toThrow('unavailable')
  expect(x.key).not.toHaveBeenCalled()
  expect(x.http).not.toHaveBeenCalled()
  const y = await setup(),
    decide = createPopupProvider(y.options)
  for (let i = 0; i < 6; i++) await decide(packet, new AbortController().signal)
  await expect(decide(packet, new AbortController().signal)).rejects.toThrow('budget')
  expect(y.countCall).toHaveBeenCalledTimes(6)
})
it('aborts a non-cooperative in-flight transport and books unknown rather than releasing a sent request', async () => {
  const x = await setup(),
    controller = new AbortController()
  x.http.mockImplementation(async () => {
    queueMicrotask(() => controller.abort(Error('cancelled')))
    return new Promise<Response>(() => {})
  })
  await expect(createPopupProvider(x.options)(packet, controller.signal)).rejects.toThrow('stopped')
  const account = await openCampaignSession(x.directory, '1')
  try {
    expect((await account.ledger.entries())[0]?.status).toBe('unknown')
  } finally {
    await account.close()
  }
})

it('shares one parent lease across overlapping requests and drains before releasing it', async () => {
  const x = await setup(),
    owner = createPopupAccountOwner()
  const pending: ((response: Response) => void)[] = []
  x.http.mockImplementation(() => new Promise<Response>((resolve) => pending.push(resolve)))
  const options = { ...x.options, accountOwner: owner }
  const a = createPopupProvider({ ...options, runId: 'child-a' })(
    packet,
    new AbortController().signal,
  )
  const b = createPopupProvider({ ...options, runId: 'child-b' })(
    packet,
    new AbortController().signal,
  )
  const results = Promise.allSettled([a, b])
  await vi.waitFor(() => expect(pending).toHaveLength(2))
  await expect(openCampaignSession(x.directory, '1')).rejects.toThrow('lease-held')
  const borrowed = await owner.acquire(x.options.configuration)
  expect((await borrowed.session.ledger.spending()).heldReservedUsd).toBe(0.006)
  borrowed.release()
  let released = false
  const closing = owner.close().then(() => {
    released = true
  })
  await Promise.resolve()
  expect(released).toBe(false)
  pending[0]!(Response.json(response()))
  await a
  expect(released).toBe(false)
  pending[1]!(Response.json(response()))
  expect((await results).map((r) => r.status)).toEqual(['fulfilled', 'fulfilled'])
  await closing
  const reopened = await openCampaignSession(x.directory, '1')
  try {
    const rows = await reopened.ledger.entries()
    expect(rows.map((r) => r.runId).sort()).toEqual(['child-a', 'child-b'])
    expect(rows.every((r) => r.status === 'settled')).toBe(true)
    expect((await reopened.ledger.spending()).knownCostUsd).toBe(0.00002)
  } finally {
    await reopened.close()
  }
})

it('an unknown child cost stops its sibling and keeps both sent reservations unknown', async () => {
  const x = await setup(),
    owner = createPopupAccountOwner()
  const pending: ((response: Response) => void)[] = []
  x.http.mockImplementation(() => new Promise<Response>((resolve) => pending.push(resolve)))
  const options = { ...x.options, accountOwner: owner }
  const results = Promise.allSettled(
    ['a', 'b'].map((runId) =>
      createPopupProvider({ ...options, runId })(packet, new AbortController().signal),
    ),
  )
  await vi.waitFor(() => expect(pending).toHaveLength(2))
  pending[0]!(Response.json({ ...response(), usage: {} }))
  expect((await results).every((r) => r.status === 'rejected')).toBe(true)
  pending[1]!(Response.json(response())) // Late response cannot resurrect the aborted sibling.
  await owner.close()
  const reopened = await openCampaignSession(x.directory, '1')
  try {
    expect((await reopened.ledger.entries()).map((r) => r.status)).toEqual(['unknown', 'unknown'])
    expect((await reopened.ledger.spending()).unknownReservedUsd).toBe(0.006)
  } finally {
    await reopened.close()
  }
  await expect(
    createPopupProvider(x.options)(packet, new AbortController().signal),
  ).rejects.toThrow('stopped')
  expect(x.http).toHaveBeenCalledTimes(2)
})

it('serializes original fee reservations when siblings compete for the last balance', async () => {
  const x = await setup(),
    owner = createPopupAccountOwner()
  const borrowed = await owner.acquire(x.options.configuration)
  await borrowed.session.ledger.reserve({
    requestId: 'prior-held',
    runId: 'prior',
    phase: 'test',
    model: 'synthetic',
    provider: 'synthetic',
    reservedUsd: 0.995,
    priceSource: 'test',
    stopEpoch: 0,
  })
  borrowed.release()
  const pending: ((response: Response) => void)[] = []
  x.http.mockImplementation(() => new Promise<Response>((resolve) => pending.push(resolve)))
  const results = Promise.allSettled(
    ['a', 'b'].map((runId) =>
      createPopupProvider({
        ...x.options,
        accountOwner: owner,
        runId,
      })(packet, new AbortController().signal),
    ),
  )
  await vi.waitFor(() => expect(pending).toHaveLength(1))
  await vi.waitFor(() => expect(x.countCall).toHaveBeenCalledTimes(1))
  pending[0]!(Response.json(response()))
  expect((await results).map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
  expect(x.key).toHaveBeenCalledTimes(1)
  await owner.close()
})

it('records the first failing child at the actual product boundary and stops its sibling without freeing unknown fees', async () => {
  const x = await setup(),
    owner = createPopupAccountOwner()
  const pending: ((response: Response) => void)[] = [],
    records: any[] = [],
    events: any[] = []
  const controller = new AbortController()
  x.http.mockImplementation(() => new Promise<Response>((resolve) => pending.push(resolve)))
  const results = Promise.allSettled(
    ['first', 'second'].map((runId) =>
      createPopupProvider({
        ...x.options,
        runId,
        accountOwner: owner,
        observeTransport: (record) => {
          records.push(record)
          if (record.failureSequence) controller.abort(Error('first-provider-error'))
        },
        emit: async (payload) => {
          events.push(payload)
        },
      })(packet, controller.signal),
    ),
  )
  await vi.waitFor(() => expect(pending).toHaveLength(2))
  pending[1]!(
    Response.json(
      { error: { message: 'bad choice schema' } },
      { status: 400, headers: { 'x-request-id': 'req-b' } },
    ),
  )
  expect((await results).every((r) => r.status === 'rejected')).toBe(true)
  await owner.close()
  const first = records
    .filter((r) => r.failureSequence)
    .sort((a, b) => a.failureSequence - b.failureSequence)[0]
  expect(first).toMatchObject({ runId: 'second', outcome: 'http-error', httpStatus: 400 })
  expect(events.find((e) => e.transport.runId === 'second').transport.errorBody).toContain(
    'bad choice schema',
  )
  expect(events.find((e) => e.transport.runId === 'first').transport.outcome).toBe('cancelled')
  const account = await openCampaignSession(x.directory, '1')
  try {
    expect((await account.ledger.entries()).map((r) => r.status)).toEqual(['unknown', 'unknown'])
    expect((await account.ledger.spending()).heldReservedUsd).toBe(0)
  } finally {
    await account.close()
  }
  expect(x.http).toHaveBeenCalledTimes(2)
})

it('diagnostic artifact write failure retains the original HTTP error and original unknown stop', async () => {
  const x = await setup(),
    events: any[] = []
  x.http.mockImplementation(async () => Response.json({ error: 'bad' }, { status: 500 }))
  await expect(
    createPopupProvider({
      ...x.options,
      save: async (kind) => {
        if (kind === 'popup-jev-transport') throw Error('disk')
        return kind
      },
      emit: async (p) => {
        events.push(p)
      },
    })(packet, new AbortController().signal),
  ).rejects.toThrow('stopped')
  expect(events[0].transport).toMatchObject({
    outcome: 'http-error',
    httpStatus: 500,
    loggingFailed: true,
  })
  expect(events[0].actualUsd).toBeNull()
})

it('the product deadline aborts transport and preserves timeout classification with unknown fees', async () => {
  const x = await setup(),
    events: any[] = []
  x.http.mockImplementation(() => new Promise<Response>(() => {}))
  await expect(
    createPopupProvider({
      ...x.options,
      timeRemaining: () => 2000,
      emit: async (p) => {
        events.push(p)
      },
    })(packet, new AbortController().signal),
  ).rejects.toThrow('stopped')
  expect(events[0].transport.outcome).toBe('timeout')
  expect(events[0].actualUsd).toBeNull()
  expect(x.http).toHaveBeenCalledTimes(1)
})

it('keeps low-confidence read as a semantic suggestion, while retaining the 0.65 action gate and contextual read prohibition', () => {
  const raw = response()
  raw.answers.popup.choice = 'read'
  raw.answers.popup.confidence = 0.2
  raw.answers.popup.probabilities = { entry: 0.1, read: 0.6, handoff: 0.3 }
  expect(normalizePopupResponse(raw, packet).choice).toBe('read')
  const blocked = {
    ...packet,
    context: {
      observation: {
        text: 'New actual entry',
        visiblePanels: 0,
        newEntryIds: ['entry'],
        changedSinceAction: true,
      },
      remaining: { actions: 2, calls: 2, reads: 2, timeMs: 10000 },
      read: { allowed: false, reason: 'reuse-new-entry' },
    },
  }
  expect(choices(blocked)).not.toHaveProperty('read')
  expect(() => normalizePopupResponse(raw, blocked)).toThrow()
})
