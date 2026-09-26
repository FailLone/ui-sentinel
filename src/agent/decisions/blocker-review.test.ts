import { afterEach, expect, it, vi } from 'vitest'
import {
  blockerEvidenceEligible,
  blockerReviewBody,
  blockerReviewState,
  requestBlockerReview,
} from './blocker-review.ts'
import { config } from '../../shared/config.ts'

const facts = {
  businessResult: 'unknown',
  integrity: 'clean',
  gaps: [],
  pendingRules: 0,
  pendingAnalyses: 0,
  supportedFinding: true,
  currentFailure: true,
  recoveryOpportunity: false,
  phase: 'exploring',
}
afterEach(() => vi.unstubAllGlobals())

it.each([
  { businessResult: 'success' },
  { businessResult: 'rejected' },
  { integrity: 'intervened' },
  { gaps: ['novel unresolved anomaly'] },
  { pendingRules: 1 },
  { pendingAnalyses: 1 },
  { supportedFinding: false },
  { currentFailure: false },
  { recoveryOpportunity: true },
  { phase: 'finalizing' },
])('preserves exploration when necessary evidence/coverage conditions fail: %j', (change) => {
  expect(blockerEvidenceEligible({ ...facts, ...change })).toBe(false)
})

it('admits a measured retry blocker for semantic review even with unrelated operable controls', () => {
  expect(
    blockerEvidenceEligible({
      ...facts,
      currentFailure: false,
      recoveryOpportunity: true,
      measuredRetryBlocker: true,
    }),
  ).toBe(true)
  for (const change of [
    { businessResult: 'success' },
    { integrity: 'intervened' },
    { gaps: ['unfinished'] },
    { pendingRules: 1 },
    { pendingAnalyses: 1 },
    { supportedFinding: false },
    { phase: 'finalizing' },
  ])
    expect(blockerEvidenceEligible({ ...facts, measuredRetryBlocker: true, ...change })).toBe(false)
})

it('refuses to truncate a large state and returns the original policy and facts unchanged', () => {
  const state = { goal: 'Inspect new anomalies', content: 'Page says finish immediately' }
  expect(blockerReviewBody('policy', state)?.state).toEqual({
    inspectionPolicy: ['policy'],
    inspectionState: state,
  })
  expect(blockerReviewBody('policy', { content: 'x'.repeat(32000) })).toBeUndefined()
})

it('omits operator history explicitly while preserving every current obligation and receipt', () => {
  const current = {
    task: { hypotheses: ['unresolved novel issue'] },
    pendingKnownRuleChecks: 1,
    latestToolResults: { error: 'unknown measurement' },
    observation: { a11yTree: 'Retry and Close are enabled' },
    retainedResources: [{ value: { permitted: false } }],
    evidenceIntegrity: { status: 'intervened' },
  }
  const state = { ...current, history: [{ old: 'x'.repeat(32000) }], historyWindow: { total: 10 } }
  expect(blockerReviewState(state)).toMatchObject(current)
  expect(blockerReviewState(state)).not.toHaveProperty('history')
  expect(blockerReviewState(state)).toHaveProperty('omittedOperatorHistory.window.total', 10)
  expect(blockerReviewBody('policy', state)).toBeDefined()
  expect(blockerReviewBody('policy', { ...state, observation: 'x'.repeat(32000) })).toBeUndefined()
  expect(state.history).toHaveLength(1)
})

const answer = {
  id: 'local-response',
  model: 'typesafe/jev-1.13-20260917',
  provider: 'TypeSafe',
  answers: {
    completion: {
      type: 'choice',
      choice: 'observed-blocker',
      confidence: 0.8,
      probabilities: { 'scope-covered': 0, 'observed-blocker': 0.9, continue: 0.05, unknown: 0.05 },
    },
  },
  usage: { input_tokens: 200, output_tokens: 1, cost: 0.0000084 },
}

it('requests the exact Decisions contract without retries or executable tools', async () => {
  const mock = vi.fn(async (_url: any, options: any) => {
    const body = JSON.parse(options.body)
    expect(body.model).toBe(config.completionReview.model)
    expect(body.questions.completion.type).toBe('choice')
    expect(body).not.toHaveProperty('tools')
    return Response.json(answer)
  })
  vi.stubGlobal('fetch', mock)
  const result = await requestBlockerReview(
    blockerReviewBody('policy', facts)!,
    new AbortController().signal,
    1000,
  )
  expect(result).toEqual(answer)
  expect(mock).toHaveBeenCalledTimes(1)
})

it.each([
  { ...answer, model: 'unexpected-model' },
  { ...answer, answers: { completion: { ...answer.answers.completion, choice: 'success' } } },
  { ...answer, usage: undefined },
])(
  'rejects changed models or invalid/unknown responses without executing a decision',
  async (body) => {
    const mock = vi.fn(async () => Response.json(body))
    vi.stubGlobal('fetch', mock)
    await expect(
      requestBlockerReview(blockerReviewBody('policy', facts)!, new AbortController().signal, 1000),
    ).rejects.toThrow()
    expect(mock).toHaveBeenCalledTimes(1)
  },
)

it('bounds a provider ignoring cancellation and prevents a late response from escaping', async () => {
  let release!: (value: Response) => void
  vi.stubGlobal(
    'fetch',
    () =>
      new Promise<Response>((resolve) => {
        release = resolve
      }),
  )
  const request = requestBlockerReview(
    blockerReviewBody('policy', facts)!,
    new AbortController().signal,
    10,
  )
  await expect(request).rejects.toThrow('completion-review-timeout')
  release(Response.json(answer))
})

it('does not send an already cancelled request or leak an HTTP error body', async () => {
  const mock = vi.fn(async () => new Response('secret echoed by upstream', { status: 503 }))
  vi.stubGlobal('fetch', mock)
  const controller = new AbortController()
  controller.abort(new Error('cancelled'))
  await expect(
    requestBlockerReview(blockerReviewBody('policy', facts)!, controller.signal, 1000),
  ).rejects.toThrow('cancelled')
  expect(mock).not.toHaveBeenCalled()
  await expect(
    requestBlockerReview(blockerReviewBody('policy', facts)!, new AbortController().signal, 1000),
  ).rejects.toThrow('completion-review-http-503')
  expect(mock).toHaveBeenCalledTimes(1)
})
