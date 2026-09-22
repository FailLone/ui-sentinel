import type { Rule } from '../types.ts'

export const businessOutcomeRule: Rule = {
  id: 'business-outcome',
  revision: '2.0.0',
  name: 'Business outcome communication',
  description: 'Correlate a public business response with visible feedback and its order identity.',
  category: 'business',
  enabled: true,
  async evaluate({ snapshot, events }) {
    const response = events.filter((e) => e.type === 'business:response').at(-1)?.payload
    const text = snapshot.elements
      .filter((e) => e.visible)
      .map((e) => e.text)
      .join(' ')
      .replace(/\s+/g, ' ')
    const hasResponse = !!response?.orderId
    const matching =
      hasResponse &&
      text.includes(String(response.orderId)) &&
      typeof response.message === 'string' &&
      text.includes(response.message.replace(/\s+/g, ' '))
    // Retry availability is deliberately not decided here; discovery and learned transitions own it.
    const verdict = !hasResponse ? 'not-applicable' : matching ? 'pass' : 'unknown'
    return {
      ruleId: this.id,
      ruleRevision: this.revision,
      verdict,
      severity: 'info',
      title: 'Business outcome communication',
      expected: 'Visible outcome corresponds to the public response and order',
      actual: matching
        ? `Matching order ${response.orderId}, status ${response.status}`
        : hasResponse
          ? 'Feedback not yet correlated'
          : 'No business response observed',
      evidenceRefs: snapshot.screenshotPath ? [snapshot.screenshotPath] : [],
      confidence: matching ? 0.95 : 0,
      details: { outcome: response?.status ?? 'unknown', matchingOrder: !!matching },
    }
  },
}
