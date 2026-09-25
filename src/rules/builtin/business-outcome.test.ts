import { describe, it, expect } from 'vitest'
import { businessOutcomeRule } from './business-outcome.ts'
import type { RuleContext, RuleEvent, PageSnapshot } from '../types.ts'

/**
 * The business-outcome rule must correlate the current operation's identity with what the page
 * shows, for whichever business is being inspected.
 *
 * It used to read the raw shopping field `response.orderId`, which the export protocol never emits -
 * so the rule could not fire for an export run at all, and R01 requires a retry declaration to bind
 * to an order *or* an export job "不依赖 orderId". The identity now comes from the normalized
 * `business:fact` / `business:verified` events, whose field is `operationId` for every business,
 * because the executor sets it from the adapter's own decode rather than from a shopping field name.
 *
 * The rule must not read the legacy `business:response` payload for identity: doing so would only
 * work for checkout, and the export protocol deliberately emits no `orderId` to be read.
 */

const snapshot = (texts: readonly string[], screenshotPath?: string): PageSnapshot =>
  ({
    url: 'http://127.0.0.1:4183/',
    title: 'Arena',
    viewport: { width: 1280, height: 720 },
    elements: texts.map((text) => ({
      selector: `#e${text}`,
      tag: 'div',
      text,
      visible: true,
      bounds: { x: 0, y: 0, width: 10, height: 10 },
      attributes: {},
    })),
    ...(screenshotPath ? { screenshotPath } : {}),
  }) as PageSnapshot

const context = (events: readonly RuleEvent[], page: PageSnapshot): RuleContext =>
  ({
    runId: 'run-1',
    currentUrl: page.url,
    pageTitle: page.title,
    timestamp: new Date().toISOString(),
    events,
    snapshot: page,
  }) as RuleContext

/**
 * A complete normalized fact, as the executor persists it. `decodeFact` validates every field, so a
 * partial fixture would be dropped and the rule would read no fact at all - which would make these
 * tests pass for the wrong reason.
 */
const factEvent = (fields: {
  operationId: string
  phase: string
  notice: string | null
  result?: string
}): RuleEvent => ({
  type: 'business:fact',
  timestamp: new Date().toISOString(),
  payload: {
    schemaVersion: '1',
    profileId: 'export',
    contractHash: 'a'.repeat(64),
    operationId: fields.operationId,
    attempt: 0,
    version: 1,
    phase: fields.phase,
    result: fields.result ?? (fields.phase === 'succeeded' ? 'success' : 'unknown'),
    retryEligibility: 'unknown',
    notice: fields.notice,
    retry: null,
    sourceEventId: 'obs-1',
    evidenceRefs: [],
    observedAt: new Date().toISOString(),
  },
})

describe('business-outcome correlates by operation id, not by a shopping field', () => {
  it('passes when the page shows an export job id and its notice', async () => {
    const result = await businessOutcomeRule.evaluate(
      context(
        [factEvent({ operationId: 'job-abc123', phase: 'succeeded', notice: 'Export delivered' })],
        snapshot(['Job job-abc123', 'Export delivered']),
      ),
    )
    expect(result.verdict).toBe('pass')
    expect(JSON.stringify(result.details)).toContain('job-abc123')
  })

  it('passes for a shopping order whose id and message are visible', async () => {
    // The same rule, unchanged, must still work for checkout - the fix is business-neutral, not a
    // swap of one hardcoded field for another.
    const result = await businessOutcomeRule.evaluate(
      context(
        [factEvent({ operationId: 'order-77', phase: 'succeeded', notice: 'Payment accepted' })],
        snapshot(['Order order-77', 'Payment accepted']),
      ),
    )
    expect(result.verdict).toBe('pass')
  })

  it('is unknown when the operation identity is not visible on the page', async () => {
    const result = await businessOutcomeRule.evaluate(
      context(
        [factEvent({ operationId: 'job-abc123', phase: 'succeeded', notice: 'Export delivered' })],
        // Another task's success, and a bare "success", must not confirm this operation.
        snapshot(['Job job-other', 'Export delivered']),
      ),
    )
    expect(result.verdict).toBe('unknown')
  })

  it('is unknown when the notice is missing from the page', async () => {
    const result = await businessOutcomeRule.evaluate(
      context(
        [factEvent({ operationId: 'job-abc123', phase: 'succeeded', notice: 'Export delivered' })],
        snapshot(['Job job-abc123', 'Something else entirely']),
      ),
    )
    expect(result.verdict).toBe('unknown')
  })

  it('is not-applicable before any business response is observed', async () => {
    const result = await businessOutcomeRule.evaluate(context([], snapshot(['Nothing yet'])))
    expect(result.verdict).toBe('not-applicable')
  })

  it('does not read identity from the legacy shopping response payload', async () => {
    // A legacy event carrying only `orderId` must not be treated as the normalized identity: the
    // rule's job is the current business's own fact. This keeps the legacy shape readable for audit
    // without making it the rule's source of truth.
    const result = await businessOutcomeRule.evaluate(
      context(
        [
          {
            type: 'business:response',
            timestamp: new Date().toISOString(),
            payload: { orderId: 'order-9', status: 'paid' },
          },
        ],
        snapshot(['Order order-9']),
      ),
    )
    expect(result.verdict).toBe('not-applicable')
  })

  it('passes for a checkout order expressed as a normalized fact, not a legacy response', async () => {
    // This is the engine test's scenario re-expressed through the shape the rule now reads. The
    // legacy `business:response` shape is no longer the rule's source of truth, so the equivalent
    // coverage lives here - the rule's own behaviour for checkout is unchanged, only its input.
    const result = await businessOutcomeRule.evaluate(
      context(
        [
          factEvent({
            operationId: 'order-2',
            phase: 'rejected',
            notice: 'Payment declined: Insufficient funds',
            result: 'rejected',
          }),
        ],
        snapshot(['Payment declined: Insufficient funds order-2', 'Try Again']),
      ),
    )
    expect(result.verdict).toBe('pass')
    expect(result.details.outcome).toBe('rejected')
    expect(result.details.matchingOperation).toBe(true)
  })
})
