import { z } from 'zod'
import type { Page } from 'playwright'
import { config } from '../../shared/config.ts'
import { completionQuestion, jevAnswerSchema } from './completion-choice.ts'
import { abortable } from '../model/request.ts'

/** Eligibility is a necessary condition, not a declaration that exploration is complete. */
export function blockerEvidenceEligible(facts: {
  businessResult: string
  integrity: string
  gaps: readonly string[]
  pendingRules: number
  pendingAnalyses: number
  supportedFinding: boolean
  currentFailure: boolean
  recoveryOpportunity: boolean
  phase: string
}) {
  return (
    facts.businessResult === 'unknown' &&
    facts.integrity === 'clean' &&
    facts.gaps.length === 0 &&
    facts.pendingRules === 0 &&
    facts.pendingAnalyses === 0 &&
    facts.supportedFinding &&
    facts.currentFailure &&
    !facts.recoveryOpportunity &&
    facts.phase === 'exploring'
  )
}

export function blockerReviewBody(policy: string, state: unknown) {
  const body = {
    model: config.completionReview.model,
    state: { inspectionPolicy: [policy], inspectionState: state },
    questions: { completion: completionQuestion },
  }
  // Conservative upper bound; do not silently truncate obligations or evidence to fit.
  return Buffer.byteLength(JSON.stringify(body)) + 1024 <= 32000 ? body : undefined
}

const responseSchema = z.object({
  id: z.string().min(1),
  model: z.string(),
  provider: z.literal('TypeSafe'),
  answers: z.object({ completion: jevAnswerSchema }),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cost: z.number().finite().nonnegative(),
  }),
})

/** Read-only proposal. No execution callback and no retries, even on malformed responses. */
export async function requestBlockerReview(
  body: NonNullable<ReturnType<typeof blockerReviewBody>>,
  runSignal: AbortSignal,
  timeRemainingMs: number,
) {
  const controller = new AbortController()
  const signal = AbortSignal.any([runSignal, controller.signal])
  const timer = setTimeout(
    () => controller.abort(new Error('completion-review-timeout')),
    Math.max(1, Math.min(timeRemainingMs, config.completionReview.timeoutMs)),
  )
  try {
    signal.throwIfAborted()
    const response = await abortable(
      signal,
      fetch(config.completionReview.endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.completionReview.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      }),
    )
    // Never persist arbitrary error bodies, which can echo request credentials.
    if (!response.ok) throw Error(`completion-review-http-${response.status}`)
    const result = responseSchema.parse(await abortable(signal, response.json()))
    signal.throwIfAborted()
    if (result.model !== config.completionReview.expectedModel)
      throw Error('completion-review-model-mismatch')
    return result
  } finally {
    clearTimeout(timer)
  }
}

/** Do not close a path while an operable or unmeasured control could offer recovery.
 * Scan the full DOM, not the bounded model element list. Unknown UI surfaces stay with the Agent.
 */
export async function hasRecoveryOpportunity(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        'button,a,input,select,textarea,[role],[tabindex],[onclick],summary,label',
      ),
    ).some((el) => {
      const box = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      if (!box.width || !box.height || style.visibility === 'hidden' || style.display === 'none')
        return false
      if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') return false
      // Offscreen is a possible scroll target, not proof of an irrecoverable blocker.
      if (box.top < 0 || box.left < 0 || box.bottom > innerHeight || box.right > innerWidth)
        return true
      return [
        [0.5, 0.5],
        [0.2, 0.2],
        [0.8, 0.2],
        [0.2, 0.8],
        [0.8, 0.8],
      ].some(([x, y]) => {
        const hit = document.elementFromPoint(box.x + box.width * x!, box.y + box.height * y!)
        return !hit || el === hit || el.contains(hit)
      })
    }),
  )
}
