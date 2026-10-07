import { createBudgetLedger, type BudgetLedgerInput } from '../exploration/budget.ts'
import { createScoreCache } from '../exploration/cache.ts'
import { parseExplorationInput } from '../exploration/contracts.ts'
import { createExplorationSession, type ExplorationSession } from '../exploration/session.ts'
import { identityFor, profileSchema } from './profile.ts'
import { createJevTransport, type HttpOptions } from './http.ts'

/** Opt-in composition only: no production caller imports this module. */
export function createJevSession(
  options: HttpOptions & {
    budget: BudgetLedgerInput
    quoteUsd: number
    currentInput?: () => unknown
  },
): ExplorationSession & { settled(): Promise<void> } {
  const profile = profileSchema.parse(options.profile)
  if (!Number.isFinite(options.quoteUsd) || options.quoteUsd < 0) throw new Error('quote-required')
  const identity = identityFor(profile)
  const ledger = createBudgetLedger(options.budget)
  const cache = createScoreCache({ capacity: 64, ttlMs: 300000 })
  const pending = new Set<Promise<unknown>>()
  return {
    async settled() {
      await Promise.allSettled([...pending])
    },
    decide(input, decisionOptions) {
      const parsed = parseExplorationInput(input)
      const transport = createJevTransport({
        ...options,
        profile,
        maxInputBytes: parsed.ok ? parsed.value.limits.maxInputBytes : 32768,
      })
      const session = createExplorationSession({
        ledger,
        cache,
        identity,
        billableTransport: true,
        estimatedRequestCostUsd: options.quoteUsd,
        currentInput: options.currentInput ?? (() => input),
        send: (request, context) => {
          const operation = transport(request, context)
          pending.add(operation)
          void operation.then(
            () => pending.delete(operation),
            () => pending.delete(operation),
          )
          return operation
        },
      })
      return session.decide(input, decisionOptions)
    },
    stats() {
      return { ledger: ledger.snapshot(), cache: cache.stats() }
    },
  }
}
