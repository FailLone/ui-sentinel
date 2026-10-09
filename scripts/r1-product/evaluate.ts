/** Frozen product assertions; evaluator has oracle labels, the product receives only public pages. */
export function evaluateProduct(report: any, scenario: string, readable: ReadonlySet<string>) {
  const exp = report.uiScan?.exploration,
    checks = report.uiScan?.checkCounts,
    issues: string[] = []
  const partial = ['ambiguous', 'recovery', 'budget'].includes(scenario)
  const expectedActions: Record<string, number> = {
    'menu-healthy': 1,
    'tabs-defect': 1,
    'boundary-input': 1,
    refresh: 3,
    'view-context': 3,
    'view-context-healthy': 3,
    'return-start': 2,
    'three-step-defect': 3,
    'three-step-healthy': 3,
    fairness: 3,
    'layout-pair': 2,
    'repeat-defect': 2,
    ambiguous: 0,
    recovery: 1,
    budget: 1,
  }
  const failures: Record<string, number> = {
    'tabs-defect': 1,
    'three-step-defect': 1,
    fairness: 2,
    'repeat-defect': 1,
    'view-context': 1,
  }
  const integrity =
    report.persistence?.status === 'verified' &&
    report.uiScan?.proofVerified === true &&
    report.inspectionIntegrity?.status !== 'dirty' &&
    !!exp &&
    exp.attempts.every(
      (a: any) =>
        a.measurement === 'unverified' ||
        (a.evidenceRefs.length > 0 && a.evidenceRefs.every((ref: string) => readable.has(ref))),
    )
  if (!integrity) issues.push('original-persistence-or-measurement-chain')
  const falseCovered = partial && report.uiScan?.inspection.coverage === 'covered'
  if (report.status !== (partial ? 'blocked' : 'completed'))
    issues.push('unexpected-terminal-status')
  if (report.usage.actions !== expectedActions[scenario]) issues.push('expected-bounded-actions')
  if (checks?.requiredEffectFailedCount !== (failures[scenario] ?? 0))
    issues.push('effect-failure-count')
  const supported = report.findings.filter((f: any) => f.validationStatus === 'supported')
  if (supported.length !== (scenario === 'layout-pair' ? 1 : (failures[scenario] ?? 0)))
    issues.push('supported-findings')
  if (exp?.usage.jevCalls !== 0) issues.push('unexpected-jev-call')
  if (
    !partial &&
    !exp?.paths.some((p: any) => p.measured && p.actionIds.length === expectedActions[scenario])
  )
    issues.push('original-measured-path')
  if (
    ['menu-healthy', 'three-step-healthy', 'repeat-defect', 'fairness', 'view-context'].includes(
      scenario,
    ) &&
    checks?.requiredEffectVerifiedCount !== 1
  )
    issues.push('healthy-measurement')
  if (
    scenario === 'fairness' &&
    JSON.stringify(exp?.attempts.map((a: any) => a.label)) !==
      JSON.stringify(['Primary', 'Secondary', 'Quiet control'])
  )
    issues.push('low-priority-opportunity')
  if (
    scenario === 'layout-pair' &&
    !supported.some((f: any) => f.ruleId === 'control-text-clipping')
  )
    issues.push('original-layout-rule')
  if (
    ['refresh', 'return-start'].includes(scenario) &&
    new Set(exp?.visitedStates.map((s: string) => JSON.parse(s)[1])).size < 2
  )
    issues.push('new-document-rebinding')
  if (scenario === 'view-context-healthy' && checks?.requiredEffectVerifiedCount !== 2)
    issues.push('healthy-view-recheck')
  if (scenario === 'recovery' && checks?.requiredEffectPendingCount !== 1)
    issues.push('original-unresolved-effect-lost')
  if (partial && !exp?.handoffs.length) issues.push('missing-handoff')
  return {
    version: 'r1-product-evaluation-1',
    passed: issues.length === 0,
    integrity,
    falseCovered,
    issues,
    scope: 'Synthetic public fixtures; no Jev quality or statistical benefit inference',
  }
}
