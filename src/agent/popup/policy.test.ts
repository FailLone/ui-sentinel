import { it, expect } from 'vitest'
import { choices, wireQuestion, type PopupQuestion } from './contract.ts'
import { normalizePopupResponse } from './provider.ts'
import { adoptPopupSuggestion } from './policy.ts'
const packet: PopupQuestion = {
  revision: 'popup-semantic-2',
  stage: 'entry',
  binding: 'b',
  goal: 'panel',
  candidates: [{ id: 'details', description: 'Details' }],
  evidenceRefs: [],
  missing: [],
  attempts: [],
}
function raw(probabilities: Record<string, number>, confidence: number, choice = 'details') {
  return {
    id: 'synthetic',
    model: 'typesafe/jev-1.13-20260917',
    provider: 'TypeSafe',
    answers: { popup: { type: 'choice', choice, confidence, probabilities } },
  }
}
it('uses official Choice options for one semantic purpose, with a semantic no-match instead of control-flow alternatives', () => {
  for (const stage of ['entry', 'target'] as const) {
    const p = { ...packet, stage },
      q = JSON.parse(wireQuestion(p)).questions.popup
    expect(q).toMatchObject({ type: 'choice', criteria: choices(p) })
    expect(Object.keys(q.criteria)).toEqual(['details', 'none'])
    expect(q).not.toHaveProperty('choices')
    expect(q.instructions).toContain(
      stage === 'entry' ? 'need not guarantee a panel' : 'association only',
    )
  }
})
it('preserves official raw distribution, n and confidence; adopts a majority exploration without asserting success', () => {
  const answer = normalizePopupResponse(raw({ details: 0.82, none: 0.18 }, 0.64), packet)
  expect(answer).toEqual({
    binding: 'b',
    choice: 'details',
    confidence: 0.64,
    probabilities: { details: 0.82, none: 0.18 },
  })
  const decision = adoptPopupSuggestion(packet, answer)
  expect(decision).toMatchObject({
    policy: 'popup-purpose-policy-2',
    calibrated: false,
    purpose: 'entry-exploration',
    n: 2,
    accepted: true,
    reason: 'bounded-exploration-majority',
    raw: answer,
  })
  expect(adoptPopupSuggestion({ ...packet, stage: 'target' }, answer)).toMatchObject({
    accepted: false,
    raw: answer,
    proposal: { choice: 'handoff' },
  })
})
it('refuses ties, mere plurality, no-match, and low target confidence independently of reported high confidence', () => {
  const many = {
    ...packet,
    candidates: [...packet.candidates, { id: 'other', description: 'Other' }],
  }
  for (const stage of ['entry', 'target'] as const) {
    const p = { ...many, stage }
    expect(
      adoptPopupSuggestion(
        p,
        normalizePopupResponse(raw({ details: 0.4, other: 0.35, none: 0.25 }, 0.99), p),
      ).accepted,
    ).toBe(false)
    expect(
      adoptPopupSuggestion(
        p,
        normalizePopupResponse(raw({ details: 0.5, other: 0.5, none: 0 }, 0.99), p),
      ).reason,
    ).toBe('semantic-tie')
    expect(
      adoptPopupSuggestion(
        p,
        normalizePopupResponse(raw({ details: 0.1, other: 0.1, none: 0.8 }, 0.7, 'none'), p),
      ).reason,
    ).toBe('no-semantic-match')
  }
})
it('rejects omitted distributions, obsolete read options, unknown options, nonmax choices and invalid sums at the actual normalizer', () => {
  const valid = raw({ details: 0.9, none: 0.1 }, 0.8)
  for (const change of [
    { probabilities: undefined },
    { choice: 'read' },
    { probabilities: { details: 0.8, handoff: 0.2 } },
    { probabilities: { details: 0.1, none: 0.9 } },
    { probabilities: { details: 0.9, none: 0.9 } },
  ]) {
    expect(() =>
      normalizePopupResponse(
        { ...valid, answers: { popup: { ...valid.answers.popup, ...change } } },
        packet,
      ),
    ).toThrow()
  }
})
