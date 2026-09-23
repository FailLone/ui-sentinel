import { expect, it } from 'vitest'
import { occlusionReuseTarget } from './reuse.ts'
import type { Finding } from '../../shared/types.ts'
import type { PageSnapshot } from '../../rules/types.ts'
import type { VisualReview } from './types.ts'

it('requires a matching verified rule, frozen evidence and physically intercepted candidate target', () => {
  const candidate: VisualReview['candidates'][number] = {
    kind: 'occlusion',
    target: 'Pay',
    observation: 'Covered',
    verification: 'Check hit samples',
    region: { x: 20, y: 20, width: 100, height: 40 },
  }
  const finding: Finding = {
    id: 'f',
    runId: 'r',
    source: 'rule',
    ruleId: 'overlay-blocking',
    ruleRevision: '2.0.0',
    hypothesisId: null,
    validationStatus: 'supported',
    severity: 'error',
    title: 'Intercepted',
    expected: 'Operable',
    actual: 'Blocked',
    stepId: null,
    evidenceRefs: ['image', 'snapshot'],
    createdAt: '',
  }
  const snapshot: PageSnapshot = {
    url: '',
    title: '',
    viewport: { width: 500, height: 500 },
    elements: [
      {
        selector: '#pay',
        tag: 'button',
        text: 'Pay',
        visible: true,
        enabled: true,
        bounds: candidate.region,
        attributes: {},
        hitSamples: Array.from({ length: 5 }, () => ({
          x: 40,
          y: 40,
          hitSelector: '#banner',
          relation: 'unrelated',
        })),
      },
    ],
  }
  const refs = ['image', 'snapshot']
  expect(occlusionReuseTarget(candidate, finding, snapshot, refs)).toBe('#pay')
  expect(
    occlusionReuseTarget(candidate, finding, snapshot, ['another-image', 'snapshot']),
  ).toBeUndefined()
  expect(
    occlusionReuseTarget(candidate, { ...finding, ruleId: 'response-time' }, snapshot, refs),
  ).toBeUndefined()
  expect(
    occlusionReuseTarget({ ...candidate, kind: 'visual-hit-area' }, finding, snapshot, refs),
  ).toBeUndefined()
  expect(
    occlusionReuseTarget(
      { ...candidate, region: { ...candidate.region, x: 300 } },
      finding,
      snapshot,
      refs,
    ),
  ).toBeUndefined()
  expect(
    occlusionReuseTarget(
      candidate,
      finding,
      { ...snapshot, elements: [{ ...snapshot.elements[0]!, hitSamples: [] }] },
      refs,
    ),
  ).toBeUndefined()
  expect(
    occlusionReuseTarget(
      candidate,
      { ...finding, validationStatus: 'inconclusive' },
      snapshot,
      refs,
    ),
  ).toBeUndefined()
})
