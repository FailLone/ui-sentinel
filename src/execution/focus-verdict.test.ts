import { describe, expect, it } from 'vitest'
import { evaluateFocusVerdict, type FocusAttempt } from './focus-verdict.ts'

const clean = { version: 1 as const, status: 'clean' as const, interventionIds: [] }
const intervened = { version: 1 as const, status: 'intervened' as const, interventionIds: ['i1'] }

function attempt(over: Partial<FocusAttempt> = {}): FocusAttempt {
  return {
    side: 'left',
    baselineUnfocused: true,
    focusedWithinMs: null,
    integrity: clean,
    ...over,
  }
}

const controlOk = { ok: true, focusedWithinMs: 90, integrity: clean }
const controlFailed = { ok: false, focusedWithinMs: null, integrity: clean }

describe('focus verdict: the already-focused false positive', () => {
  it('does not count a failure when the baseline was never verified unfocused', () => {
    // The trap plan 4.4 names: an already-focused input stays focused through a dead click. A sample
    // whose baseline was not proven unfocused is not evidence of anything.
    const verdict = evaluateFocusVerdict({
      control: controlOk,
      attempts: [attempt({ baselineUnfocused: false, focusedWithinMs: null })],
      resets: [],
    })
    expect(verdict.validationStatus).toBe('inconclusive')
    expect(verdict.reasons).toContain('baseline-not-established')
  })

  it('supports the finding only when a verified-unfocused baseline sample fails to focus', () => {
    const verdict = evaluateFocusVerdict({
      control: controlOk,
      attempts: [attempt({ side: 'left', focusedWithinMs: null })],
      resets: [],
    })
    expect(verdict.verdict).toBe('fail')
    expect(verdict.validationStatus).toBe('supported')
  })

  it('refutes the candidate when the control and every usable edge point focus', () => {
    const verdict = evaluateFocusVerdict({
      control: controlOk,
      attempts: [
        attempt({ side: 'left', focusedWithinMs: 74 }),
        attempt({ side: 'right', focusedWithinMs: 81 }),
      ],
      resets: [],
    })
    expect(verdict.verdict).toBe('pass')
    expect(verdict.validationStatus).toBe('refuted')
  })

  it('is inconclusive when the positive control itself failed', () => {
    const verdict = evaluateFocusVerdict({
      control: controlFailed,
      attempts: [attempt({ focusedWithinMs: 60 })],
      resets: [],
    })
    expect(verdict.validationStatus).toBe('inconclusive')
    expect(verdict.reasons).toContain('positive-control-failed')
  })

  it('is inconclusive when fewer than two usable edge points could be derived', () => {
    const verdict = evaluateFocusVerdict({
      control: controlOk,
      attempts: [attempt({ side: 'left', focusedWithinMs: 70 })],
      resets: [],
      usableEdgePoints: 1,
    })
    expect(verdict.validationStatus).toBe('inconclusive')
    expect(verdict.reasons).toContain('insufficient-edge-points')
  })

  it('is inconclusive when a measurement was taken under an intervention', () => {
    const verdict = evaluateFocusVerdict({
      control: controlOk,
      attempts: [attempt({ focusedWithinMs: null, integrity: intervened })],
      resets: [],
    })
    expect(verdict.validationStatus).toBe('inconclusive')
    expect(verdict.reasons).toContain('evidence-intervened')
  })

  it('is inconclusive when a reset introduced a navigation or write', () => {
    const verdict = evaluateFocusVerdict({
      control: controlOk,
      attempts: [
        attempt({ side: 'left', focusedWithinMs: 70 }),
        attempt({ side: 'right', focusedWithinMs: 75 }),
      ],
      resets: [{ introducedChange: true, integrity: clean }],
    })
    expect(verdict.validationStatus).toBe('inconclusive')
    expect(verdict.reasons).toContain('reset-introduced-change')
  })

  it('does not turn a pass into a refutation of the whole region', () => {
    const verdict = evaluateFocusVerdict({
      control: controlOk,
      attempts: [
        attempt({ side: 'left', focusedWithinMs: 70 }),
        attempt({ side: 'right', focusedWithinMs: 75 }),
      ],
      resets: [],
    })
    expect(verdict.scope).toMatch(/sampled points/)
  })

  it('counts a genuine failure even when the other edge point focused', () => {
    // The healthy point does not cancel the failing one: that is the whole defect being demonstrated.
    const verdict = evaluateFocusVerdict({
      control: controlOk,
      attempts: [
        attempt({ side: 'left', focusedWithinMs: null }),
        attempt({ side: 'right', focusedWithinMs: 68 }),
      ],
      resets: [],
    })
    expect(verdict.validationStatus).toBe('supported')
  })

  it('treats a retest that also fails as still supported, and a retest that focuses as inconclusive', () => {
    const stillFailing = evaluateFocusVerdict({
      control: controlOk,
      attempts: [
        attempt({ side: 'left', focusedWithinMs: null }),
        attempt({ side: 'left', focusedWithinMs: null, retest: true }),
      ],
      resets: [],
      usableEdgePoints: 2,
    })
    expect(stillFailing.validationStatus).toBe('supported')

    const recovered = evaluateFocusVerdict({
      control: controlOk,
      attempts: [
        attempt({ side: 'left', focusedWithinMs: null }),
        attempt({ side: 'left', focusedWithinMs: 120, retest: true }),
      ],
      resets: [],
      usableEdgePoints: 2,
    })
    expect(recovered.validationStatus).toBe('inconclusive')
    expect(recovered.reasons).toContain('retest-focuses')
  })
})
