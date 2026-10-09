import { expect, it } from 'vitest'
import { focusTestReceipt } from '../../src/execution/focus-test-fixture.ts'
import { visualSmokeProblems } from './visual-smoke-score.ts'
import { VISUAL_TRUTH } from '../fixtures/visual.ts'

function fixture() {
  const r = structuredClone(focusTestReceipt()) as any
  r.positiveControl.x = 610
  r.positiveControl.y = 158
  r.positiveControl.hit.ref = 'input#product-search-input'
  for (const s of r.samples) {
    s.x = s.side === 'right' ? 799 : 480
    s.y = 158
  }
  const entry = (type: string, data: unknown = undefined) => ({
    type,
    data,
    exists: true,
    sha256: r.screenshotSha,
  })
  const artifacts: any = {
    'shot-1': entry('screenshot'),
    candidate: entry('visual-candidate', {
      id: r.candidateId,
      screenshotRef: 'shot-1',
      perceivedRegion: VISUAL_TRUTH.D0.region,
      rawRef: 'raw',
    }),
    raw: entry('visual-response'),
    receipt: entry('focus-receipt', r),
    annotation: entry('screenshot'),
  }
  const report: any = {
    status: 'completed',
    businessResult: 'success',
    stopReason: 'goal-reached',
    coverage: { visualUnverified: [] },
    events: [
      { type: 'finish:accepted' },
      ...Array.from({ length: 5 }, () => ({
        type: 'visual-focus:click-dispatched',
        payload: { candidateId: r.candidateId },
      })),
    ],
    focusMeasurements: [
      {
        candidateId: r.candidateId,
        receiptRef: 'receipt',
        annotatedRef: 'annotation',
        bindingReason: 'The unique visible search control',
      },
    ],
    hypotheses: [{ status: 'supported', evidenceRefs: ['receipt'] }],
    findings: [{ validationStatus: 'supported', evidenceRefs: ['receipt'] }],
    usage: { actions: 9, modelCalls: 8 },
  }
  return { report, artifacts, images: [r.screenshotSha], receipt: r }
}
it('checks a complete development smoke record', () => {
  const f = fixture()
  expect(visualSmokeProblems('D0', f.report, f.artifacts, f.images)).toEqual([])
})
it('rejects evidence not derived from the image actually sent to the model', () => {
  const f = fixture()
  expect(visualSmokeProblems('D0', f.report, f.artifacts, ['other'])).toContain(
    'image-source-mismatch',
  )
})
it('does not accept a missing independent retest', () => {
  const f = fixture()
  f.receipt.samples.pop()
  f.receipt.actionCost--
  expect(visualSmokeProblems('D0', f.report, f.artifacts, f.images)).toContain(
    'focus-verdict-mismatch',
  )
})
it('does not let private excluded icons stand as defect evidence', () => {
  const f = fixture()
  const icon = VISUAL_TRUTH.D2.excludedRegions[0]
  for (const s of f.receipt.samples) {
    s.x = icon.x + 2
    s.y = icon.y + 2
  }
  expect(visualSmokeProblems('D2', f.report, f.artifacts, f.images)).toContain(
    'sample-on-excluded-icon',
  )
})
it('does not count an unfinished or unverified healthy run as passed', () => {
  const f = fixture()
  f.report.focusMeasurements = []
  f.report.findings = []
  f.report.status = 'blocked'
  f.report.coverage.visualUnverified = ['candidate:not-checked']
  expect(visualSmokeProblems('H2', f.report, f.artifacts, f.images)).toContain(
    'visual-scope-unverified',
  )
})
