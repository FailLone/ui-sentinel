import {
  runOriginalPopup,
  verifyOriginalResult,
  type OriginalExecutor,
} from './original-executor.ts'
import { config } from '../../shared/config.ts'
import { popupConfiguration } from '../../agent/popup/provider.ts'
import { hasInjectedPopupDecision } from '../../agent/popup/contract.ts'
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
  executeOriginal?: OriginalExecutor
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
      // Only the original popup executor may consume action/model reservations.
      if (task.kind === 'popup-viewport') {
        if (
          !deps.contract.popupCheck ||
          !config.features.popupCheck ||
          !deps.executeOriginal ||
          (!hasInjectedPopupDecision() && !popupConfiguration())
        )
          throw Error('check-popup-unavailable')
        if (
          task.permissions.actions !== 'local-ui' ||
          task.quota.actions < 1 ||
          task.quota.modelCalls < 1
        )
          throw Error('check-popup-quota-required')
      } else if (
        !task.target ||
        task.permissions.actions !== 'none' ||
        task.quota.actions ||
        task.quota.modelCalls
      )
        throw Error('check-v1-read-only')
      if (task.evidenceRefs.length) await checkEvidence(task, task.evidenceRefs, false)
    },
    open: async (task, signal, budget, progress) =>
      task.kind === 'popup-viewport'
        ? {
            signal,
            budget,
            progress,
            measure: async () => {
              throw Error('original-executor-owns-measurement')
            },
            close: async () => {},
          }
        : openCheckResources({
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
    handler: (task, resources) =>
      task.kind === 'popup-viewport'
        ? runOriginalPopup({
            task,
            signal: resources.signal,
            lease: resources.budget,
            progress: resources.progress,
            networkBudget,
            contract: deps.contract,
            execute: deps.executeOriginal!,
          })
        : measurementHandler(task, resources),
    validateResult: async (task, result) => {
      if (task.kind === 'popup-viewport') {
        await checkEvidence(task, result.evidenceRefs)
        await verifyOriginalResult(task, result)
      } else await validateCheckResult(task, result)
    },
    emit: async (type, snapshot) => {
      await appendEvent(
        deps.runId,
        type,
        { snapshot },
        { evidenceRefs: snapshot.evidenceRefs ?? snapshot.result?.evidenceRefs },
      )
    },
  })
  return Object.assign(scheduler, { networkBudget, held: budget.held })
}
