import { verifyInspectionProof, proofDigest, type InspectionProof } from './completion.ts'
import { projectInspectionScope } from './scope.ts'
import { verifyUiContractSnapshot } from './contract.ts'
import type { Run, RunEvent } from '../shared/types.ts'
import { recoveryHistoryIssues } from './recovery-history.ts'

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
  const issues: string[] = recoveryHistoryIssues(events)
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
      : proof.outcome !== 'blocked')
  )
    issues.push('inspection-proof-outcome-mismatch')
  const history = events.filter((e) => e.seq < accepted.seq)
  const scope = projectInspectionScope(history)
  const snapshot = scope.snapshot()
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
    ({ itemId, category, status, reasonCode, evidenceRefs, basis }) => ({
      itemId,
      category,
      status,
      reasonCode,
      evidenceRefs,
      basis,
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
