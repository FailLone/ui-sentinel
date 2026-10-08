import { expect, it } from 'vitest'
import { createInspectionHost } from './inspection-host.ts'
import { decideInspectionCompletion } from '../inspection/completion.ts'
import { projectInspectionScope } from '../inspection/scope.ts'
import { resolveUiScanContract, verifyUiContractSnapshot } from '../inspection/contract.ts'
import type { RunEvent } from '../shared/types.ts'
const verify = {
  selector: '#panel',
  condition: 'visible' as const,
  basis: 'Public Open shows the panel',
}
const check = {
  id: 'open',
  description: 'Check public disclosure',
  selector: '#open',
  action: 'click' as const,
  verify,
}
function harness() {
  const events: RunEvent[] = []
  const h = createInspectionHost({
    runId: 'r',
    goal: 'Check controls',
    entryUrl: 'https://example.org/',
    requiredChecks: [check],
    currentSnapshotId: () => 's',
    currentUrl: () => 'https://example.org/',
    currentObservationVersion: () => 'v',
    appendEvent: async (type, payload, extra) => {
      const e = {
        id: String(events.length),
        runId: 'r',
        seq: events.length,
        type,
        payload,
        timestamp: new Date().toISOString(),
        stepId: null,
        actionId: null,
        evidenceRefs: extra?.evidenceRefs ?? [],
      } as RunEvent
      events.push(e)
      return e
    },
  })
  const decide = () =>
    decideInspectionCompletion({
      reason: 'scope-covered',
      facts: {
        kind: 'ui-scan',
        featureEnabled: true,
        contractValid: true,
        contractHash: 'test',
        integrityEpoch: 0,
        pendingRules: 0,
        openHypotheses: 0,
        scope: h.scope,
        ...h.completionFacts(),
      },
    })
  return { h, events, decide }
}
it('freezes public requirements, rejects incomplete forms and cannot trust a page/model status', () => {
  const req = { kind: 'ui-scan', entryUrl: 'https://example.org', requiredChecks: [check] }
  const result = resolveUiScanContract(req, { reachableOrigins: [] })
  expect(result.kind).toBe('resolved')
  if (result.kind !== 'resolved') return
  expect(verifyUiContractSnapshot(result.contract)).toBe(true)
  expect(verifyUiContractSnapshot({ ...result.contract, requiredChecks: [] })).toBe(false)
  for (const requiredChecks of [
    [{ ...check, verify: undefined }],
    [check, check],
    [{ ...check, selected: false }],
    [{ ...check, action: 'link' }],
    [{ ...check, action: 'fill' }],
  ])
    expect(resolveUiScanContract({ ...req, requiredChecks }, { reachableOrigins: [] }).kind).toBe(
      'refused',
    )
})
it('unmapped required work prevents an otherwise satisfied old finish gate (row 2 contrast)', async () => {
  const { h, events, decide } = harness()
  await h.recordObservation({
    url: 'https://example.org/',
    evidenceRefs: ['shot', 'snap'],
    candidateDetail: '',
    candidateCategories: [],
  })
  expect(decide()).toMatchObject({ accepted: false, reasonCode: 'scope-incomplete' })
  expect(h.completionGaps()[0]!.itemId).toBe(h.requiredChecks()[0]!.itemId)
  await h.selectItems([])
  expect(projectInspectionScope(events).completionGaps()).toEqual(h.completionGaps())
})
it('binding cannot itself verify; positive probe or a mismatched expectation cannot clear required work', async () => {
  const { h, decide } = harness()
  await h.recordObservation({
    url: 'https://example.org/',
    evidenceRefs: ['shot', 'snap'],
    candidateDetail: '',
    candidateCategories: ['local-interaction'],
    candidateItems: [
      { ref: 'e1', description: 'Open', category: 'local-interaction', requiredCheckIds: ['open'] },
    ],
  })
  expect(decide().accepted).toBe(false)
  expect(
    h.requiredActionError('e1', 's', { type: 'click', verify: { ...verify, selector: '#other' } }),
  ).toContain('no action dispatched')
  expect(h.requiredActionError('e1', 's', { type: 'click', verify })).toBeUndefined()
  // A positive probe has no resolveInteraction call, so it leaves both selected obligations pending.
  expect(h.completionGaps()).toHaveLength(2)
  await h.resolveInteraction({
    ref: 'e1',
    snapshotId: 's',
    target: 'Open',
    url: 'https://example.org/',
    category: 'local-interaction',
    outcome: 'verified',
    evidenceRefs: ['shot', 'receipt'],
  })
  expect(decide().accepted).toBe(true)
})
it('negative probe remains a completed failed required check, not erased', async () => {
  const { h, decide } = harness()
  await h.recordObservation({
    url: 'https://example.org/',
    evidenceRefs: ['shot'],
    candidateDetail: '',
    candidateCategories: ['local-interaction'],
    candidateItems: [
      { ref: 'e1', description: 'Open', category: 'local-interaction', requiredCheckIds: ['open'] },
    ],
  })
  await h.resolveInteraction({
    ref: 'e1',
    snapshotId: 's',
    target: 'Open',
    url: 'https://example.org/',
    category: 'local-interaction',
    outcome: 'failed',
    reasonCode: 'probe-intercepted',
    evidenceRefs: ['sealed-probe'],
  })
  expect(decide().accepted).toBe(true)
  expect(h.snapshot().items.filter((i) => i.selected && i.status === 'failed')).toHaveLength(2)
})
it('leaving/replacing a selected target does not replace its obligation', async () => {
  const { h, decide } = harness()
  const observation = {
    url: 'https://example.org/',
    evidenceRefs: ['shot'],
    candidateDetail: '',
    candidateCategories: ['local-interaction'] as const,
    candidateItems: [
      {
        ref: 'e1',
        description: 'Open',
        category: 'local-interaction' as const,
        requiredCheckIds: ['open'],
      },
    ],
  }
  await h.recordObservation(observation)
  const old = h.requiredChecks()[0]!.boundItemId
  await h.leavePage('s')
  await h.recordObservation({
    ...observation,
    candidateItems: [{ ...observation.candidateItems[0]!, ref: 'e2' }],
  })
  expect(h.requiredChecks()[0]!.boundItemId).toBe(old)
  expect(decide().accepted).toBe(false)
})

