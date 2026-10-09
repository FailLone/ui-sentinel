import { describe, expect, it } from 'vitest'
import {
  assertNoPrivateSelectorLeak,
  compareWitnessToTarget,
  witnessFromElement,
  type BindingWitness,
  type PrivateVisualTarget,
} from './witness.ts'
import { VISUAL_TRUTH, visualTruthFor, type VisualCaseId } from '../../fixtures/visual.ts'

const target: PrivateVisualTarget = {
  tag: 'input',
  type: 'search',
  id: 'product-search-input',
  selector: '.visual-search-region input',
}

function witness(over: Partial<BindingWitness['native']> = {}): BindingWitness {
  return witnessFromElement({
    candidateId: 'candidate-1',
    elementRef: 'ref-1',
    snapshotRef: 'snap-1',
    documentEpoch: 'epoch-1',
    nodeIdentity: 'node-1',
    selector: 'html > body:nth-of-type(1) > div:nth-of-type(1) > input:nth-of-type(1)',
    tag: 'input',
    attributes: {
      id: 'product-search-input',
      type: 'search',
      'aria-label': 'Search products',
      ...over,
    },
    bounds: { x: 495, y: 144, width: 240, height: 28 },
    capturedAt: '2026-10-01T00:00:00.000Z',
  })
}

describe('binding witness identity', () => {
  it('accepts a witness whose public facts match the private target', () => {
    expect(compareWitnessToTarget(witness(), target)).toEqual({ ok: true, reasons: [] })
  })

  it('refuses a witness bound to a different input of the same size', () => {
    // S04: "bind another same-sized input or node with identical copy". The size is identical on
    // purpose - identity must not be decided on geometry.
    const other = witness({ id: 'other-search-input' })
    const result = compareWitnessToTarget(other, target)
    expect(result.ok).toBe(false)
    expect(result.reasons).toContain('witness-id-mismatch')
  })

  it('refuses a witness on a non-search control', () => {
    const result = compareWitnessToTarget(witness({ type: 'text' }), target)
    expect(result.ok).toBe(false)
    expect(result.reasons).toContain('witness-type-mismatch')
  })

  it('refuses a witness whose tag is not an input', () => {
    const button: BindingWitness = {
      ...witness(),
      native: { tag: 'button', role: 'button' },
    }
    const result = compareWitnessToTarget(button, target)
    expect(result.ok).toBe(false)
    expect(result.reasons).toContain('witness-tag-mismatch')
  })

  it('refuses an anonymous node when the target names an id', () => {
    // An input with no id cannot be tied to the named target; the plan fails such an identity rather
    // than passing it on a coincidental tag/type match.
    const anonymous: BindingWitness = { ...witness(), native: { tag: 'input', type: 'search' } }
    const result = compareWitnessToTarget(anonymous, target)
    expect(result.ok).toBe(false)
    expect(result.reasons).toContain('witness-id-mismatch')
  })

  it('records only public facts and never the private selector', () => {
    const built = witness()
    expect(built.domPath.join(' > ')).toContain('input:nth-of-type(1)')
    expect(built.native.id).toBe('product-search-input')
    expect(JSON.stringify(built)).not.toContain(target.selector)
  })

  it('throws if any case private selector was echoed into a witness', () => {
    const leaked: BindingWitness = {
      ...witness(),
      domPath: ['html', '.visual-search-region input'],
    }
    expect(() => assertNoPrivateSelectorLeak(leaked, [target])).toThrow(
      /leaks the private selector/,
    )
  })

  it('covers every visual case with the same private target identity', () => {
    // All six presentations render the same native input; the witness comparison is what stops a probe
    // from binding the Clear-search button or a same-sized neighbour instead.
    const ids: readonly VisualCaseId[] = ['D0', 'H0', 'H1', 'D1', 'D2', 'H2']
    for (const id of ids) {
      const truth = visualTruthFor(id)
      expect(truth.targetSelector).toBe(target.selector)
    }
    expect(Object.keys(VISUAL_TRUTH)).toHaveLength(ids.length)
  })
})
