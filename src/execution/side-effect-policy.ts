import type { BusinessAdapter, RequestIntent, RequestShape } from '../business/adapters/types.ts'
import type { BusinessContractSnapshot } from '../business/types.ts'

/**
 * Side-effect authorization for one run.
 *
 * The policy is shared by every business: it asks the run's adapter what a request *is*, then
 * applies the contract's budget. There is no `if (profileId === 'export')` anywhere - a profile
 * changes behaviour only through its declared effects and prepare-write list.
 *
 * Two properties matter and are enforced structurally:
 *
 * 1. Budget is reserved *before* dispatch. If the counter moved only after a response arrived, two
 *    requests dispatched back to back could both pass the check, which is exactly the double-click
 *    and concurrent-duplicate case.
 * 2. Permission is decided from the request's origin, method and path - never from button wording
 *    or an action's stated intent. A control labelled "Retry" grants nothing by itself.
 */
export interface SideEffectDecision {
  readonly kind: 'allow' | 'deny'
  readonly reason?: string
  readonly intent: RequestIntent
}

export interface SideEffectPolicy {
  authorize(request: RequestShape): SideEffectDecision
  setReadOnly(value: boolean): void
  readonly readOnly: boolean
  snapshot(): {
    readonly createsReserved: number
    readonly retriesReserved: number
    readonly deniedWrites: number
  }
}

export function createSideEffectPolicy(input: {
  contract: BusinessContractSnapshot
  adapter: BusinessAdapter
  /**
   * The run's persisted environment boundary, as an origin.
   *
   * For a run created with a contract this equals `contract.environment.publicOrigin`; a run
   * created before contracts were persisted has only its recorded entry URL, and that is the
   * boundary it actually launched against. Passing it explicitly keeps the check anchored to the
   * boundary the run was created with instead of to whatever the registry resolves today.
   */
  publicOrigin?: string
}): SideEffectPolicy {
  const { contract, adapter } = input
  const boundaryOrigin = input.publicOrigin ?? contract.environment.publicOrigin
  let createsReserved = 0
  let retriesReserved = 0
  const retriesByOperation = new Map<string, number>()
  let readOnly = false
  let deniedWrites = 0

  const deny = (reason: string, intent: RequestIntent): SideEffectDecision => {
    deniedWrites++
    return { kind: 'deny', reason, intent }
  }

  return {
    authorize(request) {
      const intent = adapter.classifyRequest(request)
      // A request to another origin is never this business's write, whatever it looks like.
      if (request.origin !== boundaryOrigin) return deny('outside-environment', intent)
      if (intent.kind === 'foreign') return deny('undeclared-write', intent)
      if (intent.kind === 'read') return { kind: 'allow', intent }
      // A read-only journey forbids every write, declared or not.
      if (readOnly) return deny('journey-read-only-boundary', intent)
      switch (intent.kind) {
        case 'prepare': {
          // Preparation writes cost no create budget but are still refused once the entity exists,
          // because a real order has already been produced.
          if (createsReserved >= contract.effects.maxCreates)
            return deny('create-budget-exhausted', intent)
          return { kind: 'allow', intent }
        }
        case 'create': {
          if (createsReserved >= contract.effects.maxCreates)
            return deny('create-budget-exhausted', intent)
          createsReserved++
          return { kind: 'allow', intent }
        }
        case 'retry': {
          const used = retriesByOperation.get(intent.operationPath) ?? 0
          if (used >= contract.effects.maxRetriesPerOperation)
            return deny('retry-budget-exhausted', intent)
          // One entity per run: a retry of an entity other than the created one is over budget,
          // so a retry can never masquerade as a second create.
          if (
            contract.effects.maxRetriesPerOperation > 0 &&
            retriesByOperation.size >= contract.effects.maxCreates &&
            used === 0
          )
            return deny('retry-budget-exhausted', intent)
          retriesByOperation.set(intent.operationPath, used + 1)
          retriesReserved++
          return { kind: 'allow', intent }
        }
        case 'other-write':
          // An undeclared write is refused by default rather than being counted as a create or
          // waved through.
          return deny('undeclared-write', intent)
      }
    },
    setReadOnly(value: boolean) {
      readOnly = value
    },
    get readOnly() {
      return readOnly
    },
    snapshot: () => ({
      createsReserved,
      retriesReserved,
      deniedWrites,
    }),
  }
}
