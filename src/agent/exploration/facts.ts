/**
 * Fact intake for the R1 exploration planner (`r1-exploration-plan-1`).
 *
 * This module consumes ONLY facts handed in by the caller. It does not operate a browser, read
 * files or environment variables, contact any model, grant permission, or mark anything verified.
 * It reuses the existing `r1-exploration-input-1` contract rather than declaring a second one, so
 * a state that is invalid for scoring is invalid for planning for exactly the same reasons.
 */
import { z } from 'zod'
import { parseExplorationInput, type ExplorationInput } from '../decisions/exploration/contracts.ts'

/**
 * Declared view / role context. `roleLabel` is a label the caller observed on the page, never a
 * permission: nothing in this module may treat it as authority.
 */
export const viewContextSchema = z
  .object({
    kind: z.enum(['anonymous', 'declared']),
    roleLabel: z.string().max(128).nullable(),
    source: z.string().max(256),
    viewKey: z.string().min(1).max(128),
  })
  .strict()

export type ViewContext = z.infer<typeof viewContextSchema>

export type PlanningFacts = {
  readonly input: ExplorationInput
  readonly view: ViewContext
}

/** Untrusted facts as they arrive. They are parsed, never trusted. */
export type RawPlanningFacts = Record<string, unknown>

/**
 * The typed shape a caller assembles before handing facts over: exactly a valid exploration input
 * plus the declared view context. Callers (including the later S4 bridge) build this; the planner
 * still re-validates it because it does not trust its caller.
 */
export type PlanningFactsDraft = ExplorationInput & { readonly view: ViewContext }

export type FactsAcceptance = { readonly ok: true; readonly value: PlanningFacts }
export type FactsRejection = { readonly ok: false; readonly reason: string }

/**
 * Normalize untrusted caller facts. A rejection is a structured result, never a throw: the caller
 * must be able to record why no plan was produced.
 */
export function normalizeFacts(raw: unknown): FactsAcceptance | FactsRejection {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, reason: 'facts-invalid' }

  // The exploration input contract is `.strict()`, so the planner's own `view` field is split off
  // into a shallow copy before delegating. The caller's object is never mutated.
  const { view: rawView, ...inputPortion } = raw as RawPlanningFacts
  const parsed = parseExplorationInput(inputPortion)
  if (!parsed.ok) return { ok: false, reason: parsed.detail }

  const view = viewContextSchema.safeParse(rawView)
  if (!view.success) return { ok: false, reason: 'view-context-invalid' }

  return { ok: true, value: { input: parsed.value, view: view.data } }
}