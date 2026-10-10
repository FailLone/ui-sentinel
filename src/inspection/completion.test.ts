import { describe, expect, it } from 'vitest'
import { decideInspectionCompletion, verifyInspectionProof } from './completion.ts'
import { createInspectionScope } from './scope.ts'

/**
 * The UI completion decision (plan 6.2).
 *
 * `scope-covered` is a claim about facts, and this module is where the executor checks that claim
 * instead of accepting it. The cases below are the ones plan 9 names as the ways a run can look
 * finished without being finished: a fresh entry that was never observed, an interaction the page
 * actually offered that was never touched, an item the model resolved with prose, a rule queue that
 * was simply cleared, and an intervention that makes the browser state inadmissible.
 */
function ledger() {
  return createInspectionScope({ goal: 'check the catalogue', entryUrl: 'https://example.org/' })
}

const observation = {
  pageId: 'page-1',
  stateId: 'state-1',
  url: 'https://example.org/',
  observationVersion: 'v1',
}

function facts(overrides: Partial<Parameters<typeof decideInspectionCompletion>[0]['facts']> = {}) {
  const scope = overrides.scope ?? ledger()
  return {
    kind: 'ui-scan' as const,
    featureEnabled: true,
    contractValid: true,
    contractHash: 'hash-1',
    entryObserved: true,
    entryEvidenceRefs: ['screenshot-1', 'snapshot-1'],
    integrityEpoch: 0,
    // Real persisted scope events, so the covered claim cites history the run actually wrote.
    scopeEventIds: scope.events().map((_, i) => `scope-event-${i}`),
    pendingRules: 0,
    openHypotheses: 0,
    unsupportedRecorded: [] as readonly string[],
    ...overrides,
    scope,
  }
}

/** A ledger in the state a healthy, fully covered run leaves behind. */
function coveredScope() {
  const scope = ledger()
  const entry = scope.createItem({
    ...observation,
    category: 'entry-observation',
    basis: 'entry document observed',
    targetSource: 'executor',
  })
  scope.resolveItem(entry.itemId, {
    status: 'verified',
    evidenceRefs: ['snapshot-1'],
    eventIds: [],
    detail: 'entry observed and captured',
  })
  scope.recordCandidates({
    categories: ['local-interaction', 'navigation'],
    detail: 'one tab, one link',
  })
  const tab = scope.createItem({
    ...observation,
    category: 'local-interaction',
    basis: 'visible tab control',
    targetSource: 'executor',
  })
  scope.resolveItem(tab.itemId, {
    status: 'verified',
    evidenceRefs: ['snapshot-2'],
    eventIds: [],
    detail: 'panel content changed after the tab click',
  })
  const nav = scope.createItem({
    ...observation,
    category: 'navigation',
    basis: 'same-origin detail link',
    targetSource: 'executor',
  })
  scope.resolveItem(nav.itemId, {
    status: 'verified',
    evidenceRefs: ['snapshot-3'],
    eventIds: [],
    detail: 'detail page reached and observed',
  })
  return scope
}

