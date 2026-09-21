import type { Rule, RuleContext, RuleResult } from '../types.ts'

const WARNING_THRESHOLD_MS = 10_000

export const responseTimeRule: Rule = {
  id: 'response-time',
  revision: '1.0.0',
  name: 'Response Time Budget',
  description: 'Warns when page response exceeds the configured time budget (default 10s)',
  category: 'performance',
  enabled: true,

  async evaluate(context: RuleContext): Promise<RuleResult> {
    const { events } = context

    const actionPairs: Array<{ action: string; startMs: number; endMs: number; durationMs: number }> = []

    const pending = new Map<string, { type: string; timestamp: string }>()

    for (const event of events) {
      if (event.type === 'action:executing') {
        const actionId = String(event.payload.type ?? 'unknown')
        pending.set(actionId, { type: actionId, timestamp: event.timestamp })
      }

      if (event.type === 'action:completed' || event.type === 'action:failed') {
        const actionId = String(event.payload.type ?? 'unknown')
        const start = pending.get(actionId)
        if (start) {
          const startMs = new Date(start.timestamp).getTime()
          const endMs = new Date(event.timestamp).getTime()
          actionPairs.push({
            action: actionId,
            startMs,
            endMs,
            durationMs: endMs - startMs,
          })
          pending.delete(actionId)
        }
      }
    }

    if (actionPairs.length === 0) {
      return {
        ruleId: this.id,
        ruleRevision: this.revision,
        verdict: 'not-applicable',
        severity: 'info',
        title: 'No action timing data available',
        expected: 'Action timing data to evaluate',
        actual: 'No completed actions with timing',
        evidenceRefs: [],
        confidence: 0.9,
        details: { reason: 'no-timing-data' },
      }
    }

    const slow = actionPairs.filter((p) => p.durationMs > WARNING_THRESHOLD_MS)
    const maxDuration = Math.max(...actionPairs.map((p) => p.durationMs))
    const avgDuration = actionPairs.reduce((sum, p) => sum + p.durationMs, 0) / actionPairs.length

    if (slow.length === 0) {
      return {
        ruleId: this.id,
        ruleRevision: this.revision,
        verdict: 'pass',
        severity: 'info',
        title: 'All actions within response time budget',
        expected: `Action response under ${WARNING_THRESHOLD_MS}ms`,
        actual: `Max response: ${maxDuration}ms, Avg: ${Math.round(avgDuration)}ms`,
        evidenceRefs: [],
        confidence: 0.9,
        details: {
          threshold: WARNING_THRESHOLD_MS,
          actionCount: actionPairs.length,
          maxDurationMs: maxDuration,
          avgDurationMs: Math.round(avgDuration),
        },
      }
    }

    return {
      ruleId: this.id,
      ruleRevision: this.revision,
      verdict: 'fail',
      severity: 'warning',
      title: `${slow.length} action(s) exceeded ${WARNING_THRESHOLD_MS / 1000}s response time`,
      expected: `Action response under ${WARNING_THRESHOLD_MS}ms`,
      actual: `${slow.length} slow action(s). Slowest: ${maxDuration}ms`,
      evidenceRefs: [],
      confidence: 0.85,
      details: {
        threshold: WARNING_THRESHOLD_MS,
        slowActions: slow,
        actionCount: actionPairs.length,
        maxDurationMs: maxDuration,
        avgDurationMs: Math.round(avgDuration),
      },
    }
  },
}
