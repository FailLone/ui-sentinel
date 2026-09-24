import { it, expect, describe } from 'vitest'
import {
  normalizeFactEvents,
  retryableTriggerFromFacts,
  latestFactForOperation,
  legacyCheckoutTrigger,
} from './facts.ts'
import type { RunEvent } from '../shared/types.ts'

const factEvent = (payload: Record<string, unknown>, id = 'e1'): RunEvent =>
  ({
    id,
    runId: 'r',
    seq: 1,
    timestamp: new Date(0).toISOString(),
    stepId: null,
    actionId: null,
    evidenceRefs: [],
    type: 'business:fact',
    payload,
  }) as RunEvent

const legacyResponse = (payload: Record<string, unknown>, id = 'e2'): RunEvent =>
  ({
    id,
    runId: 'r',
    seq: 1,
    timestamp: new Date(0).toISOString(),
    stepId: null,
    actionId: null,
    evidenceRefs: [],
    type: 'business:response',
    payload,
  }) as RunEvent

const exportFact = (over: Record<string, unknown> = {}) => ({
  schemaVersion: '1',
  profileId: 'export',
  contractHash: 'h',
  operationId: 'job-1',
  attempt: 0,
  version: 2,
  phase: 'failed',
  result: 'unknown',
  retryEligibility: 'allowed',
  notice: 'Export could not complete. You may try again.',
  retry: { permitted: true, remaining: 1, afterMs: 0, prerequisitesMet: true },
  sourceEventId: 'e1',
  evidenceRefs: [],
  observedAt: new Date(0).toISOString(),
  ...over,
})

describe('normalized business facts (B03, B06, B10)', () => {
  it('reads normalized facts from business:fact events', () => {
    const facts = normalizeFactEvents([factEvent(exportFact())])
    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({ operationId: 'job-1', phase: 'failed', attempt: 0 })
  })

  it('ignores malformed fact payloads instead of half-trusting them', () => {
    expect(normalizeFactEvents([factEvent({ schemaVersion: '1' })])).toHaveLength(0)
    expect(normalizeFactEvents([factEvent(exportFact({ phase: 'nonsense' }))])).toHaveLength(0)
    expect(normalizeFactEvents([factEvent(exportFact({ operationId: '' }))])).toHaveLength(0)
    expect(normalizeFactEvents([factEvent(exportFact({ attempt: -1 }))])).toHaveLength(0)
  })

  it('deduplicates by identity, attempt and version', () => {
    const older = factEvent(exportFact({ version: 1, phase: 'processing' }), 'e-a')
    const newer = factEvent(exportFact({ version: 2, phase: 'failed' }), 'e-b')
    expect(normalizeFactEvents([older, newer])).toHaveLength(2)
    // A repeated identical status keeps one identity, so a duplicate GET cannot open a second
    // investigation or refresh spent retry allowance.
    const repeated = normalizeFactEvents([
      newer,
      factEvent(exportFact({ version: 2, phase: 'failed' }), 'e-c'),
    ])
    expect(new Set(repeated.map((f) => `${f.operationId}#${f.attempt}#${f.version}`)).size).toBe(1)
  })

  it('keeps different attempts as separate facts so a new attempt re-correlates', () => {
    const a0 = factEvent(exportFact({ attempt: 0 }), 'e-0')
    const a1 = factEvent(exportFact({ attempt: 1, version: 1 }), 'e-1')
    expect(normalizeFactEvents([a0, a1]).map((f) => f.attempt)).toEqual([0, 1])
  })

  it('selects the newest fact for one operation by version, not merely the last event', () => {
    const facts = normalizeFactEvents([
      factEvent(exportFact({ version: 3, phase: 'processing' }), 'e-late-old'),
      factEvent(exportFact({ version: 1, phase: 'processing' }), 'e-early'),
    ])
    expect(latestFactForOperation(facts, 'job-1')!.version).toBe(3)
    expect(latestFactForOperation(facts, 'job-other')).toBeUndefined()
  })

  it('does not treat a fact belonging to another operation as this one', () => {
    const mine = factEvent(exportFact({ operationId: 'job-mine', phase: 'processing' }), 'e-m')
    const theirs = factEvent(exportFact({ operationId: 'job-theirs', phase: 'succeeded' }), 'e-t')
    const facts = normalizeFactEvents([mine, theirs])
    expect(latestFactForOperation(facts, 'job-mine')!.phase).toBe('processing')
    expect(latestFactForOperation(facts, 'job-theirs')!.phase).toBe('succeeded')
  })

  it('keeps a new success from being overwritten by a late older response', () => {
    const facts = normalizeFactEvents([
      factEvent(exportFact({ version: 5, phase: 'succeeded' }), 'e-new'),
      factEvent(exportFact({ version: 4, phase: 'failed' }), 'e-old'),
    ])
    const latest = latestFactForOperation(facts, 'job-1')!
    expect(latest.phase).toBe('succeeded')
    expect(latest.version).toBe(5)
  })
})

describe('normalized retryable trigger (R01, B09)', () => {
  it('offers a retryable trigger from a normalized eligible failure with no order id field', () => {
    const trigger = retryableTriggerFromFacts(normalizeFactEvents([factEvent(exportFact())]))
    expect(trigger).toMatchObject({
      operationId: 'job-1',
      eventType: 'retryable-failure',
      attempt: 0,
      eventRef: 'e1',
    })
    expect(JSON.stringify(trigger)).not.toContain('orderId')
  })

  it('does not offer a trigger when eligibility is not explicitly allowed', () => {
    for (const retryEligibility of ['denied', 'unknown'])
      expect(
        retryableTriggerFromFacts(
          normalizeFactEvents([factEvent(exportFact({ retryEligibility }))]),
        ),
      ).toBeUndefined()
  })

  it('does not offer a trigger for a processing, succeeded or rejected fact', () => {
    for (const phase of ['processing', 'succeeded', 'rejected'])
      expect(
        retryableTriggerFromFacts(normalizeFactEvents([factEvent(exportFact({ phase }))])),
      ).toBeUndefined()
  })

  it('does not offer a trigger when the public decision denies it, even if labelled a failure', () => {
    for (const retry of [
      { permitted: false, remaining: 0, afterMs: 0, prerequisitesMet: true },
      { permitted: true, remaining: 0, afterMs: 0, prerequisitesMet: true },
      { permitted: true, remaining: 1, afterMs: 4000, prerequisitesMet: true },
      { permitted: true, remaining: 1, afterMs: 0, prerequisitesMet: false },
    ])
      expect(
        retryableTriggerFromFacts(normalizeFactEvents([factEvent(exportFact({ retry }))])),
      ).toBeUndefined()
  })

  it('still reaches a trigger from the checkout compatibility event so shopping is unchanged', () => {
    const trigger = legacyCheckoutTrigger(
      [legacyResponse({ success: false, status: 'failed', orderId: 'order-1', canRetry: true })],
      'Failed order-1',
    )
    expect(trigger).toMatchObject({ operationId: 'order-1', eventType: 'retryable-failure' })
  })

  it('never derives a checkout trigger when the order identity is absent from the page', () => {
    expect(
      legacyCheckoutTrigger(
        [legacyResponse({ success: false, status: 'failed', orderId: 'order-1', canRetry: true })],
        'job-1 failed',
      ),
    ).toBeUndefined()
  })

  it('prefers the normalized fact over the checkout compatibility path', () => {
    const facts = normalizeFactEvents([factEvent(exportFact({ operationId: 'job-9' }))])
    const trigger = retryableTriggerFromFacts(facts)
    expect(trigger!.operationId).toBe('job-9')
  })
})
