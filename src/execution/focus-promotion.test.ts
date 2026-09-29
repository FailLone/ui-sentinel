import { focusTestReceipt } from './focus-test-fixture.ts'
import { describe, expect, it } from 'vitest'
import { createFocusReceipt, type FocusReceipt } from './focus-receipt.ts'
import { focusPromotionBlocked } from './focus-promotion.ts'

const clean = { version: 1 as const, status: 'clean' as const, interventionIds: [] }

const receipt = focusTestReceipt

const visualHypothesis = { kind: 'visual-focus' as const, visualCandidateId: 'candidate-1' }

/** Narrows the union so the block reason can be asserted without a cast. */
function blockedReason(result: ReturnType<typeof focusPromotionBlocked>): string | null {
  return result.blocked ? result.reason : null
}

describe('focus promotion gate', () => {
  it('leaves an ordinary hypothesis alone', () => {
    const result = focusPromotionBlocked({
      hypothesis: { kind: null, visualCandidateId: null },
      receipts: [],
    })
    expect(result.blocked).toBe(false)
  })

  it('blocks a visual hypothesis promoted with no focus receipt at all', () => {
    // This is the bypass plan 4.6 forbids: a screenshot plus an arbitrary snapshot is not a probe.
    const result = focusPromotionBlocked({ hypothesis: visualHypothesis, receipts: [] })
    expect(result.blocked).toBe(true)
    expect(blockedReason(result)).toBe('missing-focus-receipt')
  })

  it('allows promotion when a valid receipt names the bound candidate', () => {
    const result = focusPromotionBlocked({
      hypothesis: visualHypothesis,
      receipts: [{ artifactId: 'art-1', receipt: receipt('candidate-1') }],
    })
    expect(result.blocked).toBe(false)
  })

  it('blocks a receipt that names a different candidate', () => {
    const result = focusPromotionBlocked({
      hypothesis: visualHypothesis,
      receipts: [{ artifactId: 'art-1', receipt: receipt('candidate-2') }],
    })
    expect(result.blocked).toBe(true)
    expect(blockedReason(result)).toBe('focus-receipt-candidate-mismatch')
  })

  it('blocks a structurally invalid receipt, such as one with no positive control', () => {
    const broken = receipt('candidate-1', {
      positiveControl: {
        ...receipt('candidate-1').positiveControl,
        ok: false,
        focusAfter: null,
        focusedWithinMs: null,
      },
    })
    const result = focusPromotionBlocked({
      hypothesis: visualHypothesis,
      receipts: [{ artifactId: 'art-1', receipt: broken }],
    })
    expect(result.blocked).toBe(true)
    expect(blockedReason(result)).toBe('missing-focus-receipt')
  })

  it('blocks a receipt object that is merely receipt-shaped', () => {
    const result = focusPromotionBlocked({
      hypothesis: visualHypothesis,
      receipts: [{ artifactId: 'art-1', receipt: { candidateId: 'candidate-1', version: 1 } }],
    })
    expect(result.blocked).toBe(true)
  })

  it('blocks when a visual hypothesis has no recorded candidate to match against', () => {
    const result = focusPromotionBlocked({
      hypothesis: { kind: 'visual-focus', visualCandidateId: null },
      receipts: [{ artifactId: 'art-1', receipt: receipt('candidate-1') }],
    })
    expect(result.blocked).toBe(true)
    expect(blockedReason(result)).toBe('missing-bound-candidate')
  })

  it('accepts the matching receipt when several are present', () => {
    const result = focusPromotionBlocked({
      hypothesis: visualHypothesis,
      receipts: [
        { artifactId: 'art-1', receipt: receipt('candidate-9') },
        { artifactId: 'art-2', receipt: receipt('candidate-1') },
      ],
    })
    expect(result.blocked).toBe(false)
  })
})

for (const mutation of [
  'no-retest',
  'focused-baseline',
  'changed-value',
  'changed-reset',
  'unknown-state',
  'wrong-retest-point',
]) {
  it(`rejects ${mutation} even when the artifact is receipt-shaped`, () => {
    const r = structuredClone(receipt('candidate-1')) as any
    if (mutation === 'no-retest') {
      r.samples.pop()
      r.actionCost--
    }
    if (mutation === 'focused-baseline') r.samples[0].focusBefore = r.binding.nodeIdentity
    if (mutation === 'changed-value') r.samples[0].valueChanged = true
    if (mutation === 'changed-reset') r.resets[0].introducedChange = true
    if (mutation === 'unknown-state') r.samples[0].stable = false
    if (mutation === 'wrong-retest-point') r.samples[2].x++
    expect(
      focusPromotionBlocked({
        hypothesis: visualHypothesis,
        receipts: [{ artifactId: 'art', receipt: r }],
      }).blocked,
    ).toBe(true)
  })
}
it('does not turn a valid defect receipt into a refutation', () => {
  expect(
    focusPromotionBlocked({
      hypothesis: visualHypothesis,
      status: 'refuted',
      receipts: [{ artifactId: 'art', receipt: receipt('candidate-1') }],
    }).blocked,
  ).toBe(true)
})
it('does not promote a low-confidence candidate', () => {
  expect(
    focusPromotionBlocked({
      hypothesis: visualHypothesis,
      confidence: 'low',
      receipts: [{ artifactId: 'art', receipt: receipt('candidate-1') }],
    }).blocked,
  ).toBe(true)
})