it('a self-consistent proof cannot hide absent required registration in persisted history', async () => {
  const { inspectionHistoryIssues } = await import('../inspection/proof-history.ts')
  const { h, events } = harness()
  await h.recordObservation({
    url: 'https://example.org/',
    evidenceRefs: ['shot'],
    candidateDetail: '',
    candidateCategories: [],
  })
  const requiredItem = h.requiredChecks()[0]!.itemId
  const history = events.filter((e) => e.payload.itemId !== requiredItem)
  const scope = projectInspectionScope(history)
  const result = resolveUiScanContract(
    { kind: 'ui-scan', entryUrl: 'https://example.org/', requiredChecks: [check] },
    { reachableOrigins: [] },
  )
  if (result.kind !== 'resolved') throw Error('contract')
  const spec = { kind: 'ui-scan', uiContract: result.contract }
  const decision = decideInspectionCompletion({
    reason: 'scope-covered',
    facts: {
      kind: 'ui-scan',
      spec,
      featureEnabled: true,
      contractValid: true,
      contractHash: result.contract.hash,
      entryObserved: true,
      entryEvidenceRefs: ['shot'],
      integrityEpoch: 0,
      scope,
      scopeEventIds: ['saved'],
      pendingRules: 0,
      openHypotheses: 0,
      unsupportedRecorded: [],
    },
  })
  expect(decision.accepted).toBe(true) // The original function is unchanged; registration is the authorship boundary.
  history.push({
    id: 'finish',
    runId: 'r',
    seq: 100,
    type: 'finish:accepted',
    payload: { reasonCode: 'scope-covered', inspectionProof: decision.proof },
    evidenceRefs: [],
  } as unknown as RunEvent)
  const run = {
    id: 'r',
    spec,
    status: 'completed',
    stopReason: 'goal-reached',
    businessResult: 'not-applicable',
  } as any
  expect(inspectionHistoryIssues(run, history)).toContain('required-registration-missing:open')
})

it('required registry excludes neither an obligation nor its missing target at finish', async () => {
  const { h } = harness()
  expect(h.requiredRegistrationComplete()).toBe(true)
  expect(h.requiredChecks()[0]!.boundItemId).toBeUndefined()
  // Deliberate executor corruption, unavailable through any agent tool.
  await h.excludeItem(h.requiredChecks()[0]!.itemId, 'sampling-cap')
  expect(h.requiredRegistrationComplete()).toBe(false)
})
