import { expect, it } from 'vitest'
import {
  completionCounterfactual,
  completionReviewSchema,
  withCompletionReview,
} from '../../scripts/experiments/completion-review.ts'

it('keeps all original facts and constraints while replacing execution with a non-executing choice', () => {
  const body = {
    messages: [
      { role: 'system', content: 'Keep unknown issues and protect evidence' },
      {
        role: 'user',
        content: JSON.stringify({
          hiddenInHistory: 'must stay',
          task: { hypotheses: [{ status: 'open' }] },
        }),
      },
    ],
    tools: [{ function: { name: 'page_act' } }],
  }
  const before = structuredClone(body)
  const review = withCompletionReview(body)
  expect(body).toEqual(before)
  expect(review.messages.slice(0, 2)).toEqual(body.messages)
  expect(review.tools.map((t: any) => t.function.name)).toEqual(['completion_review'])
  expect(review).not.toHaveProperty('parallel_tool_calls')
  expect(review.messages.at(-1).content).toContain(
    'continue/unknown must preserve open exploration',
  )
  expect(
    completionReviewSchema.safeParse({
      decision: 'unknown',
      basis: 'Missing facts',
      evidenceRefs: [],
    }).success,
  ).toBe(true)
  expect(
    completionReviewSchema.safeParse({ decision: 'success', basis: 'Empty gaps', evidenceRefs: [] })
      .success,
  ).toBe(false)
})

it('negative snapshots keep old findings but expose a safe dismissal, unresolved work or intervention', () => {
  const input = {
    observation: { elements: [], a11yTree: '', pageText: 'Offer' },
    latestToolResults: { index: 3 },
    submittedFindings: { items: [{ id: 'existing-valid' }] },
    task: { hypotheses: [] },
    activeHypotheses: [],
    finishReadiness: { applicableGaps: [] },
  }
  const body = { messages: [{ role: 'user', content: JSON.stringify(input) }] }
  for (const variant of ['dismissal', 'open-hypothesis', 'intervened'] as const) {
    const out = JSON.parse(completionCounterfactual(body, variant).messages[0].content)
    expect(out.submittedFindings).toEqual(input.submittedFindings)
    if (variant === 'dismissal')
      expect(out.observation.elements[0]).toMatchObject({
        tag: 'button',
        enabled: true,
        visible: true,
        blockedPoints: 0,
      })
    else expect(out.finishReadiness.applicableGaps).not.toHaveLength(0)
    expect(out).not.toHaveProperty('expectedDecision')
  }
  expect(JSON.parse(body.messages[0]!.content)).toEqual(input)
})
