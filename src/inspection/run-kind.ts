import type { BusinessContractSnapshot } from '../business/types.ts'
import type { BusinessResult, RunSpec } from '../shared/types.ts'
import { verifyUiContractSnapshot, type UiContractSnapshot } from './contract.ts'

/**
 * What kind of run a persisted spec describes (plan 3.1, 11.1).
 *
 * This is the single place the discrimination lives, so the executor, the report and the completion
 * verifier cannot each invent their own reading. Two rules it exists to enforce:
 *
 * - Absence is not a new meaning. A spec with no `kind` and no contract is a *legacy business run*,
 *   resolved under the old rules, never re-read as a UI scan.
 * - The two contracts are mutually exclusive. A spec that carries both is invalid rather than one of
 *   them winning, because either choice would grant permissions the caller asked for in the other.
 */
export type RunKind = 'ui-scan' | 'business'

export type ResolvedRunKind =
  | { readonly kind: 'ui-scan'; readonly contract: UiContractSnapshot }
  | {
      readonly kind: 'business'
      readonly contract: BusinessContractSnapshot | undefined
      /** True when the run predates persisted contracts: old protocol, no invented requirements. */
      readonly legacyUnversioned: boolean
    }
  | {
      readonly kind: 'invalid'
      readonly reasonCode:
        | 'mixed-contract'
        | 'ui-contract-missing'
        | 'ui-contract-hash-mismatch'
        | 'unknown-kind'
      readonly message: string
    }

/**
 * A persisted spec, or any projection of one that kept its kind-bearing fields. Both contracts are
 * optional because a record written before either existed must still be readable.
 */
type KindBearingSpec = Pick<RunSpec, 'kind' | 'businessContract' | 'uiContract'> & RunSpec

function invalid(
  reasonCode: Extract<ResolvedRunKind, { kind: 'invalid' }>['reasonCode'],
  message: string,
): ResolvedRunKind {
  return { kind: 'invalid', reasonCode, message }
}

export function resolveRunKind(spec: KindBearingSpec): ResolvedRunKind {
  const declared = spec.kind
  const hasUi = spec.uiContract !== undefined && spec.uiContract !== null
  const hasBusiness = spec.businessContract !== undefined && spec.businessContract !== null

  if (declared !== undefined && declared !== 'ui-scan' && declared !== 'business')
    return invalid('unknown-kind', `Unknown run kind: ${String(declared)}`)

  if (declared === 'ui-scan') {
    // A UI contract and a business contract are alternatives, never a pair; either one winning
    // would silently drop the other's permissions.
    if (hasBusiness)
      return invalid('mixed-contract', 'A ui-scan run cannot carry a business contract.')
    if (!hasUi) return invalid('ui-contract-missing', 'A ui-scan run requires its UI contract.')
    const contract = spec.uiContract as UiContractSnapshot
    if (!verifyUiContractSnapshot(contract))
      return invalid(
        'ui-contract-hash-mismatch',
        'The persisted UI contract does not match its hash.',
      )
    return { kind: 'ui-scan', contract }
  }

  if (declared === 'business') {
    if (hasUi) return invalid('mixed-contract', 'A business run cannot carry a UI contract.')
    return {
      kind: 'business',
      contract: spec.businessContract,
      legacyUnversioned: !hasBusiness,
    }
  }

  // No `kind` at all. The only records in this shape are pre-kind business runs. A UI contract
  // present without the discriminant is a corrupt record, not an upgrade.
  if (hasUi)
    return invalid('mixed-contract', 'A run without an explicit kind cannot carry a UI contract.')
  return { kind: 'business', contract: spec.businessContract, legacyUnversioned: !hasBusiness }
}

/**
 * Which business results a kind may record.
 *
 * `not-applicable` is reserved for a UI scan, and the converse is just as important: a business run
 * that finds no adapter does not become not-applicable, and a UI scan never claims a business
 * outcome it had no adapter to verify.
 */
export function businessResultAllowed(kind: RunKind, result: BusinessResult): boolean {
  if (kind === 'ui-scan') return result === 'not-applicable'
  return result !== 'not-applicable'
}
