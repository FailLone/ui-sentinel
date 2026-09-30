import { focusReceiptVerdict, isFocusReceipt } from '../../src/execution/focus-receipt.ts'
import { visualTruthFor, type VisualCaseId } from '../fixtures/visual.ts'

/** P2 evidence checks, not the independent P3 adversarial scorer. */
export function visualSmokeProblems(
  id: VisualCaseId,
  report: any,
  artifacts: Record<string, { exists: boolean; sha256: string; type: string; data?: any }>,
  sentImages: string[],
) {
  const errors: string[] = []
  const check = (ok: unknown, reason: string) => {
    if (!ok) errors.push(reason)
  }
  const truth = visualTruthFor(id)
  const inside = (
    box: { x: number; y: number; width: number; height: number },
    point: { x: number; y: number },
  ) =>
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  check(
    report.status === 'completed' &&
      report.businessResult === 'success' &&
      report.stopReason === 'goal-reached',
    'inspection-or-purchase-incomplete',
  )
  check(
    report.events.some((e: any) => e.type === 'finish:accepted'),
    'no-explicit-finish',
  )
  check(!report.coverage.visualUnverified.length, 'visual-scope-unverified')
  check(
    Object.values(artifacts).every((a) => a.exists),
    'artifact-missing',
  )
  check(sentImages.length > 0 && sentImages.length <= 2, 'real-image-request-missing-or-unbounded')
  const candidates = Object.values(artifacts)
    .filter((a) => a.type === 'visual-candidate')
    .map((a) => a.data)
  check(candidates.length <= 2, 'too-many-candidates')
  const measurements = report.focusMeasurements as any[]
  check(!truth.requireProbe || measurements.length > 0, 'required-probe-missing')
  let supported = 0
  for (const m of measurements) {
    const r = artifacts[m.receiptRef]?.data
    const c = candidates.find((c) => c.id === m.candidateId)
    check(!!c && isFocusReceipt(r), 'candidate-or-typed-receipt-missing')
    if (!c || !isFocusReceipt(r)) continue
    const verdict = focusReceiptVerdict(r)
    if (verdict === 'supported') supported++
    check(verdict === (truth.expectSupported ? 'supported' : 'refuted'), 'focus-verdict-mismatch')
    check(
      r.candidateId === c.id &&
        r.screenshotRef === c.screenshotRef &&
        r.screenshotSha === artifacts[c.screenshotRef]?.sha256 &&
        sentImages.includes(r.screenshotSha),
      'image-source-mismatch',
    )
    check(
      artifacts[c.rawRef]?.type === 'visual-response' && !!artifacts[m.annotatedRef]?.exists,
      'raw-response-or-annotation-missing',
    )
    check(
      inside(truth.inputBox, r.positiveControl) &&
        r.positiveControl.hit.ref === 'input#product-search-input',
      'wrong-native-control',
    )
    for (const p of r.samples) {
      check(inside(truth.region, p) && inside(c.perceivedRegion, p), 'sample-outside-visual-region')
      check(!truth.excludedRegions.some((x) => inside(x, p)), 'sample-on-excluded-icon')
      if (p.focusedWithinMs === null)
        check(!inside(truth.inputBox, p), 'failure-inside-known-working-input')
    }
    check(
      report.hypotheses.some(
        (h: any) => h.status === verdict && h.evidenceRefs.includes(m.receiptRef),
      ),
      'hypothesis-receipt-mismatch',
    )
    const clicks = report.events.filter(
      (e: any) => e.type === 'visual-focus:click-dispatched' && e.payload.candidateId === c.id,
    )
    check(clicks.length === r.actionCost && r.actionCost <= 8, 'click-metering-mismatch')
    check(
      typeof m.bindingReason === 'string' && m.bindingReason.length > 0,
      'semantic-binding-missing',
    )
  }
  check(truth.expectSupported ? supported > 0 : supported === 0, 'defect-count-mismatch')
  const visualFindings = report.findings.filter(
    (f: any) =>
      f.validationStatus === 'supported' &&
      f.evidenceRefs.some((ref: string) => artifacts[ref]?.type === 'focus-receipt'),
  )
  check(visualFindings.length === supported, 'finding-receipt-mismatch')
  check(report.usage.actions <= 40 && report.usage.modelCalls <= 30, 'run-budget-exceeded')
  return [...new Set(errors)]
}
