import type { Rule } from '../types.ts'

/**
 * Endpoints are browser-dispatched action and observed feedback, never model wall time.
 *
 * The requirement is read from the run's own contract. It is deliberately not a literal here: the
 * declared feedback budget is part of what the run was created under, so judging every run against
 * a remembered ten seconds would report a verdict for a number the contract never stated.
 */
export const responseTimeRule: Rule = {
  id: 'response-time',
  revision: '3.0.0',
  name: 'Response Time Budget',
  description:
    'Warn when measured UI response is unambiguously above the feedback requirement this run declares.',
  category: 'performance',
  enabled: true,
  routing: { version: '1', execution: 'automatic', eventTypes: ['response:observed'] },
  async evaluate({ events, feedbackWarningMs }) {
    const threshold = feedbackWarningMs
    const declared = typeof threshold === 'number' && Number.isFinite(threshold) && threshold > 0
    const observations = events.filter((e) => e.type === 'response:observed')
    // No browser-dispatched response was ever observed, so there is nothing for this rule to say.
    // This is the one honest `not-applicable`: the rule's own subject never occurred.
    if (!observations.length)
      return {
        ruleId: this.id,
        ruleRevision: this.revision,
        verdict: 'not-applicable',
        severity: 'info',
        title: 'UI response timing',
        expected: 'A browser-dispatched action with observed feedback',
        actual: 'No browser-dispatched response measurement',
        evidenceRefs: [],
        confidence: 0,
        details: { thresholdMs: declared ? threshold : null, measurements: [] },
      }
    // A response was measured but the run declares no requirement to judge it against. Substituting
    // a remembered ten seconds would report a verdict for a number this contract never stated, so
    // the requirement is unknown - and unknown is never a rule passing.
    if (!declared)
      return {
        ruleId: this.id,
        ruleRevision: this.revision,
        verdict: 'unknown',
        severity: 'info',
        title: 'UI response timing',
        expected: 'A feedback requirement declared by this run',
        actual: 'This run declares no feedback requirement to judge against',
        evidenceRefs: [],
        confidence: 0,
        details: { thresholdMs: null, measurements: [] },
      }
    const measurements = observations
      .map((e) => e.payload)
      .filter(
        (p) =>
          typeof p.durationMs === 'number' &&
          Number.isFinite(p.durationMs) &&
          p.durationMs >= 0 &&
          typeof p.uncertaintyMs === 'number' &&
          Number.isFinite(p.uncertaintyMs) &&
          p.uncertaintyMs >= 0,
      )
    const slow = measurements.filter(
      (m) => Number(m.durationMs) - Number(m.uncertaintyMs) > threshold,
    )
    const uncertain = measurements.filter(
      (m) =>
        Number(m.durationMs) - Number(m.uncertaintyMs) <= threshold &&
        Number(m.durationMs) + Number(m.uncertaintyMs) >= threshold,
    )
    const verdict = slow.length
      ? 'fail'
      : uncertain.length
        ? 'unknown'
        : measurements.length
          ? 'pass'
          : 'not-applicable'
    return {
      ruleId: this.id,
      ruleRevision: this.revision,
      verdict,
      severity: slow.length ? 'warning' : 'info',
      title: slow.length ? `UI response exceeded ${threshold} ms` : 'UI response timing',
      expected: `Feedback visible within ${threshold} ms of browser action dispatch`,
      actual: `${measurements.length} measured responses, ${slow.length} slow, ${uncertain.length} boundary-uncertain`,
      evidenceRefs: measurements.flatMap((m) =>
        Array.isArray(m.evidenceRefs)
          ? m.evidenceRefs.filter((r): r is string => typeof r === 'string')
          : [],
      ),
      confidence: uncertain.length ? 0 : 0.95,
      details: { thresholdMs: threshold, measurements, slow, uncertain },
    }
  },
}
