import { describe, it, expect } from 'vitest'
import { pendingFacets } from './facets.ts'
const base = () => ({
  revision: 'item-checks-2',
  sourceReview: {
    state: 'sealed',
    revision: 'public-effect-sources-1',
    refs: ['source.json'],
    hash: 'snapshot-hash',
    reasons: [],
  },
  generic: {
    state: 'collected',
    actionId: 'a',
    receiptRef: 'receipt.json',
    checkRef: 'check',
    evidenceRefs: ['receipt.json'],
    eventIds: ['event'],
  },
  effects: [] as any[],
})
describe('v2 dimensions independent of R0 runtime', () => {
  it('does not reopen generic just because unspecified functional semantics stay unknown', () => {
    expect(pendingFacets(base())).toMatchObject({
      pending: [],
      genericSettled: true,
      functionalSemantics: 'unspecified',
      declaresTaskComplete: false,
    })
  })
  it('retains required unverified effect after generic settles', () => {
    const c = base()
    c.effects = [
      { requirementId: 'r', state: 'unverified', late: false, measurementRefs: [], eventIds: [] },
    ]
    expect(pendingFacets(c)).toMatchObject({
      pending: ['effect:r'],
      functionalSemantics: 'required-effect-unverified',
      mayReplayOriginalAction: false,
    })
  })
  it('keeps unresolved source as a concrete investigation gap', () => {
    const c = base()
    c.sourceReview.state = 'unresolved'
    expect(pendingFacets(c).pending).toEqual(['resolve-public-source'])
  })
  it('settled failure is not healthy success or permission to repeat', () => {
    const c = base()
    c.effects = [
      { requirementId: 'r', state: 'failed', late: false, measurementRefs: ['m'], eventIds: ['e'] },
    ]
    expect(pendingFacets(c)).toMatchObject({
      pending: [],
      hasMeasuredFailure: true,
      declaresTaskComplete: false,
    })
  })
  it('rejects incompatible revision and duplicate effect identity', () => {
    expect(() => pendingFacets({ ...base(), revision: 'item-checks-1' })).toThrow()
    const c = base()
    const e = {
      requirementId: 'r',
      state: 'pending',
      late: false,
      measurementRefs: [],
      eventIds: [],
    }
    c.effects = [e, e]
    expect(() => pendingFacets(c)).toThrow('duplicate-effect-identity')
  })
})
