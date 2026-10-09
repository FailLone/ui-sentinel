import { samplingHistoryIssues } from './sampling-history.ts'
import { verifyInspectionProof, proofDigest, type InspectionProof } from './completion.ts'
import { projectInspectionScope } from './scope.ts'
import { verifyUiContractSnapshot } from './contract.ts'
import type { Run, RunEvent } from '../shared/types.ts'
import { recoveryHistoryIssues } from './recovery-history.ts'
import { blockerHistoryIssues } from './blocker-evidence.ts'
import { probeHistoryIssues } from './probe-history.ts'

/** Reconcile a proof with durable facts. A self-consistent JSON hash alone is never coverage. */
export function inspectionHistoryIssues(
  run: Run,
  events: readonly RunEvent[],
  readable?: ReadonlySet<string>,
): string[] {
  try {
    return inspectHistory(run, events, readable)
  } catch {
    return ['inspection-history-malformed']
  }
}
function inspectHistory(
  run: Run,
  events: readonly RunEvent[],
  readable?: ReadonlySet<string>,
): string[] {
  const accepted = events.filter((e) => e.type === 'finish:accepted').at(-1)
  const proof = accepted?.payload.inspectionProof as InspectionProof | undefined
  if (!accepted || !proof) return ['inspection-proof-missing']
  if (!verifyInspectionProof(proof)) return ['inspection-proof-unverified']
  const issues: string[] = [...recoveryHistoryIssues(events), ...probeHistoryIssues(events)]
  if (
    !run.spec.uiContract ||
    !verifyUiContractSnapshot(run.spec.uiContract) ||
    proof.contractHash !== run.spec.uiContract.hash
  )
    issues.push('inspection-proof-contract-mismatch')
  if (proof.specDigest !== proofDigest(run.spec)) issues.push('inspection-proof-spec-mismatch')
  if (run.businessResult !== 'not-applicable') issues.push('ui-business-result-invalid')
  if (
    proof.outcome !== run.stopReason ||
    accepted.payload.reasonCode !== proof.claim ||
    (proof.claim === 'scope-covered'
      ? proof.outcome !== 'goal-reached' || run.status !== 'completed'
      : proof.outcome !== 'blocked' || run.status !== 'blocked')
  )
    issues.push('inspection-proof-outcome-mismatch')
  if (run.spec.uiContract?.checkPolicy && proof.version !== 'inspection-proof-4')
    issues.push('v2-proof-required')
  const history = events.filter((e) => e.seq < accepted.seq)
  if (proof.version === 'inspection-proof-3' || proof.version === 'inspection-proof-4') {
    if (events.some((e) => e.type === 'run:cancel-requested' || e.type === 'run:cancelled'))
      issues.push('inspection-cancelled')
    if (history.some((e) => e.type === 'execution:stopped' || e.type === 'action:failed'))
      issues.push('inspection-execution-failed')
  }
  if (accepted.runId !== run.id) issues.push('inspection-finish-run-mismatch')
  issues.push(
    ...blockerHistoryIssues(
      run.id,
      history,
      proof.blockerEvidence,
      proof.claim === 'observed-blocker',
    ),
  )
  const scope = projectInspectionScope(history)
  const snapshot = scope.snapshot()
  if (run.spec.uiContract?.samplingPolicy)
    issues.push(
      ...samplingHistoryIssues(
        history,
        snapshot,
        run.spec.uiContract.samplingPolicy,
        proof.claim === 'scope-covered',
      ),
    )
  if (events.some((e) => e.seq > accepted.seq && e.type.startsWith('scope:')))
    issues.push('scope-after-finish')
  if (
    proof.scopeDigest !==
    proofDigest({
      items: snapshot.items,
      candidates: snapshot.candidates,
      unsupported: snapshot.unsupported,
    })
  )
    issues.push('inspection-proof-scope-mismatch')
  const items = snapshot.items.map(
    ({ itemId, category, status, reasonCode, evidenceRefs, basis, checks }) => ({
      itemId,
      category,
      status,
      reasonCode,
      evidenceRefs,
      basis,
      ...(checks ? { checks } : {}),
    }),
  )
  if (proofDigest(items) !== proofDigest(proof.items))
    issues.push('inspection-proof-items-mismatch')
  const { total, verified, failed, unverified, excluded } = snapshot.counts
  if (proofDigest({ total, verified, failed, unverified, excluded }) !== proofDigest(proof.counts))
    issues.push('inspection-proof-counts-mismatch')
  const knownRefs = new Set(history.flatMap((event) => event.evidenceRefs ?? []))
  for (const item of snapshot.items) {
    if (!['verified', 'failed'].includes(item.status)) continue
    if (
      !item.evidenceRefs.length ||
      item.evidenceRefs.some((ref) => !knownRefs.has(ref) || (readable && !readable.has(ref)))
    )
      issues.push(`inspection-evidence-unavailable:${item.itemId}`)
    if (item.eventIds.some((id) => !history.some((event) => event.id === id)))
      issues.push(`inspection-event-unavailable:${item.itemId}`)
  }
  for (const requirement of run.spec.uiContract?.requiredChecks ?? []) {
    const mandatory = snapshot.items.filter(
      (i) => i.basis === `public-required:${requirement.id}: ${requirement.description}`,
    )
    if (
      mandatory.length !== 1 ||
      !mandatory[0]!.selected ||
      mandatory[0]!.targetSource !== 'executor' ||
      mandatory[0]!.status === 'excluded'
    )
      issues.push(`required-registration-missing:${requirement.id}`)
    const item = mandatory[0]
    if (!item || !['verified', 'failed'].includes(item.status)) continue
    const bindings = history.filter(
      (e) =>
        e.type === 'scope:required-bound' &&
        e.payload.requiredItemId === item.itemId &&
        e.payload.requiredId === requirement.id,
    )
    const bound = snapshot.items.find((i) => i.itemId === bindings.at(-1)?.payload.itemId)
    if (
      !bound ||
      !bound.selected ||
      (bound.checks
        ? bound.checks.effects.find(
            (e) => e.sourceKind === 'required-check' && e.sourceId === requirement.id,
          )?.state !== item.status
        : bound.status !== item.status) ||
      (!bound.checks && proofDigest(bound.evidenceRefs) !== proofDigest(item.evidenceRefs))
    )
      issues.push(`required-measurement-mismatch:${requirement.id}`)
  }
  if (run.spec.uiContract?.checkPolicy)
    for (const i of snapshot.items)
      if (i.selected && i.category === 'local-interaction' && !i.checks)
        issues.push('v2-missing-facets')
  if (proof.claim === 'scope-covered') {
    if (
      !snapshot.items.some(
        (item) => item.category === 'entry-observation' && item.status === 'verified',
      )
    )
      issues.push('entry-not-observed')
    if (scope.completionGaps().length) issues.push('scope-incomplete')
    if (history.some((event) => event.type === 'execution:intervention'))
      issues.push('evidence-intervened')
  }
  return [...new Set(issues)]
}
