/**
 * Worst-case cost bound for a bounded Jev smoke batch.
 *
 * WHY THIS EXISTS: the batch may not run until its spend is bounded by a figure with a stated
 * basis. This module turns a recorded price fact into a checkable bound so the number is
 * re-derivable by a reviewer instead of being asserted in prose.
 *
 * WHAT IS DOCUMENTED vs ASSUMED:
 *  - input is billed per input token and output tokens are free (provider docs, quoted below);
 *  - the rate and the context cap come from the OpenRouter model page, recorded with a citation
 *    and a checked date;
 *  - QUESTIONS DO NOT CARRY A DOCUMENTED TOKEN COUNT. No source maps "N questions + state" to
 *    billed input tokens. The bound therefore conservatively assumes the request uses its ENTIRE
 *    context cap, which is the largest input the model can accept at all.
 *  - the cap itself is enforced on our side: `compile.ts` refuses a wire over the byte ceiling and
 *    `profile.maxQuestions` caps the question count, so an oversize request is rejected locally
 *    rather than sent.
 *
 * RESIDUAL UNKNOWN, recorded honestly: whether a request that exceeds the context cap is rejected
 * and whether such a request is billed is NOT documented. This bound is a spend ceiling only if
 * the client keeps every request inside the cap, which the local byte ceiling is designed to do.
 *
 * This module contacts nothing and reads no credential.
 */

export type PriceFact = {
  /** USD per input token, from the model page's Input Price SKU. */
  readonly inputUsdPerToken: number
  /** USD per output token. The documented rate for this model is 0. */
  readonly outputUsdPerToken: number
  /** Context length in tokens, which covers the state plus the questions. */
  readonly contextTokens: number
  readonly source: string
  readonly checkedAt: string
  /** The provider's own wording, kept verbatim so a reviewer can re-check the basis. */
  readonly quote: string
}

/**
 * Recorded 2026-10-07 from the OpenRouter model page (server-rendered; the page states
 * "$0.042 per million input tokens, $0 per million output tokens" and, in its catalog record,
 * Input Price 4.2e-8 USD per token with Output Price 0).
 */
export const JEV_PRICE_2026_10_07: PriceFact = {
  inputUsdPerToken: 4.2e-8,
  outputUsdPerToken: 0,
  contextTokens: 32000,
  source: 'https://openrouter.ai/typesafe/jev-1.13',
  checkedAt: '2026-10-07',
  quote: '$0.042 per million input tokens, $0 per million output tokens.',
}

export type CostBound = {
  readonly requests: number
  readonly perRequestUsd: number
  readonly batchUsd: number
  readonly ceilingUsd: number
  readonly withinCeiling: boolean
  readonly assumptions: readonly string[]
  readonly source: string
  readonly checkedAt: string
}

const finiteNonNegative = (value: number) => Number.isFinite(value) && value >= 0

export function worstCaseCostBound(
  price: PriceFact,
  requests: number,
  ceilingUsd: number,
): CostBound {
  if (!finiteNonNegative(price.inputUsdPerToken) || !finiteNonNegative(price.outputUsdPerToken))
    throw new Error('invalid-price-fact')
  if (!Number.isInteger(price.contextTokens) || price.contextTokens <= 0)
    throw new Error('invalid-price-fact')
  if (!Number.isInteger(requests) || requests <= 0) throw new Error('invalid-request-count')

  // Output is free, so the worst case is pure input at the full context cap.
  const perRequestUsd = price.contextTokens * price.inputUsdPerToken
  const batchUsd = perRequestUsd * requests
  return {
    requests,
    perRequestUsd,
    batchUsd,
    ceilingUsd,
    withinCeiling: batchUsd <= ceilingUsd,
    assumptions: [
      `worst-case input uses the full ${price.contextTokens}-token context length`,
      'output tokens are free, so they add nothing to the bound',
      'the rate is the model page Input Price SKU, not an average of observed calls',
      'no additional per-request or non-token fee SKU exists for this model',
      'an over-cap request is NOT documented as capped or free; the client rejects oversize payloads at its own byte ceiling before sending',
    ],
    source: price.source,
    checkedAt: price.checkedAt,
  }
}