describe('scope-covered is accepted only when the facts support it', () => {
  it('accepts a fully covered run and records a proof', () => {
    const decision = decideInspectionCompletion({
      reason: 'scope-covered',
      facts: facts({ scope: coveredScope() }),
    })
    expect(decision.accepted).toBe(true)
    expect(decision.outcome).toBe('goal-reached')
    expect(decision.proof).toMatchObject({
      kind: 'ui-scan',
      claim: 'scope-covered',
      contractHash: 'hash-1',
      counts: { verified: 3, failed: 0, unverified: 0 },
    })
    expect(verifyInspectionProof(decision.proof!)).toBe(true)
  })

  it('accepts a run whose checks all failed as completed coverage', () => {
    // A defect completes its measurement; a finding never forces the run to be incomplete.
    const scope = coveredScope()
    const interaction = scope.snapshot().items.find((i) => i.category === 'local-interaction')!
    scope.resolveItem(interaction.itemId, {
      status: 'failed',
      evidenceRefs: ['snapshot-2'],
      eventIds: [],
      detail: 'action intercepted at all sampled points',
    })
    const decision = decideInspectionCompletion({
      reason: 'scope-covered',
      facts: facts({ scope }),
    })
    expect(decision.accepted).toBe(true)
    expect(decision.proof?.counts.failed).toBe(1)
  })

  it('refuses when the feature is not enabled for this build', () => {
    const decision = decideInspectionCompletion({
      reason: 'scope-covered',
      facts: facts({ featureEnabled: false, scope: coveredScope() }),
    })
    expect(decision).toMatchObject({ accepted: false, reasonCode: 'url-scan-disabled' })
  })

  it('refuses when the contract does not verify', () => {
    const decision = decideInspectionCompletion({
      reason: 'scope-covered',
      facts: facts({ contractValid: false, scope: coveredScope() }),
    })
    expect(decision).toMatchObject({ accepted: false, reasonCode: 'contract-unverified' })
  })

  it('refuses when the entry was never observed', () => {
    const decision = decideInspectionCompletion({
      reason: 'scope-covered',
      facts: facts({ entryObserved: false, entryEvidenceRefs: [], scope: coveredScope() }),
    })
    expect(decision).toMatchObject({ accepted: false, reasonCode: 'entry-not-observed' })
  })

  it('refuses when the entry has no readable evidence', () => {
    const decision = decideInspectionCompletion({
      reason: 'scope-covered',
      facts: facts({ entryEvidenceRefs: [], scope: coveredScope() }),
    })
    expect(decision).toMatchObject({ accepted: false, reasonCode: 'entry-evidence-missing' })
  })

  it('refuses while an intervention makes the page state inadmissible', () => {
    // Once the executor has blocked a request, the browser state cannot establish a healthy or
    // defective result for the unmodified site (plan 4.4, U08).
    const decision = decideInspectionCompletion({
      reason: 'scope-covered',
      facts: facts({ integrityEpoch: 1, scope: coveredScope() }),
    })
    expect(decision).toMatchObject({ accepted: false, reasonCode: 'evidence-intervened' })
  })

  it('refuses while applicable automatic rules are still pending', () => {
    const decision = decideInspectionCompletion({
      reason: 'scope-covered',
      facts: facts({ pendingRules: 2, scope: coveredScope() }),
    })
    expect(decision).toMatchObject({ accepted: false, reasonCode: 'rules-pending' })
  })

  it('refuses while an applicable hypothesis is open', () => {
    const decision = decideInspectionCompletion({
      reason: 'scope-covered',
      facts: facts({ openHypotheses: 1, scope: coveredScope() }),
    })
    expect(decision).toMatchObject({ accepted: false, reasonCode: 'hypotheses-open' })
  })

  it('refuses when a selected item is still pending', () => {
    const scope = coveredScope()
    scope.createItem({
      ...observation,
      category: 'investigation',
      basis: 'async content after filtering',
      targetSource: 'agent',
    })
    const decision = decideInspectionCompletion({
      reason: 'scope-covered',
      facts: facts({ scope }),
    })
    expect(decision).toMatchObject({ accepted: false, reasonCode: 'scope-incomplete' })
    expect(decision.missingItems?.length).toBe(1)
  })

  it('refuses when a selected item was left unverified', () => {
    const scope = coveredScope()
    const extra = scope.createItem({
      ...observation,
      category: 'navigation',
      basis: 'second detail link',
      targetSource: 'agent',
    })
    scope.resolveItem(extra.itemId, {
      status: 'unverified',
      reasonCode: 'target-not-found',
      evidenceRefs: [],
      eventIds: [],
      detail: 'link left the document before it could be followed',
    })
    const decision = decideInspectionCompletion({
      reason: 'scope-covered',
      facts: facts({ scope }),
    })
    expect(decision).toMatchObject({ accepted: false, reasonCode: 'scope-incomplete' })
  })

  it('refuses when the page offered an interaction the run never selected', () => {
    // The obligation the plan says must not vanish just because the Agent never called selectItems.
    const scope = ledger()
    const entry = scope.createItem({
      ...observation,
      category: 'entry-observation',
      basis: 'entry observed',
      targetSource: 'executor',
    })
    scope.resolveItem(entry.itemId, {
      status: 'verified',
      evidenceRefs: ['s'],
      eventIds: [],
      detail: '',
    })
    scope.recordCandidates({ categories: ['local-interaction'], detail: 'one visible tab' })
    const decision = decideInspectionCompletion({
      reason: 'scope-covered',
      facts: facts({ scope }),
    })
    expect(decision).toMatchObject({ accepted: false, reasonCode: 'scope-incomplete' })
    expect(decision.missingFacts?.join(' ')).toMatch(/local-interaction/)
  })

  it('accepts a static page with no actionable controls and a real observation', () => {
    const scope = ledger()
    const entry = scope.createItem({
      ...observation,
      category: 'entry-observation',
      basis: 'entry observed',
      targetSource: 'executor',
    })
    scope.resolveItem(entry.itemId, {
      status: 'verified',
      evidenceRefs: ['s'],
      eventIds: [],
      detail: '',
    })
    scope.recordCandidates({
      categories: [],
      detail: 'no interactive controls in the observed DOM',
    })
    const decision = decideInspectionCompletion({
      reason: 'scope-covered',
      facts: facts({ scope }),
    })
    expect(decision.accepted).toBe(true)
  })

  it('refuses a covered claim that cites no scope events at all', () => {
    // An empty rule queue and an empty ledger are not proof of anything.
    const decision = decideInspectionCompletion({
      reason: 'scope-covered',
      facts: facts({ scope: ledger(), scopeEventIds: [] }),
    })
    expect(decision).toMatchObject({ accepted: false, reasonCode: 'scope-incomplete' })
  })

  it('returns a usable partial suggestion whenever it refuses covered', () => {
    const decision = decideInspectionCompletion({
      reason: 'scope-covered',
      facts: facts({ integrityEpoch: 1, scope: coveredScope() }),
    })
    expect(decision.accepted).toBe(false)
    expect(decision.partialAdvice).toMatchObject({ reason: 'unverified-scope' })
    expect(decision.partialAdvice?.gaps.join(' ')).toMatch(/intervention/i)
  })
})

