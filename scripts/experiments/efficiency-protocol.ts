export const efficiencyBudget = { totalTimeoutMs: 300000, maxActions: 40, maxModelCalls: 30 }
export const inspectionGoal =
  'Inspect the purchase journey. Purchase an item; inspect primary action access, response, expected rejection and recovery. Campaigns must not block submit; retryable failures must provide an operable retry within five seconds. Response above ten seconds warrants a warning.'

export function efficiencySchedule(phase: 'diagnostic' | 'learning-diagnostic' | 'compare') {
  if (phase === 'learning-diagnostic')
    return ['abnormal', 'healthy'].map((profile) => ({
      arm: 'candidate' as const,
      profile,
      repeat: 1,
    }))
  const profiles = phase === 'diagnostic' ? ['C0', 'C2'] : ['abnormal', 'healthy']
  const pairs = profiles.flatMap((profile) =>
    Array.from({ length: phase === 'diagnostic' ? 1 : 3 }, (_, i) => ({ profile, repeat: i + 1 })),
  )
  return pairs.flatMap((pair, i) =>
    (i % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']).map((arm) => ({
      ...pair,
      arm: arm as 'baseline' | 'candidate',
    })),
  )
}

export function efficiencyOptions(args: string[]) {
  const fields = new Map<string, string>()
  const allowed = new Set([
    '--baseline-ref',
    '--candidate-ref',
    '--phase',
    '--learning-source',
    '--max-cost-usd',
  ])
  args = args.filter((s) => s !== '--')
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]!,
      value = args[i + 1]
    if (!allowed.has(key) || !value || value.startsWith('--') || fields.has(key))
      throw Error(`Invalid experiment option: ${key}`)
    fields.set(key, value)
  }
  const baseline = fields.get('--baseline-ref'),
    candidate = fields.get('--candidate-ref'),
    phase = fields.get('--phase')
  if (
    !baseline ||
    !candidate ||
    ![baseline, candidate].every((s) => /^[a-f\d]{7,40}$/i.test(s)) ||
    !['diagnostic', 'learning-diagnostic', 'compare'].includes(phase ?? '')
  )
    throw Error(
      'Require immutable --baseline-ref <SHA> --candidate-ref <SHA> --phase diagnostic|learning-diagnostic|compare',
    )
  const learningSource = fields.get('--learning-source')
  if (phase !== 'diagnostic' && !learningSource)
    throw Error('Learning evaluation requires --learning-source with an unchanged approved rule')
  const maxCostUsd = Number(fields.get('--max-cost-usd') ?? '2')
  if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) throw Error('Invalid --max-cost-usd')
  return {
    baseline,
    candidate,
    phase: phase as 'diagnostic' | 'learning-diagnostic' | 'compare',
    learningSource,
    maxCostUsd,
  }
}

export function efficiencyMetrics(
  report: any,
  requests: any[],
  expectedProvider: string | Record<string, string>,
) {
  const events = report?.events ?? []
  const of = (type: string) => events.filter((e: any) => e.type === type)
  const completeUsage = requests.every(
    (r) =>
      typeof r.usage?.prompt_tokens === 'number' && typeof r.usage?.completion_tokens === 'number',
  )
  const completeCost = requests.every((r) => typeof r.usage?.cost === 'number')
  return {
    requests: requests.length,
    errors: requests.filter((r) => r.status !== 'success').length,
    unknownUsage: requests.filter(
      (r) => !r.usage || r.usage.prompt_tokens == null || r.usage.completion_tokens == null,
    ).length,
    inputTokens: completeUsage ? requests.reduce((n, r) => n + r.usage.prompt_tokens, 0) : null,
    outputTokens: completeUsage
      ? requests.reduce((n, r) => n + r.usage.completion_tokens, 0)
      : null,
    costUsd: completeCost ? requests.reduce((n, r) => n + r.usage.cost, 0) : null,
    comparableProvider:
      requests.length > 0 &&
      requests.every((r) => {
        const expected =
          typeof expectedProvider === 'string' ? expectedProvider : expectedProvider[r.model]
        return !!expected && r.provider?.toLowerCase() === expected.toLowerCase()
      }),
    cachedInputTokens: requests.every(
      (r) => typeof r.usage?.prompt_tokens_details?.cached_tokens === 'number',
    )
      ? requests.reduce((n, r) => n + r.usage.prompt_tokens_details.cached_tokens, 0)
      : null,
    elapsedMs: report?.usage?.elapsedMs ?? null,
    modelWaitMs: of('model:request-finished').reduce(
      (n: number, e: any) => n + (e.payload.modelDurationMs ?? e.payload.durationMs ?? 0),
      0,
    ),
    observations: {
      full: of('page:observed').length,
      light: of('observation:validated').length,
      reused: of('observation:reused').length,
    },
    checks: {
      evaluated: of('rule:evaluated').length,
      reused: of('rule:check-reused').length,
      skipped: of('rule:skipped').length,
    },
    toolErrors: of('tool:finished').filter((e: any) => e.payload.status === 'error').length,
    noProgressWarnings: of('run:no-progress').length,
    noProgressDecisions: of('run:statistics').at(-1)?.payload.progress?.noProgressDecisions ?? null,
    businessResponses: of('business:response').length,
    finishRejected: of('finish:rejected').length,
    finishAccepted: of('finish:accepted').length,
    profile: of('execution:profile').at(-1)?.payload ?? null,
  }
}

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
