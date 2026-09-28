import { describe, expect, it, vi } from 'vitest'
import { createActionBudget } from './action-budget.ts'
import { createFocusProbe, type FocusProbeDeps } from './focus-probe.ts'

const clean = { version: 1 as const, status: 'clean' as const, interventionIds: [] }
const region = { x: 400, y: 200, width: 480, height: 48 }

/** A fake browser owner: records every click it was asked to make and answers from a script. */
function harness(
  over: {
    focusOnEdge?: boolean
    controlOk?: boolean
    maxActions?: number
    startFocused?: boolean
  } = {},
) {
  const clicks: string[] = []
  const counter = { used: 0 }
  // Real focus state: the control focuses, an edge point focuses only when the page is healthy, and a
  // neutral reset clears it. This is what makes the reset accounting meaningful.
  let focused = over.startFocused ?? false
  const budget = createActionBudget({
    remaining: () => (over.maxActions ?? 40) - counter.used,
    count: (n) => {
      counter.used += n
    },
  })

  const deps: FocusProbeDeps = {
    guard: () => {},
    budget,
    bind: async () => ({
      elementRef: 'e1',
      nodeIdentity: 'input#q@e1',
      documentEpoch: 'epoch-1',
      url: 'http://localhost:4173/',
      scroll: { x: 0, y: 0 },
      viewport: { width: 1280, height: 768 },
      screenshotRef: 'shot-1',
      screenshotSha: 'a'.repeat(64),
      isFocused: () => focused,
    }),
    neutralReset: async () => {
      clicks.push('reset')
      focused = false
      return { x: 10, y: 10, introducedChange: false, integrity: clean }
    },
    samplePositiveControl: async () => {
      clicks.push('control')
      const ok = over.controlOk !== false
      focused = ok
      return {
        focusedWithinMs: ok ? 88 : null,
        hit: { ref: 'e1', tag: 'input' as const, relation: 'self' as const },
        valueChanged: false,
        integrity: clean,
      }
    },
    samplePoint: async (point) => {
      clicks.push(`${point.side}`)
      focused = over.focusOnEdge ?? false
      return {
        hit: { ref: 'e9', tag: 'div', relation: 'ancestor' as const },
        valueChanged: false,
        integrity: clean,
        focusedWithinMs: over.focusOnEdge ? 95 : null,
      }
    },
    recordHypothesis: async () => 'hyp-1',
    saveReceipt: async () => 'receipt-art-1',
    saveMeasurements: async () => 'measure-art-1',
    complete: async () => 'finding-1',
    evidenceRefs: () => ['shot-1'],
  }
  return { deps, clicks, counter }
}

const input = {
  candidateId: 'candidate-1',
  elementRef: 'e1',
  bindingReason: 'the only input in the region',
}

describe('focus_probe orchestration', () => {
  it('performs one control plus two edge samples on a broken page and supports the finding', async () => {
    const h = harness({ focusOnEdge: false })
    const probe = createFocusProbe(h.deps)

    const result = await probe.run({ ...input, region, excluded: [], dangerous: [] })

    expect(result.validationStatus).toBe('supported')
    expect(result.candidateId).toBe('candidate-1')
    expect(result.receiptRef).toBe('receipt-art-1')
    expect(result.findingId).toBe('finding-1')
    // Control, then one reset (the control left the input focused), then left, right, and the retest
    // of the first failure. Only the one transition into a focused state needs a reset.
    expect(h.clicks).toEqual(['control', 'reset', 'left', 'right', 'left'])
  })

  it('refutes the candidate on the healthy page and still saves the measurement', async () => {
    const h = harness({ focusOnEdge: true })
    const probe = createFocusProbe(h.deps)

    const result = await probe.run({ ...input, region, excluded: [], dangerous: [] })

    expect(result.validationStatus).toBe('refuted')
    // Control focuses, one reset, left focuses (so it leaves the target focused), one reset, right.
    // A point that focuses costs a reset for the next sample; a point that fails does not.
    expect(h.clicks).toEqual(['control', 'reset', 'left', 'reset', 'right'])
    expect(h.counter.used).toBe(5)
    expect(result.receiptRef).toBe('receipt-art-1')
  })

  it('refuses to start at all when the action budget cannot cover the whole bounded probe', async () => {
    // Plan 4.4: no half-finished checks. Insufficient budget means zero clicks, not a partial sample.
    const h = harness({ focusOnEdge: false, maxActions: 5 })
    const probe = createFocusProbe(h.deps)

    const result = await probe.run({ ...input, region, excluded: [], dangerous: [] })

    expect(result.validationStatus).toBe('inconclusive')
    expect(result.reasons).toContain('insufficient-action-budget')
    expect(h.clicks).toEqual([])
    expect(h.counter.used).toBe(0)
  })

  it('counts every click individually against the run budget', async () => {
    const h = harness({ focusOnEdge: false })
    const probe = createFocusProbe(h.deps)

    await probe.run({ ...input, region, excluded: [], dangerous: [] })

    // Five real clicks: control, one reset, and three edge samples - so five actions, not one.
    expect(h.counter.used).toBe(5)
  })

  it('returns the original receipt without clicking when the same candidate is re-probed', async () => {
    const h = harness({ focusOnEdge: false })
    const probe = createFocusProbe(h.deps)

    await probe.run({ ...input, region, excluded: [], dangerous: [] })
    const clicksAfterFirst = h.clicks.length
    const second = await probe.run({ ...input, region, excluded: [], dangerous: [] })

    expect(second.reused).toBe(true)
    expect(h.clicks.length).toBe(clicksAfterFirst)
  })

  it('is inconclusive without clicking when fewer than two edge points can be derived', async () => {
    const h = harness({ focusOnEdge: false })
    const probe = createFocusProbe(h.deps)
    const narrow = { x: 400, y: 200, width: 6, height: 6 }

    const result = await probe.run({ ...input, region: narrow, excluded: [], dangerous: [] })

    expect(result.validationStatus).toBe('inconclusive')
    expect(result.reasons).toContain('insufficient-edge-points')
    expect(h.clicks).toEqual([])
  })

  it('releases the actions it reserved but never used', async () => {
    const h = harness({ focusOnEdge: true })
    const probe = createFocusProbe(h.deps)

    await probe.run({ ...input, region, excluded: [], dangerous: [] })

    // Reservations are released, so the run can still spend its remaining budget on other work.
    expect(h.deps.budget.reserve(34)).not.toBeNull()
  })

  it('stops before clicking when the binder refuses the element', async () => {
    const h = harness()
    const probe = createFocusProbe({
      ...h.deps,
      bind: async () => {
        throw new Error('ambiguous-targets')
      },
    })

    const result = await probe.run({ ...input, region, excluded: [], dangerous: [] })

    expect(result.validationStatus).toBe('inconclusive')
    expect(result.reasons).toContain('binding-failed')
    expect(h.clicks).toEqual([])
  })

  it('does not make a second finding on a re-probe after the state changed', async () => {
    const h = harness({ focusOnEdge: false })
    const complete = vi.fn(async () => 'finding-1')
    const probe = createFocusProbe({ ...h.deps, complete })

    await probe.run({ ...input, region, excluded: [], dangerous: [] })
    await probe.run({ ...input, region, excluded: [], dangerous: [] })

    expect(complete).toHaveBeenCalledTimes(1)
  })
})
