/** Offline only. Caller facts are declarations, never inferred permissions or measured outcomes. */
import { z } from 'zod'
import {
  parseExplorationInput,
  type ExplorationInput,
} from '../../src/agent/decisions/exploration/contracts.ts'
import { rankCandidates } from '../../src/agent/decisions/exploration/ranking.ts'
import { compileInput } from '../../src/agent/decisions/jev-provider/compile.ts'
import { DEFAULT_PROFILE, sha256 } from '../../src/agent/decisions/jev-provider/profile.ts'

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)
const text = z.string().min(1).max(512)
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const gate = z.enum(['yes', 'no', 'unknown'])
const stateSchema = z
  .object({
    id,
    provenance: z
      .object({
        sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
        artifactSha256: digest,
        stateRef: text,
        decisionCutoff: text,
      })
      .strict(),
    input: z.unknown(),
    criticalInformationMissing: z.boolean(),
    facts: z
      .array(
        z
          .object({
            candidateId: text,
            obligationId: text,
            obligation: z.enum(['pending', 'completed', 'unknown']),
            required: z.boolean(),
            permission: gate,
            preconditions: gate,
            action: z.enum(['click', 'inspect']),
            estimatedMs: z.number().finite().nonnegative().nullable(),
            estimatedActionCostUsd: z.number().finite().nonnegative().nullable(),
            // Full relevant state identity, not an observation counter alone.
            lastCheckedState: text
              .refine((value) => {
                try {
                  const key = JSON.parse(value)
                  return (
                    Array.isArray(key) &&
                    key.length === 3 &&
                    key.every((v) => typeof v === 'string' && v.length > 0)
                  )
                } catch {
                  return false
                }
              }, 'expected-page-document-related-state-tuple')
              .nullable(),
            recheckReason: text.nullable(),
            evidenceRef: text,
          })
          .strict(),
      )
      .max(32),
  })
  .strict()
export const exportSchema = z
  .object({
    version: z.literal('r1-decision-pilot-input-1'),
    kind: z.enum(['r0-real-export', 'synthetic-wiring-only']),
    states: z.array(stateSchema).min(1).max(8),
  })
  .strict()
export type State = z.infer<typeof stateSchema>
export type Choice =
  | { kind: 'candidate'; candidateId: string; action: 'click' | 'inspect' }
  | { kind: 'handoff'; reason: string }
  | { kind: 'unmapped' }
export const stateKey = (input: ExplorationInput) =>
  JSON.stringify([input.state.pageId, input.state.documentVersion, input.state.relatedStateVersion])

