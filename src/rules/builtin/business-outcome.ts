import type { Rule, RuleContext, RuleResult } from '../types.ts'

export const businessOutcomeRule: Rule = {
  id: 'business-outcome',
  revision: '1.0.0',
  name: 'Business Outcome Verification',
  description: 'Verifies that the business outcome is clearly communicated to the user',
  category: 'business',
  enabled: true,

  async evaluate(context: RuleContext): Promise<RuleResult> {
    const { snapshot, events } = context

    const hasPaymentEvent = events.some((e) =>
      e.type === 'action:completed' &&
      (String(e.payload.target ?? '').includes('pay') ||
        String(e.payload.target ?? '').includes('checkout')),
    )

    if (!hasPaymentEvent) {
      return {
        ruleId: this.id,
        ruleRevision: this.revision,
        verdict: 'not-applicable',
        severity: 'info',
        title: 'No payment action detected yet',
        expected: 'Payment action to evaluate',
        actual: 'No payment action in event history',
        evidenceRefs: [],
        confidence: 0.9,
        details: { reason: 'no-payment-action' },
      }
    }

    const pageText = snapshot.elements.map((el) => el.text.toLowerCase()).join(' ')

    const successIndicators = [
      'order confirmed',
      'payment successful',
      'thank you for your purchase',
      'order placed',
      'purchase complete',
    ]

    const rejectionIndicators = [
      'payment declined',
      'payment rejected',
      'insufficient funds',
      'card declined',
      'transaction declined',
    ]

    const failureIndicators = [
      'payment failed',
      'transaction failed',
      'error processing',
      'try again',
      'please retry',
    ]

    const isSuccess = successIndicators.some((ind) => pageText.includes(ind))
    const isRejection = rejectionIndicators.some((ind) => pageText.includes(ind))
    const isFailure = failureIndicators.some((ind) => pageText.includes(ind))

    if (isSuccess) {
      return {
        ruleId: this.id,
        ruleRevision: this.revision,
        verdict: 'pass',
        severity: 'info',
        title: 'Business outcome: Success',
        expected: 'Clear business outcome communication',
        actual: 'Order success message displayed',
        evidenceRefs: snapshot.screenshotPath ? [snapshot.screenshotPath] : [],
        confidence: 0.9,
        details: { outcome: 'success', indicators: successIndicators.filter((i) => pageText.includes(i)) },
      }
    }

    if (isRejection) {
      const hasRetryOption = snapshot.elements.some((el) =>
        el.visible &&
        (el.tag === 'button' || el.tag === 'a') &&
        (el.text.toLowerCase().includes('retry') ||
          el.text.toLowerCase().includes('try again') ||
          el.text.toLowerCase().includes('different payment')),
      )

      return {
        ruleId: this.id,
        ruleRevision: this.revision,
        verdict: hasRetryOption ? 'pass' : 'fail',
        severity: hasRetryOption ? 'info' : 'warning',
        title: `Business outcome: Payment rejected${hasRetryOption ? ' (with retry option)' : ' (no retry option)'}`,
        expected: 'Payment rejection should show clear reason and recovery option',
        actual: `Rejection message displayed. Retry option: ${hasRetryOption ? 'yes' : 'no'}`,
        evidenceRefs: snapshot.screenshotPath ? [snapshot.screenshotPath] : [],
        confidence: 0.85,
        details: {
          outcome: 'rejected',
          hasRetryOption,
          indicators: rejectionIndicators.filter((i) => pageText.includes(i)),
        },
      }
    }

    if (isFailure) {
      return {
        ruleId: this.id,
        ruleRevision: this.revision,
        verdict: 'pass',
        severity: 'warning',
        title: 'Business outcome: Payment failed (failure communicated)',
        expected: 'Clear business outcome communication',
        actual: 'Payment failure message displayed',
        evidenceRefs: snapshot.screenshotPath ? [snapshot.screenshotPath] : [],
        confidence: 0.8,
        details: {
          outcome: 'failed',
          indicators: failureIndicators.filter((i) => pageText.includes(i)),
        },
      }
    }

    return {
      ruleId: this.id,
      ruleRevision: this.revision,
      verdict: 'unknown',
      severity: 'warning',
      title: 'Business outcome unclear',
      expected: 'Clear business outcome after payment action',
      actual: 'No recognizable success, rejection, or failure message found',
      evidenceRefs: snapshot.screenshotPath ? [snapshot.screenshotPath] : [],
      confidence: 0.5,
      details: { outcome: 'unclear' },
    }
  },
}