describe('unverified-scope and observed-blocker', () => {
  it('accepts unverified-scope when a real obligation remains', () => {
    const decision = decideInspectionCompletion({
      reason: 'unverified-scope',
      facts: facts({ scope: ledger(), integrityEpoch: 1 }),
    })
    expect(decision.accepted).toBe(true)
    expect(decision.outcome).toBe('blocked')
    expect(decision.proof).toMatchObject({ claim: 'unverified-scope' })
  })

  it('refuses an unverified-scope ending that has no gap to report', () => {
    // A fully covered run cannot declare itself partial just to avoid a covered conclusion.
    const decision = decideInspectionCompletion({
      reason: 'unverified-scope',
      facts: facts({ scope: coveredScope() }),
    })
    expect(decision).toMatchObject({ accepted: false, reasonCode: 'no-unverified-scope' })
  })

  it('accepts unverified-scope when unsupported dimensions were recorded', () => {
    const decision = decideInspectionCompletion({
      reason: 'unverified-scope',
      facts: facts({ scope: coveredScope(), unsupportedRecorded: ['iframe-content'] }),
    })
    expect(decision.accepted).toBe(true)
    expect(decision.proof?.unsupported).toEqual(['iframe-content'])
  })

  it('lets a covered run finish while an unsupported dimension is recorded', () => {
    // An unsupported dimension that was inside the declared scope is reported, not used to hold the
    // run open: the plan lists unsupported surfaces as recorded limits, not as blocking obligations.
    const decision = decideInspectionCompletion({
      reason: 'scope-covered',
      facts: facts({ scope: coveredScope(), unsupportedRecorded: ['iframe-content'] }),
    })
    expect(decision).toMatchObject({ accepted: true, outcome: 'goal-reached' })
    expect(decision.proof?.unsupported).toEqual(['iframe-content'])
  })

  it('accepts observed-blocker only with a measured blocking fact', () => {
    const withEvidence = decideInspectionCompletion({
      reason: 'observed-blocker',
      facts: facts({
        scope: ledger(),
        blockerEvidence: [{ eventId: 'denied-event', digest: 'a'.repeat(64) }],
      }),
    })
    expect(withEvidence).toMatchObject({ accepted: true, outcome: 'blocked' })
  })

  it('refuses observed-blocker with no blocking fact', () => {
    const decision = decideInspectionCompletion({
      reason: 'observed-blocker',
      facts: facts({ scope: coveredScope() }),
    })
    expect(decision).toMatchObject({ accepted: false, reasonCode: 'blocker-unsubstantiated' })
  })

  it('never accepts a covered claim for a business run', () => {
    const decision = decideInspectionCompletion({
      reason: 'scope-covered',
      facts: facts({ kind: 'business', scope: coveredScope() }),
    })
    expect(decision).toMatchObject({ accepted: false, reasonCode: 'not-a-ui-scan' })
  })
})

describe('proof integrity', () => {
  it('rejects a tampered proof', () => {
    const decision = decideInspectionCompletion({
      reason: 'scope-covered',
      facts: facts({ scope: coveredScope() }),
    })
    const proof = decision.proof!
    expect(verifyInspectionProof({ ...proof, contractHash: 'other' })).toBe(false)
    expect(verifyInspectionProof({ ...proof, counts: { ...proof.counts, verified: 99 } })).toBe(
      false,
    )
    expect(verifyInspectionProof(null)).toBe(false)
  })

  it('carries the scope summary forward so the report can project it', () => {
    const scope = coveredScope()
    const decision = decideInspectionCompletion({
      reason: 'scope-covered',
      facts: facts({ scope }),
    })
    expect(decision.proof?.items).toHaveLength(scope.snapshot().items.length)
    expect(decision.proof?.items.every((i) => i.status !== 'pending')).toBe(true)
  })
})

it('requires product path evidence in addition to ordinary covered scope', () => {
  const scope = coveredScope()
  const spec = { uiContract: { productSource: { contentHash: 'frozen' } } }
  expect(
    decideInspectionCompletion({ reason: 'scope-covered', facts: facts({ scope, spec }) }),
  ).toMatchObject({ accepted: false, reasonCode: 'product-requirements-unverified' })
  expect(
    decideInspectionCompletion({
      reason: 'scope-covered',
      facts: facts({ scope, spec, productPathComplete: true }),
    }),
  ).toMatchObject({ accepted: true })
  const pending = scope.createItem({
    ...observation,
    category: 'investigation',
    basis: 'independent selected work',
    targetSource: 'executor',
  })
  const decision = decideInspectionCompletion({
    reason: 'scope-covered',
    facts: facts({ scope, spec, productPathComplete: true }),
  })
  expect(decision.accepted).toBe(false)
  expect(decision.missingItems).toContain(pending.itemId)
})
