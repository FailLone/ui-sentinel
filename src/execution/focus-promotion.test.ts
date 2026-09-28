import { describe, expect, it } from 'vitest'
import { createFocusReceipt, type FocusReceipt } from './focus-receipt.ts'
import { focusPromotionBlocked } from './focus-promotion.ts'

const clean = { version: 1 as const, status: 'clean' as const, interventionIds: [] }

function receipt(candidateId: string, over: Partial<FocusReceipt> = {}): FocusReceipt {
  return createFocusReceipt({
    candidateId,
    screenshotRef: 'shot-1',
    screenshotSha: 'a'.repeat(64),
    documentEpoch: 'epoch-1',
    url: 'http://localhost:4173/',
    scroll: { x: 0, y: 0 },
    viewport: { width: 1280, height: 768 },
    binding: { elementRef: 'e1', nodeIdentity: 'node-1', reason: 'unique text input in region' },
    positiveControl: {
      x: 300,
      y: 220,
      hit: { ref: 'e1', tag: 'input', relation: 'self' },
      focusBefore: null,
      focusAfter: 'node-1',
      focusedWithinMs: 90,
      valueChanged: false,
      documentEpoch: 'epoch-1',
      integrity: clean,
      ok: true,
    },
    samples: [
      {
        side: 'left',
        x: 148,
        y: 220,
        hit: { ref: 'e9', tag: 'div', relation: 'ancestor' },
        focusBefore: null,
        focusAfter: null,
        focusedWithinMs: null,
        valueChanged: false,
        documentEpoch: 'epoch-1',
        integrity: clean,
      },
    ],
    resets: [],
    actionCost: 3,
    integrity: clean,
    algorithmVersion: 'visual-focus-1',
    ...over,
  })
}

const visualHypothesis = { kind: 'visual-focus', visualCandidateId: 'candidate-1' }

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
    expect(result.reason).toBe('missing-focus-receipt')
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
    expect(result.reason).toBe('focus-receipt-candidate-mismatch')
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
    expect(result.reason).toBe('missing-focus-receipt')
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
    expect(result.reason).toBe('missing-bound-candidate')
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
