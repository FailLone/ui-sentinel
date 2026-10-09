import { describe, expect, it } from 'vitest'
import { createFocusReceipt, focusReceiptSupports, isFocusReceipt } from './focus-receipt.ts'

const clean = { version: 1 as const, status: 'clean' as const, interventionIds: [] }
const intervened = {
  version: 1 as const,
  status: 'intervened' as const,
  interventionIds: ['intervention-a'],
}

const identity = {
  candidateId: 'candidate-1',
  screenshotRef: 'shot-1',
  screenshotSha: 'a'.repeat(64),
  documentEpoch: 'epoch-1',
  url: 'http://localhost:4173/',
  scroll: { x: 0, y: 0 },
  viewport: { width: 1280, height: 768 },
  binding: { elementRef: 'e1', nodeIdentity: 'node-1', reason: 'largest text input in region' },
  algorithmVersion: 'visual-focus-1',
}

function sample(over: Partial<Parameters<typeof createFocusReceipt>[0]['samples'][number]> = {}) {
  return {
    side: 'left' as const,
    x: 148,
    y: 220,
    hit: { ref: 'e9', tag: 'div', relation: 'ancestor' as const },
    focusBefore: null,
    focusAfter: 'node-1',
    focusedWithinMs: 120,
    valueChanged: false,
    documentEpoch: 'epoch-1',
    integrity: clean,
    ...over,
  }
}

function control(over: Partial<Parameters<typeof createFocusReceipt>[0]['positiveControl']> = {}) {
  return {
    x: 300,
    y: 220,
    hit: { ref: 'e1', tag: 'input', relation: 'self' as const },
    focusBefore: null,
    focusAfter: 'node-1',
    focusedWithinMs: 90,
    valueChanged: false,
    documentEpoch: 'epoch-1',
    integrity: clean,
    ok: true,
    ...over,
  }
}

describe('focus receipt structural validation', () => {
  it('accepts a well-formed receipt', () => {
    const receipt = createFocusReceipt({
      ...identity,
      positiveControl: control(),
      samples: [sample(), sample({ side: 'right', x: 452 })],
      resets: [{ x: 10, y: 10, introducedChange: false, integrity: clean }],
      actionCost: 6,
      integrity: clean,
    })

    expect(isFocusReceipt(receipt)).toBe(true)
  })

  it('rejects a receipt whose positive control did not focus the bound node', () => {
    const receipt = createFocusReceipt({
      ...identity,
      positiveControl: control({ ok: false, focusAfter: null, focusedWithinMs: null }),
      samples: [sample()],
      resets: [],
      actionCost: 2,
      integrity: clean,
    })

    expect(isFocusReceipt(receipt)).toBe(false)
  })

  it('rejects a sample taken under a different document epoch than the binding', () => {
    const receipt = createFocusReceipt({
      ...identity,
      positiveControl: control(),
      samples: [sample({ documentEpoch: 'epoch-2' })],
      resets: [],
      actionCost: 3,
      integrity: clean,
    })

    expect(isFocusReceipt(receipt)).toBe(false)
  })

  it('rejects a receipt with no samples', () => {
    const receipt = createFocusReceipt({
      ...identity,
      positiveControl: control(),
      samples: [],
      resets: [],
      actionCost: 1,
      integrity: clean,
    })

    expect(isFocusReceipt(receipt)).toBe(false)
  })

  it('rejects a receipt recording more clicks than the bounded maximum', () => {
    const receipt = createFocusReceipt({
      ...identity,
      positiveControl: control(),
      samples: [sample()],
      resets: [],
      actionCost: 9,
      integrity: clean,
    })

    expect(isFocusReceipt(receipt)).toBe(false)
  })

  it('rejects a receipt built on intervened evidence', () => {
    const receipt = createFocusReceipt({
      ...identity,
      positiveControl: control({ integrity: intervened }),
      samples: [sample()],
      resets: [],
      actionCost: 3,
      integrity: intervened,
    })

    expect(isFocusReceipt(receipt)).toBe(false)
  })

  it('rejects a receipt naming a different candidate than the one being promoted', () => {
    const receipt = createFocusReceipt({
      ...identity,
      positiveControl: control(),
      samples: [sample()],
      resets: [],
      actionCost: 3,
      integrity: clean,
    })

    expect(isFocusReceipt(receipt)).toBe(true)
    // Structural validity is not enough: the promotion gate also has to see it name the right candidate.
    expect(
      focusReceiptSupports(receipt, { candidateId: 'candidate-2', screenshotRef: 'shot-1' }),
    ).toBe(false)
    expect(
      focusReceiptSupports(receipt, { candidateId: 'candidate-1', screenshotRef: 'shot-1' }),
    ).toBe(true)
  })

  it('refuses to treat a candidate as promoted when the receipt points at another screenshot', () => {
    const receipt = createFocusReceipt({
      ...identity,
      positiveControl: control(),
      samples: [sample()],
      resets: [],
      actionCost: 3,
      integrity: clean,
    })

    expect(
      focusReceiptSupports(receipt, { candidateId: 'candidate-1', screenshotRef: 'shot-9' }),
    ).toBe(false)
  })
})
