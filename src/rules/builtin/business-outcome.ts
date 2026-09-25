import type { Rule } from '../types.ts'
import { normalizeFactEvents } from '../../business/facts.ts'

/**
 * Correlate the current business operation with what the page shows.
 *
 * This rule used to read the shopping field `response.orderId` out of the `business:response` event,
 * which the export protocol never emits - so it could not fire for an export run at all. R01 requires
 * a retry declaration to bind to an order *or* an export job without depending on `orderId`, and the
 * task book lists this rule as coupling to be handled.
 *
 * Identity now comes from the normalized `business:fact` events, whose field is `operationId` for
 * every business because the executor sets it from the adapter's own decode rather than from a
 * shopping field name. The legacy `business:response` payload stays readable for audit and for the
 * old shopping scorer, but it is no longer this rule's source of truth: a rule that read it would
 * work only where that field exists, which is the definition of the coupling being removed.
 */
export const businessOutcomeRule: Rule = {
  id: 'business-outcome',
  revision: '3.0.0',
  name: 'Business outcome communication',
  description:
    'Correlate a public business response with visible feedback and its operation identity.',
  category: 'business',
  enabled: true,
  routing: { version: '1', execution: 'automatic', eventTypes: ['business:fact'] },
  async evaluate({ snapshot, events, runId }) {
    // The rule layer's events are the decoded subset the engine passes; `normalizeFactEvents` reads
    // only the type and payload, so the remaining RunEvent fields are supplied to satisfy the type
    // rather than to be used.
    const facts = normalizeFactEvents(
      events.map((e, seq) => ({
        id: `${runId}-${seq}`,
        runId,
        seq,
        type: e.type,
        payload: e.payload,
        timestamp: e.timestamp,
        actionId: null,
        stepId: null,
        evidenceRefs: [],
      })),
    )
    const fact = facts.at(-1)
    const text = snapshot.elements
      .filter((e) => e.visible)
      .map((e) => e.text)
      .join(' ')
      .replace(/\s+/g, ' ')
    // No normalized fact means this business has published no outcome to correlate - not a pass and
    // not a defect. A legacy event is not an outcome for this rule to judge.
    if (!fact) {
      return {
        ruleId: this.id,
        ruleRevision: this.revision,
        verdict: 'not-applicable' as const,
        severity: 'info' as const,
        title: 'Business outcome communication',
        expected: 'Visible outcome corresponds to the public response and its operation identity',
        actual: 'No business response observed',
        evidenceRefs: snapshot.screenshotPath ? [snapshot.screenshotPath] : [],
        confidence: 0,
        details: { outcome: 'unknown' },
      }
    }
    const identityVisible = text.includes(fact.operationId)
    const noticeVisible = !!fact.notice && text.includes(fact.notice.replace(/\s+/g, ' '))
    // A verified outcome needs this operation's identity *and*, when the business states one, its
    // visible notice. Another task's outcome, or a bare success label, cannot confirm this one.
    const matching = identityVisible && noticeVisible
    return {
      ruleId: this.id,
      ruleRevision: this.revision,
      verdict: matching ? ('pass' as const) : ('unknown' as const),
      severity: 'info' as const,
      title: 'Business outcome communication',
      expected: 'Visible outcome corresponds to the public response and its operation identity',
      actual: matching
        ? `Matching operation ${fact.operationId}, phase ${fact.phase}`
        : identityVisible
          ? 'Feedback not yet correlated'
          : 'Operation identity not visible',
      evidenceRefs: snapshot.screenshotPath ? [snapshot.screenshotPath] : [],
      confidence: matching ? 0.95 : 0,
      details: { outcome: fact.phase, operationId: fact.operationId, matchingOperation: matching },
    }
  },
}
