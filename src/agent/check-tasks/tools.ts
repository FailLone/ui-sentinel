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
        'Delegate up to TWO independent anonymous exact-entry checks concurrently. element-measurement is read-only (zero actions/models, permissions.actions=none). popup-viewport uses Jev selection and ORIGINAL executor clicks/measurements in its own Context (permissions.actions=local-ui; reserve 1..3 actions and 1..6 modelCalls). Requires parent popupCheck enabled. Return immediately; use status/wait/cancel. No prerequisites or nested children. deadlineAt <= parent checkTasks.deadlineAt. Child results never clear parent selected/required obligations.',
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
