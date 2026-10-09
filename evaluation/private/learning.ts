export function scoreBoundRecheck(
  report: any,
  backend: any,
  artifacts: { exists: boolean }[],
  ruleId: string,
  timeoutMs: number,
  healthy: boolean,
) {
  const expected = healthy ? 'pass' : 'fail'
  const supported = report.findings.filter((f: any) => f.validationStatus === 'supported')
  const completed = report.events.filter(
    (e: any) => e.type === 'rule:check-completed' && e.payload.ruleId === ruleId,
  )
  const measured = report.events.filter(
    (e: any) => e.type === 'transition:observed' && e.payload.binding?.ruleId === ruleId,
  )
  const assertions = {
    oneBoundCheck: completed.length === 1 && completed[0].payload.verdict === expected,
    declaredWindow:
      measured.length === 1 &&
      measured[0].payload.observedUntilMs - measured[0].payload.startedAtMs >= timeoutMs &&
      measured[0].payload.observedUntilMs - measured[0].payload.startedAtMs <= timeoutMs + 1500,
    noDuplicateFinding: supported.length === (healthy ? 0 : 1),
    noInvalidEvidence: !report.events.some(
      (e: any) =>
        e.type === 'tool:finished' &&
        String(e.payload.error ?? '').includes('invalid evidence reference'),
    ),
  }
  const passed =
    Object.values(assertions).every(Boolean) &&
    report.events.some(
      (e: any) =>
        e.type === 'rule:evaluated' &&
        e.payload.ruleId === ruleId &&
        e.payload.verdict === expected,
    ) &&
    artifacts.length > 0 &&
    artifacts.every((a) => a.exists) &&
    report.usage.modelCalls <= 30 &&
    report.usage.actions <= 40 &&
    report.usage.elapsedMs <= 303000 &&
    backend.orders.length === 1 &&
    report.events.some((e: any) => e.type === 'finish:accepted') &&
    !['timed-out', 'execution-error', 'cancelled', 'interrupted'].includes(report.status) &&
    (healthy
      ? supported.length === 0
      : supported.some((f: any) => f.ruleId === ruleId && f.source === 'rule'))
  return { passed, assertions, expected }
}
