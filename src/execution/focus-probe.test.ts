import { describe, expect, it, vi } from 'vitest'
import { createActionBudget } from './action-budget.ts'
import { createFocusProbe, type FocusProbeDeps } from './focus-probe.ts'

const clean = { version: 1 as const, status: 'clean' as const, interventionIds: [] }
const region = { x: 400, y: 200, width: 480, height: 48 }

/** A fake browser owner: records every click it was asked to make and answers from a script. */
function harness(
  over: {
    focusOnEdge?: boolean
    focusLeftOnly?: boolean
    controlOk?: boolean
    maxActions?: number
    startFocused?: boolean
    /** The target is still focused when the edge sample clicks: a reset that did not clear focus. */
    residualFocus?: boolean
    /** The retest of the first failing point focuses, contradicting the first result. */
    retestFocuses?: boolean
  } = {},
) {
  const clicks: string[] = []
  const completions: { validationStatus: string; reasons: readonly string[] }[] = []
  const counter = { used: 0 }
  // Real focus state: the control focuses, an edge point focuses only when the page is healthy, and a
  // neutral reset clears it. This is what makes the reset accounting meaningful.
  let focused = over.startFocused ?? false
  let edgeSamples = 0
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
    neutralReset: async (beforeClick) => {
      beforeClick()
      clicks.push('reset')
      focused = false
      return { x: 10, y: 10, introducedChange: false, integrity: clean }
    },
    samplePositiveControl: async (beforeClick) => {
      beforeClick()
      clicks.push('control')
      const ok = over.controlOk !== false
      focused = ok
      return {
        x: 640,
        y: 224,
        stable: true,
        focusAfter: ok ? 'input#q@e1' : null,
        focusedWithinMs: ok ? 88 : null,
        hit: { ref: 'e1', tag: 'input' as const, relation: 'self' as const },
        valueChanged: false,
        integrity: clean,
        observedWindowMs: 500,
        focusBefore: null,
      }
    },
    samplePoint: async (point, beforeClick) => {
      beforeClick()
      clicks.push(`${point.side}`)
      const isRetest = ++edgeSamples > 2
      // A sample reports what was actually focused when its click landed, which is the only honest
      // source for the baseline. A residual focus means the reset failed to clear it.
      const focusBefore = over.residualFocus ? 'input#q@e1' : null
      const focuses = isRetest
        ? over.retestFocuses === true
        : over.focusLeftOnly
          ? point.side === 'left'
          : (over.focusOnEdge ?? false)
      focused = focuses
      return {
        x: point.x,
        y: point.y,
        stable: true,
        focusAfter: focuses ? 'input#q@e1' : null,
        hit: { ref: 'e9', tag: 'div', relation: 'ancestor' as const },
        valueChanged: false,
        integrity: clean,
        focusedWithinMs: focuses ? 95 : null,
        observedWindowMs: 500,
        focusBefore,
      }
    },
    recordHypothesis: async () => 'hyp-1',
    saveReceipt: async () => 'receipt-art-1',
    saveMeasurements: async () => 'measure-art-1',
    complete: async (completion) => {
      completions.push(completion)
      return 'finding-1'
    },
    evidenceRefs: () => ['shot-1'],
  }
  return { deps, clicks, counter, completions }
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
    // Control, neutral baseline, both edge points, then an independent neutral reset and retest.
    expect(h.clicks).toEqual(['control', 'reset', 'left', 'right', 'reset', 'left'])
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

  it('is inconclusive when a sample was taken while the target was still focused', async () => {
    // The plan's decisive trap: an already-focused input stays focused through a click on dead
    // padding, so that click proves nothing about the padding. Claiming a baseline that was never
    // established is exactly how this probe would manufacture a supported finding out of nothing.
    const h = harness({ focusOnEdge: false, residualFocus: true })
    const probe = createFocusProbe(h.deps)

    const result = await probe.run({ ...input, region, excluded: [], dangerous: [] })

    expect(result.validationStatus).toBe('inconclusive')
    expect(result.reasons).toContain('baseline-not-established')
    // The hypothesis is still resolved - it was opened by this probe and must not be left dangling -
    // but never as a supported claim about the region.
    expect(h.completions).toHaveLength(1)
    expect(h.completions[0].validationStatus).toBe('inconclusive')
  })

  it('is inconclusive when the retest focuses, contradicting the first failure', async () => {
    // A retest exists only to firm up a failure. If it focuses, the first result is not reliable
    // evidence and must not be reported as a supported finding.
    const h = harness({ focusOnEdge: false, retestFocuses: true })
    const probe = createFocusProbe(h.deps)

    const result = await probe.run({ ...input, region, excluded: [], dangerous: [] })

    expect(result.validationStatus).toBe('inconclusive')
    expect(result.reasons).toContain('retest-focuses')
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

    // Six real clicks, including the independent neutral reset before the retest.
    expect(h.counter.used).toBe(6)
  })

  it('records on the receipt the actions the probe actually spent', async () => {
    const h = harness({ focusOnEdge: false })
    let receipt: any
    const probe = createFocusProbe({
      ...h.deps,
      saveReceipt: async (r) => {
        receipt = r
        return 'receipt-art-1'
      },
    })

    await probe.run({ ...input, region, excluded: [], dangerous: [] })

    // The receipt is the auditable record of the probe, so a cost that drifts from the run counter
    // would misreport what the measurement cost.
    expect(receipt.actionCost).toBe(h.counter.used)
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

it('reserves all eight actions before starting, including the possible retest', async () => {
  for (const maxActions of [6, 7]) {
    const h = harness({ maxActions, startFocused: true })
    expect(
      (await createFocusProbe(h.deps).run({ ...input, region, excluded: [], dangerous: [] }))
        .validationStatus,
    ).toBe('inconclusive')
    expect(h.clicks).toEqual([])
  }
  const h = harness({ maxActions: 8, startFocused: true })
  expect(
    (await createFocusProbe(h.deps).run({ ...input, region, excluded: [], dangerous: [] }))
      .validationStatus,
  ).toBe('supported')
  expect(h.clicks).toEqual(['reset', 'control', 'reset', 'left', 'right', 'reset', 'left'])
})
it('does not issue another click after cancellation during a neutral reset', async () => {
  const h = harness({ startFocused: true }),
    controller = new AbortController()
  const reset = h.deps.neutralReset
  const probe = createFocusProbe({
    ...h.deps,
    guard: () => controller.signal.throwIfAborted(),
    neutralReset: async (click) => {
      const r = await reset(click)
      controller.abort(Error('cancelled'))
      return r
    },
  })
  await expect(probe.run({ ...input, region, excluded: [], dangerous: [] })).rejects.toThrow(
    'cancelled',
  )
  expect(h.clicks).toEqual(['reset'])
  expect(h.counter.used).toBe(1)
})

it('counts all eight real clicks in the maximum initial-focus and mixed-edge case', async () => {
  const h = harness({ maxActions: 8, startFocused: true, focusLeftOnly: true })
  const result = await createFocusProbe(h.deps).run({
    ...input,
    region,
    excluded: [],
    dangerous: [],
  })
  expect(result.validationStatus).toBe('supported')
  expect(h.clicks).toEqual([
    'reset',
    'control',
    'reset',
    'left',
    'reset',
    'right',
    'reset',
    'right',
  ])
  expect(h.counter.used).toBe(8)
})
