import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { checkTaskInput } from '../../execution/check-tasks/contract.ts'
import type { CheckScheduler } from '../../execution/check-tasks/scheduler.ts'

/** Same Mastra Agent/tool path as ordinary executor tools; no second agent framework. */
export function checkTaskTools(
  host: CheckScheduler,
  serial: <T>(name: string, fn: () => Promise<T>) => Promise<T>,
) {
  const invoke = <T>(name: string, operation: () => Promise<T>) =>
    serial(name, async () => {
      try {
        return await operation()
      } catch (error) {
        return { error: String(error) }
      }
    })
  return {
    check_task_submit: createTool({
      id: 'check_task_submit',
      description:
        'Delegate an independent anonymous exact-entry read-only element measurement. Up to TWO child tasks per run, concurrently, separate protected browsers. Return immediately; inspect status/wait later. No prerequisites/actions/models in v1 (set quota.actions/modelCalls=0). Public facts are context only. Child measurement NEVER clears parent selected/required obligations. deadlineAt must be <= the parent deadline in checkTasks input.',
      inputSchema: checkTaskInput,
      execute: (input) => invoke('check_task_submit', () => host.submit(input)),
    }),
    check_task_status: createTool({
      id: 'check_task_status',
      description: 'Read all delegated task states and original evidence receipts.',
      inputSchema: z.object({}).strict(),
      execute: () => invoke('check_task_status', async () => host.status()),
    }),
    check_task_wait: createTool({
      id: 'check_task_wait',
      description:
        'Wait up to 1000ms for children; returns still-running states when bounded wait expires.',
      inputSchema: z.object({ waitMs: z.number().int().min(0).max(1000) }).strict(),
      execute: (input) => invoke('check_task_wait', () => host.wait(input.waitMs)),
    }),
    check_task_cancel: createTool({
      id: 'check_task_cancel',
      description:
        'Cancel one delegated task; cancellation remains unfinished scope, never a pass.',
      inputSchema: z.object({ childTaskId: z.string() }).strict(),
      execute: (input) => invoke('check_task_cancel', async () => host.cancel(input.childTaskId)),
    }),
  }
}
