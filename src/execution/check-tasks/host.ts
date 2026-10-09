import { createSharedNetworkBudget } from '../network/shared-budget.ts'
import { DEFAULT_LIMITS } from '../network/session.ts'
import type { UiContractSnapshot } from '../../inspection/contract.ts'
import { appendEvent } from '../run-manager.ts'
import {
  checkEvidence,
  openCheckResources,
  measurementHandler,
  validateCheckResult,
} from './resources.ts'
import { createSharedCheckBudget } from './budget.ts'
import { createCheckScheduler } from './scheduler.ts'

export const parallelChecksEnabled = () => process.env.EXECUTION_PARALLEL_CHECK_TASKS === '1'
export function createProductCheckHost(deps: {
  runId: string
  contract: UiContractSnapshot
  signal: AbortSignal
  deadlineAt: number
  usage: { actions: number; modelCalls: number }
}) {
  const networkBudget = createSharedNetworkBudget(DEFAULT_LIMITS)
  let reads = 0
  const budget = createSharedCheckBudget({
    remaining: () => ({
      actions: deps.contract.budget.maxActions - deps.usage.actions,
      modelCalls: deps.contract.budget.maxModelCalls - deps.usage.modelCalls,
      reads: 4 - reads,
    }),
    charge: (kind, amount) => {
      if (kind === 'reads') reads += amount
      else deps.usage[kind] += amount
    },
  })
  const scheduler = createCheckScheduler({
    parentRunId: deps.runId,
    contractHash: deps.contract.hash,
    signal: deps.signal,
    deadlineAt: deps.deadlineAt,
    budget,
    async admit(task) {
      if (task.start.url !== deps.contract.entryUrl)
        throw Error('check-reentry-url-must-match-parent')
      // Until original action/Jev adapters are integrated, no child can reserve or spend these permissions.
      if (task.quota.actions || task.quota.modelCalls) throw Error('check-v1-read-only')
      if (task.evidenceRefs.length) await checkEvidence(task, task.evidenceRefs, false)
    },
    open: (task, signal, budget, progress) =>
      openCheckResources({
        task,
        contract: deps.contract,
        networkBudget,
        signal,
        budget,
        progress,
        emit: async (type, payload, refs) => {
          await appendEvent(deps.runId, type, payload, { evidenceRefs: refs })
        },
      }),
    handler: measurementHandler,
    validateResult: validateCheckResult,
    emit: async (type, snapshot) => {
      await appendEvent(
        deps.runId,
        type,
        { snapshot },
        { evidenceRefs: snapshot.evidenceRefs ?? snapshot.result?.evidenceRefs },
      )
    },
  })
  return Object.assign(scheduler, { networkBudget })
}
