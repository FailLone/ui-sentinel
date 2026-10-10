import { createHash, randomUUID } from 'node:crypto'
import {
  checkTaskInput,
  completed,
  terminal,
  type CheckTask,
  type CheckSnapshot,
  type CheckHandler,
  type CheckResources,
  type BudgetLease,
} from './contract.ts'
import type { createSharedCheckBudget } from './budget.ts'

export function createCheckScheduler(deps: {
  parentRunId: string
  contractHash: string
  signal: AbortSignal
  deadlineAt: number
  budget: ReturnType<typeof createSharedCheckBudget>
  admit: (task: CheckTask) => Promise<void>
  open: (
    task: CheckTask,
    signal: AbortSignal,
    lease: BudgetLease,
    progress: (message: string) => Promise<void>,
  ) => Promise<CheckResources>
  handler: CheckHandler
  validateResult: (task: CheckTask, result: NonNullable<CheckSnapshot['result']>) => Promise<void>
  emit: (type: string, snapshot: CheckSnapshot) => Promise<void>
}) {
  const entries = new Map<
    string,
    {
      snapshot: CheckSnapshot
      controller: AbortController
      done: Promise<void>
      accepted: Promise<void>
    }
  >()
  let sealed = false
  let fatal: unknown
  const clone = (s: CheckSnapshot) => structuredClone(s)
  const guard = () => {
    deps.signal.throwIfAborted()
    if (sealed || Date.now() >= deps.deadlineAt) throw Error('check-dispatch-closed')
    if (fatal) throw fatal
  }
  const abort = () => {
    for (const e of entries.values())
      if (!terminal(e.snapshot.status)) e.controller.abort(deps.signal.reason)
  }
  deps.signal.addEventListener('abort', abort, { once: true })
  const emit = async (type: string, snapshot: CheckSnapshot) => {
    try {
      await deps.emit(type, clone(snapshot))
    } catch (error) {
      fatal = error
      throw error
    }
  }
  async function submit(raw: unknown) {
    guard()
    const input = checkTaskInput.parse(raw)
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    const prior = entries.get(input.key)
    if (prior) {
      if (prior.snapshot.task.taskHash !== hash) throw Error('check-idempotency-conflict')
      await prior.accepted
      return clone(prior.snapshot)
    }
    if (entries.size >= 2) throw Error('check-child-limit')
    if (input.deadlineAt > deps.deadlineAt || input.deadlineAt <= Date.now())
      throw Error('check-deadline-invalid')
    const task: CheckTask = {
      ...input,
      parentRunId: deps.parentRunId,
      childTaskId: randomUUID(),
      taskHash: hash,
      contractHash: deps.contractHash,
    }
    const lease = deps.budget.reserve(input.quota)
    const controller = new AbortController()
    const snapshot: CheckSnapshot = {
      task,
      status: 'queued',
      ...(task.kind === 'popup-viewport'
        ? {
            execution: {
              runId: `check-${task.childTaskId}`,
              reportUrl: `/api/runs/check-${task.childTaskId}/report`,
            },
          }
        : {}),
      acceptedAt: Date.now(),
      usage: { ...lease.usage(), elapsedMs: 0 },
    }
    let accepted!: () => void
    let rejectAcceptance!: (error: unknown) => void
    const acceptance = new Promise<void>((resolve, reject) => {
      accepted = resolve
      rejectAcceptance = reject
    })
    const entry = { snapshot, controller, done: Promise.resolve(), accepted: acceptance }
    // Own the slot BEFORE asynchronous admission/persistence; simultaneous submissions cannot overbook.
    entries.set(input.key, entry)
    const taskGuard = () => {
      controller.signal.throwIfAborted()
      if (Date.now() >= task.deadlineAt) throw Error('check-deadline-exceeded')
    }
    // done owns admission, execution AND cleanup, including cancellation during preparation.
    entry.done = (async () => {
      let resources: CheckResources | undefined
      let result: CheckSnapshot['result']
      let endStatus: CheckSnapshot['status'] = 'failed'
      const timer = setTimeout(
        () => controller.abort(Error('check-deadline-exceeded')),
        Math.max(1, task.deadlineAt - Date.now()),
      )
      const progress = async (message: string) => {
        taskGuard()
        snapshot.progress = message.slice(0, 300)
        await emit('check-task:progress', snapshot)
      }
      try {
        await emit('check-task:submitted', snapshot)
        await deps.admit(task)
        guard()
        taskGuard()
        await emit('check-task:accepted', snapshot)
        guard()
        taskGuard()
        accepted()
        snapshot.status = 'running'
        snapshot.startedAt = Date.now()
        await emit('check-task:started', snapshot)
        taskGuard()
        resources = await deps.open(task, controller.signal, lease, progress)
        taskGuard()
        result = await deps.handler(task, resources)
        taskGuard()
        await deps.validateResult(task, result)
        taskGuard()
        if (
          (result.status === 'completed' || result.status === 'defect') &&
          (result.unchecked.length || !result.measurements.length || !result.evidenceRefs.length)
        )
          throw Error('check-result-incomplete')
        endStatus = result.status
      } catch (error) {
        rejectAcceptance(error)
        endStatus = controller.signal.aborted ? 'cancelled' : 'failed'
        snapshot.error = String(error)
        result = undefined
      } finally {
        try {
          await resources?.close()
        } catch (error) {
          endStatus = 'failed'
          snapshot.error = `check-close-failed:${String(error)}`
          result = undefined
        }
        if (controller.signal.aborted) {
          endStatus = 'cancelled'
          result = undefined
        }
        clearTimeout(timer)
        lease.release()
        snapshot.evidenceRefs = resources?.evidenceRefs?.() ?? result?.evidenceRefs ?? []
        snapshot.endedAt = Date.now()
        snapshot.usage = {
          ...lease.usage(),
          elapsedMs: snapshot.endedAt - (snapshot.startedAt ?? snapshot.acceptedAt),
        }
        snapshot.status = endStatus
        snapshot.result = result
        await emit('check-task:terminal', snapshot)
      }
    })().catch((error) => {
      fatal = error
      rejectAcceptance(error)
    })
    await acceptance
    return clone(snapshot)
  }
  const status = () => [...entries.values()].map((e) => clone(e.snapshot))
  return {
    submit,
    status,
    gaps: () =>
      status()
        .filter((s) => !completed(s))
        .map(
          (s) =>
            `${s.task.childTaskId}:${s.status}:${s.result?.unchecked.join(',') || s.error || s.task.purpose}`,
        ),
    async wait(waitMs: number) {
      let timer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        Promise.all([...entries.values()].map((e) => e.done)),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, Math.min(1000, Math.max(0, waitMs)))
        }),
      ])
      if (timer) clearTimeout(timer)
      if (fatal) throw fatal
      return status()
    },
    cancel(childTaskId: string) {
      const e = [...entries.values()].find((e) => e.snapshot.task.childTaskId === childTaskId)
      if (!e) throw Error('check-task-not-found')
      if (!terminal(e.snapshot.status)) e.controller.abort(Error('child-cancelled'))
      return clone(e.snapshot)
    },
    async close() {
      sealed = true
      for (const e of entries.values())
        if (!terminal(e.snapshot.status)) e.controller.abort(Error('parent-ended'))
      await Promise.all([...entries.values()].map((e) => e.done))
      deps.signal.removeEventListener('abort', abort)
      if (fatal) throw fatal
    },
  }
}
export type CheckScheduler = ReturnType<typeof createCheckScheduler>
