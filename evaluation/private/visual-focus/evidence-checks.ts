import type { ScoredReceipt, VisualScorerInput } from './scorer.ts'
import { visualTruthFor } from '../../fixtures/visual.ts'

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const rect = (r: any) =>
  r && [r.x, r.y, r.width, r.height].every(finite) && r.width > 0 && r.height > 0
const inside = (r: any, p: any) =>
  rect(r) &&
  finite(p.x) &&
  finite(p.y) &&
  p.x >= r.x &&
  p.x <= r.x + r.width &&
  p.y >= r.y &&
  p.y <= r.y + r.height
const sameBox = (a: any, b: any, tolerance = 1) =>
  rect(a) &&
  rect(b) &&
  ['x', 'y', 'width', 'height'].every((k) => Math.abs(a[k] - b[k]) <= tolerance)
const clean = (s: any) =>
  s?.version === 1 &&
  s.status === 'clean' &&
  Array.isArray(s.interventionIds) &&
  s.interventionIds.length === 0

/** Cross-check identities and raw facts independently of the product's verdict. */
export function evidenceProblems(input: VisualScorerInput): string[] {
  const errors = new Set<string>()
  const check = (ok: unknown, code: string) => {
    if (!ok) errors.add(code)
  }
  const artifact = (ref: string | undefined, type?: string): any => {
    const a = ref ? input.artifacts[ref] : undefined
    check(a?.exists && (!type || a.type === type), 'evidence.artifact-unavailable')
    check(a?.runId === input.run.runId, 'provenance.same-run')
    return a?.data
  }
  for (const a of Object.values(input.artifacts)) check(a.exists, 'evidence.artifact-unavailable')
  for (const vision of input.sentVision) {
    check(
      Object.values(input.artifacts).some(
        (a) =>
          a.type === 'screenshot' &&
          a.exists &&
          a.runId === input.run.runId &&
          a.sha256 === vision.sha256,
      ),
      'provenance.image-sha-mismatch',
    )
    check(
      Object.values(input.artifacts).some(
        (a) =>
          a.type === 'visual-response' &&
          a.exists &&
          (a.data as any)?.screenshotSha === vision.sha256 &&
          JSON.stringify(JSON.parse((a.data as any).text)) === JSON.stringify(vision.raw),
      ),
      'provenance.response-missing',
    )
  }
  const candidates = Object.entries(input.artifacts)
    .filter(([, a]) => a.type === 'visual-candidate')
    .map(([ref, a]) => ({ ref, c: a.data as any }))
  check(
    candidates.length <= 2 && new Set(candidates.map(({ c }) => c?.id)).size === candidates.length,
    'geometry.candidate-count',
  )
  const truth = visualTruthFor(input.case)
  if (candidates.length === 0)
    check(
      input.sentVision.some(
        (v) => Array.isArray((v.raw as any)?.candidates) && (v.raw as any).candidates.length === 0,
      ),
      'provenance.candidates-missing',
    )
  for (const { c, ref } of candidates) {
    check(c?.runId === input.run.runId && c?.kind === 'input-focus-region', 'provenance.same-run')
    const matches = input.run.focusMeasurements.filter((m) => m.candidateId === c?.id)
    check(matches.length === 1, 'outcome.candidate-unresolved')
    const raw = artifact(c?.rawRef, 'visual-response')
    const vision = input.sentVision.find(
      (v) =>
        v.sha256 === c?.screenshotSha &&
        JSON.stringify(v.raw) === JSON.stringify(raw?.text ? JSON.parse(raw.text) : null),
    )
    const viewport = c?.viewport
    const rawCandidates = (vision?.raw as any)?.candidates
    const validRaw = (r: any) =>
      rect(r) && r.x >= 0 && r.y >= 0 && r.x + r.width <= 1000 && r.y + r.height <= 1000
    const transformed =
      Array.isArray(rawCandidates) &&
      rawCandidates.some((r: any) => {
        if (!validRaw(r.perceivedRegion) || !viewport) return false
        const scale = (b: any) => ({
          x: (b.x * viewport.width) / 1000,
          y: (b.y * viewport.height) / 1000,
          width: (b.width * viewport.width) / 1000,
          height: (b.height * viewport.height) / 1000,
        })
        return (
          sameBox(c.perceivedRegion, scale(r.perceivedRegion)) &&
          r.confidence === c.confidence &&
          Array.isArray(r.excludedRegions) &&
          r.excludedRegions.length === (c.excludedRegions?.length ?? -1) &&
          r.excludedRegions.every(
            (b: any, i: number) => validRaw(b) && sameBox(c.excludedRegions[i], scale(b)),
          )
        )
      })
    check(
      transformed && viewport?.width > 0 && viewport?.height > 0,
      'provenance.normalized-transform',
    )
    artifact(c?.screenshotRef, 'screenshot')
    check(
      input.artifacts[c?.screenshotRef]?.sha256 === c?.screenshotSha,
      'provenance.image-sha-mismatch',
    )
    check(
      raw?.screenshotRef === c?.screenshotRef && raw?.screenshotSha === c?.screenshotSha,
      'provenance.image-sha-mismatch',
    )
    check(
      raw?.coordinateTransform?.source === 'normalized-1000' &&
        raw?.coordinateTransform?.destination === 'css-pixels' &&
        raw.coordinateTransform.scaleX === viewport?.width / 1000 &&
        raw.coordinateTransform.scaleY === viewport?.height / 1000,
      'provenance.normalized-transform',
    )
    check(
      rect(c?.perceivedRegion) &&
        inside(
          { x: 0, y: 0, width: viewport?.width, height: viewport?.height },
          c.perceivedRegion,
        ) &&
        c.perceivedRegion.x + c.perceivedRegion.width <= viewport.width &&
        c.perceivedRegion.y + c.perceivedRegion.height <= viewport.height,
      'geometry.candidate-bounds',
    )
    for (const m of matches) {
      const r = artifact(m.receiptRef, 'focus-receipt') as ScoredReceipt
      if (
        !r?.binding ||
        !r.positiveControl ||
        !Array.isArray(r.samples) ||
        !Array.isArray(r.resets)
      ) {
        check(false, 'evidence.malformed')
        continue
      }
      check(
        r.version === 1 && r.windowMs === 500 && r.algorithmVersion === c.algorithmVersion,
        'measurement.protocol',
      )
      check(
        r.candidateId === c.id &&
          r.screenshotRef === c.screenshotRef &&
          r.documentEpoch === c.documentEpoch &&
          r.screenshotSha === c.screenshotSha &&
          m.nodeIdentity === r.binding.nodeIdentity,
        'binding.identity-chain',
      )
      check(
        r.viewport?.width === viewport?.width && r.viewport?.height === viewport?.height,
        'provenance.normalized-transform',
      )
      const witness = artifact(r.binding.witnessRef, 'binding-witness')
      check(
        witness?.candidateId === c.id &&
          witness?.nodeIdentity === r.binding.nodeIdentity &&
          witness?.elementRef === r.binding.elementRef &&
          witness?.documentEpoch === r.documentEpoch,
        'binding.witness-mismatch',
      )
      const snapshot = artifact(witness?.snapshotRef, 'snapshot')
      const nodes =
        snapshot?.elements?.filter((e: any) => e.selector === witness?.domPath?.join(' > ')) ?? []
      check(
        nodes.length === 1 &&
          nodes[0].tag === witness?.native.tag &&
          nodes[0].attributes?.id === witness?.native.id &&
          nodes[0].attributes?.type === witness?.native.type &&
          sameBox(nodes[0].bounds, witness?.bounds),
        'binding.observation-mismatch',
      )
      check(sameBox(witness?.bounds, truth.inputBox, 2), 'binding.witness-mismatch')
      const measured = artifact(m.samplesRef, 'measurement')
      check(
        measured?.receiptRef === m.receiptRef &&
          JSON.stringify(measured.samples) === JSON.stringify(r.samples),
        'measurement.artifact-mismatch',
      )
      artifact(m.annotatedRef, 'screenshot')
      check(
        input.run.events.some(
          (e) =>
            e.type === 'visual-focus:annotated' &&
            e.payload.candidateId === c.id &&
            e.payload.annotatedRef === m.annotatedRef &&
            e.payload.sourceRef === c.screenshotRef,
        ),
        'evidence.annotation-mismatch',
      )
      const calls = input.gatewayCalls.filter(
        (call) =>
          call.tool === 'focus_probe' &&
          call.runId === input.run.runId &&
          call.body.candidateId === c.id &&
          call.body.elementRef === r.binding.elementRef &&
          call.body.bindingReason === r.binding.reason,
      )
      check(calls.length > 0, 'binding.semantic-call-missing')
      const points = [r.positiveControl, ...r.samples]
      check(inside(truth.inputBox, r.positiveControl), 'measurement.control-failed')
      check(
        points.every(
          (p) =>
            p.stable === true && p.valueChanged === false && p.documentEpoch === r.documentEpoch,
        ),
        'measurement.unstable',
      )
      check(
        points.every((p) => p.focusBefore !== r.binding.nodeIdentity),
        'measurement.baseline-not-established',
      )
      check(
        points.every((p) =>
          p.focusedWithinMs === null
            ? p.focusAfter !== r.binding.nodeIdentity
            : finite(p.focusedWithinMs) &&
              p.focusedWithinMs >= 0 &&
              p.focusedWithinMs <= 500 &&
              p.focusAfter === r.binding.nodeIdentity,
        ),
        'measurement.focus-contradiction',
      )
      check(
        points.every((p) => finite(p.observedWindowMs) && p.observedWindowMs >= 500),
        'measurement.observed-window',
      )
      check(
        clean(r.integrity) &&
          points.every((p) => clean(p.integrity)) &&
          r.resets.every((p) => clean(p.integrity) && p.introducedChange === false),
        'measurement.integrity-intervened',
      )
      check(
        r.samples.every((p) => inside(c.perceivedRegion, p) && inside(truth.region, p)),
        'geometry.points-in-region',
      )
      check(
        r.samples.every((p) => !['button', 'a', 'select', 'textarea'].includes(p.hit?.tag)),
        'geometry.avoids-neighbour-controls',
      )
      const clicks = input.run.events.filter(
        (e) => e.type === 'visual-focus:click-dispatched' && e.payload.candidateId === c.id,
      )
      check(
        r.actionCost === points.length + r.resets.length &&
          clicks.length === r.actionCost &&
          r.actionCost <= 8,
        'metering.click-count-mismatch',
      )
      let pointIndex = 0,
        resetIndex = 0,
        sinceReset = false
      for (const click of clicks) {
        const isReset = click.payload.kind === 'neutral-reset'
        const expected = isReset ? r.resets[resetIndex++] : points[pointIndex++]
        check(
          expected && click.payload.x === expected.x && click.payload.y === expected.y,
          'measurement.click-sequence',
        )
        if (isReset) sinceReset = true
        else {
          const previous = points[pointIndex - 2]
          if (
            pointIndex > 1 &&
            (previous?.focusAfter === r.binding.nodeIdentity ||
              (expected as any)?.side === 'retest')
          )
            check(sinceReset, 'measurement.missing-reset')
          sinceReset = false
        }
      }
      check(
        pointIndex === points.length && resetIndex === r.resets.length,
        'measurement.click-sequence',
      )
      const hypotheses = input.run.hypotheses.filter((h) => h.evidenceRefs.includes(m.receiptRef!))
      check(
        hypotheses.length === 1 && hypotheses[0].evidenceRefs.includes(ref),
        'binding.hypothesis-chain',
      )
      for (const f of input.run.findings.filter((f) => f.evidenceRefs.includes(m.receiptRef!))) {
        check(!f.candidateId || f.candidateId === c.id, 'binding.finding-chain')
        check(
          f.evidenceRefs.includes(ref) &&
            f.evidenceRefs.includes(c.screenshotRef) &&
            f.evidenceRefs.includes(m.annotatedRef!),
          'binding.finding-chain',
        )
      }
    }
  }
  for (const h of input.run.hypotheses) {
    check(['supported', 'refuted'].includes(h.status), 'healthy.coverage-gap')
    for (const ref of h.evidenceRefs) artifact(ref)
  }
  for (const f of input.run.findings) {
    const bound = input.run.focusMeasurements.filter(
      (m) => m.receiptRef && f.evidenceRefs.includes(m.receiptRef),
    )
    check(bound.length === 1, 'binding.finding-chain')
    check(
      f.title === 'Sampled input-region clicks did not focus the input',
      'binding.finding-scope',
    )
    for (const ref of f.evidenceRefs) artifact(ref)
  }
  check(input.run.coverage.visualUnverified.length === 0, 'healthy.coverage-gap')
  const clicks = input.run.events.filter((e) => e.type === 'visual-focus:click-dispatched')
  check(
    input.run.usage.actions >= clicks.length &&
      input.run.usage.actions <= 40 &&
      input.run.usage.modelCalls <= 30,
    'business.usage-within-budget',
  )
  return [...errors]
}
