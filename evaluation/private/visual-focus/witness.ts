import type { BindingWitness } from '../../../src/execution/binding-witness.ts'

/**
 * Private comparison of a binding witness against the intended target.
 *
 * The witness itself (its shape and the product-side capture) lives in `src/execution/binding-witness.ts`
 * so the running service never imports `evaluation/`. What is private is only the *truth* it is
 * compared against: the tag/type/id the target is supposed to have. Nothing on this side is reachable
 * from the arena, the server, the agent's tools or a model request.
 */
export { witnessFromElement, type BindingWitness } from '../../../src/execution/binding-witness.ts'

/** The identity the private truth expects a probe to have bound. Not a selector the agent may see. */
export interface PrivateVisualTarget {
  readonly tag: string
  readonly type?: string
  readonly id?: string
  /**
   * The private CSS path, retained for documentation and for the real-browser witness test. It is NOT
   * compared against the witness (the witness carries the public path); it exists so a human can trace
   * which node the truth means. `assertNoPrivateSelectorLeak` keeps it out of the witness.
   */
  readonly selector: string
}

export interface WitnessComparison {
  readonly ok: boolean
  readonly reasons: readonly string[]
}

/**
 * Compare a witness against the private target.
 *
 * Identity is decided on the node's own public facts, never on its bounding box: two same-sized inputs
 * on one page are exactly the case a bbox comparison would wave through. The id is required when the
 * target names one - if the bound node has no id there is nothing to tie it to the target, and the plan
 * says an identity that cannot be uniquely resolved fails rather than passes.
 */
export function compareWitnessToTarget(
  witness: BindingWitness,
  target: PrivateVisualTarget,
): WitnessComparison {
  const reasons: string[] = []
  if (witness.native.tag.toLowerCase() !== target.tag.toLowerCase())
    reasons.push('witness-tag-mismatch')
  const witnessType = (witness.native.type ?? 'text').toLowerCase()
  const targetType = (target.type ?? 'text').toLowerCase()
  if (witnessType !== targetType) reasons.push('witness-type-mismatch')
  if (target.id !== undefined && witness.native.id !== target.id)
    reasons.push('witness-id-mismatch')
  return { ok: reasons.length === 0, reasons }
}

/**
 * Guard: the private selector path must never appear inside a persisted witness.
 *
 * The witness is the one artifact that could leak the mapping if it echoed the selector it was looked
 * up by; it records the public path instead. A test asserts this for every case.
 */
export function assertNoPrivateSelectorLeak(
  witness: BindingWitness,
  targets: readonly PrivateVisualTarget[],
): void {
  const serialized = JSON.stringify(witness)
  for (const target of targets) {
    if (target.selector && serialized.includes(target.selector))
      throw new Error(`binding-witness leaks the private selector ${target.selector}`)
  }
}
