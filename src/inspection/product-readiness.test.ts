import { describe, it, expect } from 'vitest'
import { productReadinessDiagnostics } from './product-readiness.ts'
import { productPathReport, validateProductPlan } from './product-path.ts'
import { freezeProductSource } from './product-source.ts'
import { citationSource } from '../../evaluation/support/product-sources/citation.ts'
import {
  correctedReadinessPlan,
  confirmedReview,
  readinessRows,
} from '../../evaluation/support/product-sources/readiness.ts'
const source = freezeProductSource(citationSource)
const normalized = () => {
  const raw = correctedReadinessPlan('R5')
  return validateProductPlan(source, { ...raw, steps: raw.steps.map(({ review, ...s }: any) => s) })
}
describe('executable readiness is not semantic proof or historical reinterpretation', () => {
  it('does not mistake source overlap checks for semantic completeness', () => {
    const p = normalized()
    p.steps[1]!.preconditions = []
    expect(
      productReadinessDiagnostics(source, p, [confirmedReview, undefined]).some(
        (d) => d.field === 'steps[1].review.preconditionsComplete',
      ),
    ).toBe(true)
    // A false model attestation can still omit natural-language requirements: disclose this limit.
    expect(productReadinessDiagnostics(source, p, [confirmedReview, confirmedReview])).toEqual([])
  })
  it('blocks unknown/unsupported requirements before bind but permits honest unverified report without a plan', () => {
    const p = normalized()
    p.steps[0]!.certainty = 'ambiguous'
    delete p.steps[1]!.preconditions[0]!.expectation
    const d = productReadinessDiagnostics(source, p, [confirmedReview, confirmedReview])
    expect(d.map((x) => x.field)).toEqual(
      expect.arrayContaining(['steps[0].certainty', 'steps[1].preconditions[0].expectation']),
    )
    expect(productPathReport(source, [])).toMatchObject({ complete: false, state: 'unverified' })
  })
  it('detects an actual substring collision, without globally banning justified contains', () => {
    const p = normalized()
    p.steps[0]!.preconditions[0]!.expectation!.condition = 'text-contains'
    const d = productReadinessDiagnostics(source, p, [confirmedReview, confirmedReview])
    expect(d).toContainEqual(
      expect.objectContaining({
        field: 'steps[0].preconditions[0].expectation.condition',
        alternatives: expect.arrayContaining(['暂不可用']),
      }),
    )
    p.steps[0]!.preconditions[0]!.expectation!.condition = 'text-equals'
    p.steps[1]!.expectation!.condition = 'text-contains'
    expect(productReadinessDiagnostics(source, p, [confirmedReview, confirmedReview])).toEqual([])
    const other = freezeProductSource({
      title: 'Other text',
      markdown:
        'Click Label: immediately show "Ready" as part of "Ready for review". Other paragraphs may also contain "Ready".',
    })
    const raw = {
      ...p,
      sourceId: other.sourceId,
      contentHash: other.contentHash,
      steps: [
        {
          ...p.steps[0]!,
          targetName: 'Label',
          citation: { start: 0, end: other.markdown.length, quote: other.markdown },
          preconditions: [],
          expectation: { condition: 'text-contains' as const, expected: 'Ready' },
        },
      ],
    }
    const justified = {
      ...confirmedReview,
      substringJustification:
        'The source explicitly asks for this substring within a longer success message; this is not an exact state label.',
    }
    expect(
      productReadinessDiagnostics(other, validateProductPlan(other, raw), [justified]),
    ).toEqual([])
  })
  it.each(readinessRows)(
    '$row historical v3 assumptions remain frozen and unverified',
    ({ originalPersistedPlan }) => {
      const events: any = [
        {
          id: 'old',
          seq: 1,
          type: 'product:planned',
          payload: { revision: 'product-path-3', plan: originalPersistedPlan },
          evidenceRefs: [],
        },
      ]
      const report = productPathReport(source, events)
      expect(report.skillRevision).toBe('product-path-3')
      expect(report.plan).toEqual(originalPersistedPlan)
      expect(report.steps[0]?.reason).toBe('product-requirement-ambiguous-or-assumed')
      expect(report.complete).toBe(false)
    },
  )
})