export function prepareState(raw: unknown) {
  const state = stateSchema.parse(raw)
  const parsed = parseExplorationInput(state.input)
  if (!parsed.ok) throw new Error(`invalid-state:${state.id}:${parsed.detail}`)
  const input = structuredClone(parsed.value)
  input.state.cacheable = false
  if (
    new Set(state.facts.map((f) => f.candidateId)).size !== state.facts.length ||
    state.facts.length !== input.candidates.length ||
    state.facts.some((f) => !input.candidates.some((c) => c.id === f.candidateId))
  )
    throw new Error('facts-must-bind-exact-candidate-set')
  const key = stateKey(input)
  const excluded: { candidateId: string; reason: string }[] = []
  const initiallyEligible = new Set(rankCandidates(input).orderedCandidateIds)
  const eligible = input.candidates.filter((c) => {
    const f = state.facts.find((f) => f.candidateId === c.id)!
    const repeat = input.history.some(
      (h) =>
        h.targetKey === c.targetKey &&
        h.action === f.action &&
        h.beforeStateVersion === input.state.relatedStateVersion,
    )
    // Unknown outcomes count as attempts too; do not silently retry them.
    const repeatedWithoutReason = (repeat || f.lastCheckedState === key) && !f.recheckReason
    const completedWithoutReason =
      f.obligation === 'completed' &&
      !f.recheckReason &&
      (f.lastCheckedState === null || f.lastCheckedState === key)
    const reason = !initiallyEligible.has(c.id)
      ? 'not-executable'
      : !c.targetKey
        ? 'identity-unknown'
        : !c.allowedActions.includes(f.action)
          ? 'action-not-allowed'
          : f.permission !== 'yes'
            ? `permission-${f.permission}`
            : f.preconditions !== 'yes'
              ? `preconditions-${f.preconditions}`
              : f.obligation === 'unknown'
                ? 'obligation-unknown'
                : completedWithoutReason
                  ? 'completed-without-new-state-or-reason'
                  : repeatedWithoutReason
                    ? 'repeat-without-reason'
                    : f.estimatedMs === null || f.estimatedActionCostUsd === null
                      ? 'action-budget-unknown'
                      : f.estimatedMs > input.budget.remainingMs ||
                          input.budget.remainingCostUsd === null ||
                          f.estimatedActionCostUsd > input.budget.remainingCostUsd ||
                          input.budget.remainingActions < 1 ||
                          input.budget.remainingDecisions < 1 ||
                          input.budget.remainingMs <= 0
                        ? 'budget-insufficient'
                        : null
    if (reason) excluded.push({ candidateId: c.id, reason })
    return reason === null
  })
  const requiredUnknown = state.facts.some(
    (f) =>
      f.required &&
      (f.preconditions === 'unknown' || f.permission === 'unknown' || f.obligation === 'unknown'),
  )
  const informationMissing =
    state.criticalInformationMissing ||
    requiredUnknown ||
    (!eligible.length &&
      state.facts.some(
        (f) =>
          f.preconditions === 'unknown' || f.permission === 'unknown' || f.obligation === 'unknown',
      ))
  // An executable required obligation takes precedence in BOTH arms, including model scoring.
  const required = eligible.filter((c) => state.facts.find((f) => f.candidateId === c.id)!.required)
  const pool = required.length ? required : eligible
  for (const c of eligible)
    if (!pool.includes(c)) excluded.push({ candidateId: c.id, reason: 'required-first-deferred' })
  input.candidates = pool.map((c) => {
    const f = state.facts.find((f) => f.candidateId === c.id)!
    return {
      ...c,
      allowedActions: [f.action],
      context:
        c.context +
        '\nPublic inspection facts: ' +
        JSON.stringify({
          obligationId: f.obligationId,
          obligation: f.obligation,
          recheckReason: f.recheckReason,
        }),
    }
  })
  input.scope.executableCandidateIds = pool.map((c) => c.id)
  const ranked = rankCandidates(input)
  const choice: Choice = informationMissing
    ? { kind: 'handoff', reason: 'insufficient-information' }
    : !pool.length
      ? { kind: 'handoff', reason: 'no-eligible-candidates' }
      : {
          kind: 'candidate',
          candidateId: ranked.orderedCandidateIds[0],
          action: input.candidates.find((c) => c.id === ranked.orderedCandidateIds[0])!
            .allowedActions[0],
        }
  let request: ReturnType<typeof compileInput>['compiled'] | null = null
  let requestBlocker: string | null = null
  if (choice.kind === 'candidate' && pool.length > 1) {
    try {
      request = compileInput(input, DEFAULT_PROFILE).compiled
    } catch {
      requestBlocker = 'provider-input-limit-or-contract'
    }
  }
  return {
    id: state.id,
    stateKey: key,
    provenance: state.provenance,
    choice,
    observedCandidateIds: parsed.value.candidates.map((c) => c.id),
    eligibleCandidateIds: ranked.orderedCandidateIds,
    excluded,
    jevDisposition:
      choice.kind === 'handoff'
        ? 'handoff-without-model'
        : pool.length === 1
          ? 'single-without-model'
          : request
            ? 'request-prepared'
            : 'request-blocked',
    requestBlocker,
    input,
    request,
  }
}
export function preparePilot(raw: unknown) {
  const data = exportSchema.parse(raw)
  if (new Set(data.states.map((s) => s.id)).size !== data.states.length)
    throw new Error('duplicate-state')
  return {
    version: 'r1-decision-pilot-prepared-1',
    kind: data.kind,
    inputSha256: sha256(JSON.stringify(data)),
    expectedStates: 8,
    completeExport: data.kind === 'r0-real-export' && data.states.length === 8,
    states: data.states.map(prepareState),
  }
}

const choiceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('candidate'),
      candidateId: text,
      action: z.enum(['click', 'inspect']),
    })
    .strict(),
  z.object({ kind: z.literal('handoff'), reason: text }).strict(),
  z.object({ kind: z.literal('unmapped') }).strict(),
])
export const labelsSchema = z
  .object({
    version: z.literal('r1-decision-pilot-labels-1'),
    inputSha256: digest,
    review: z.enum(['development-only', 'independently-reviewed']),
    reviewer: text,
    frozenAt: z.string().datetime(),
    cases: z
      .array(
        z
          .object({
            id,
            historicalChoice: choiceSchema,
            acceptableChoices: z.array(choiceSchema).min(1),
            advancesObligation: z.array(
              z.object({ candidateId: text, action: z.enum(['click', 'inspect']) }).strict(),
            ),
            unjustifiedRepeat: z.array(
              z.object({ candidateId: text, action: z.enum(['click', 'inspect']) }).strict(),
            ),
            missingPrerequisite: z.boolean(),
            handoffRequired: z.boolean(),
            acceptedHandoffReasons: z.array(text),
            rationale: text,
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict()
export function evaluateChoice(
  choice: Choice,
  label: z.infer<typeof labelsSchema>['cases'][number],
) {
  if (choice.kind === 'unmapped')
    return {
      acceptable: null,
      advancesObligation: null,
      unjustifiedRepeat: null,
      recognizesMissingPrerequisites: null,
      correctHandoff: null,
    }
  return {
    acceptable: label.acceptableChoices.some(
      (c) =>
        c.kind === choice.kind &&
        (c.kind === 'candidate' && choice.kind === 'candidate'
          ? c.candidateId === choice.candidateId && c.action === choice.action
          : c.kind === 'handoff' && choice.kind === 'handoff' && c.reason === choice.reason),
    ),
    advancesObligation:
      choice.kind === 'candidate' &&
      label.advancesObligation.some(
        (c) => c.candidateId === choice.candidateId && c.action === choice.action,
      ),
    unjustifiedRepeat:
      choice.kind === 'candidate' &&
      label.unjustifiedRepeat.some(
        (c) => c.candidateId === choice.candidateId && c.action === choice.action,
      ),
    recognizesMissingPrerequisites: label.missingPrerequisite
      ? choice.kind === 'handoff' && choice.reason === 'insufficient-information'
      : null,
    correctHandoff: label.handoffRequired
      ? choice.kind === 'handoff' && label.acceptedHandoffReasons.includes(choice.reason)
      : choice.kind !== 'handoff',
  }
}
export function evaluatePrepared(prepared: ReturnType<typeof preparePilot>, raw: unknown) {
  const labels = labelsSchema.parse(raw)
  if (
    labels.inputSha256 !== prepared.inputSha256 ||
    labels.cases.length !== prepared.states.length ||
    new Set(labels.cases.map((c) => c.id)).size !== labels.cases.length ||
    labels.cases.some((c) => !prepared.states.some((s) => s.id === c.id))
  )
    throw new Error('label-binding')
  return {
    review: labels.review,
    labelsSha256: sha256(JSON.stringify(labels)),
    frozenAt: labels.frozenAt,
    scope: 'static-choice-only',
    jev: 'not-run',
    states: prepared.states.map((s) => {
      const label = labels.cases.find((c) => c.id === s.id)!
      const references = [
        ...label.acceptableChoices.filter((c) => c.kind === 'candidate'),
        ...label.advancesObligation,
        ...label.unjustifiedRepeat,
      ]
      if (references.some((c) => !s.observedCandidateIds.includes(c.candidateId)))
        throw new Error('label-candidate-binding')
      return {
        id: s.id,
        historical: evaluateChoice(label.historicalChoice, label),
        program: evaluateChoice(s.choice, label),
      }
    }),
  }
}
