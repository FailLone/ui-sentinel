import { randomUUID } from 'node:crypto'
import { abortable, outsideModelAttempt } from '../model-request.ts'
import type { EvidencePacket, EvidenceAnalysisResult } from './types.ts'

export interface RequestReservation {
  start(): void
  release(): void
}
export interface AnalysisTask {
  id: string
  runId: string
  parentTaskId: string
  dependsOn: string[]
  deadlineAt: number
  resourceAccess: 'frozen-evidence-read'
  snapshotId: string
  factVersion: string
  operationId: string | null
  question: string
  evidenceRefs: string[]
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  result?: EvidenceAnalysisResult
  error?: string
}

function immutable<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value)) immutable(child)
  }
  return value
}

/** One background analysis at a time; queued jobs consume reserved request budget. */
export function createEvidenceAnalysisQueue(options: {
  signal: AbortSignal
  reserve: () => RequestReservation
  execute: (
    packet: EvidencePacket,
    signal: AbortSignal,
    reservation: RequestReservation,
  ) => Promise<EvidenceAnalysisResult>
  event: (task: AnalysisTask) => Promise<void>
  maxPending?: number
}) {
  const local = new AbortController()
  const signal = AbortSignal.any([options.signal, local.signal])
  const tasks = new Map<string, AnalysisTask>()
  const completions = new Map<string, Promise<void>>()
  const consumed = new Set<string>()
  let tail: Promise<void> = Promise.resolve()
  let closed = false
  const snapshot = (task: AnalysisTask) => structuredClone(task)
  return {
    async enqueue(input: EvidencePacket) {
      signal.throwIfAborted()
      if (closed) throw Error('analysis-queue-closed')
      if (input.dependsOn.length)
        throw Error('analysis-dependencies-unsupported: submit independent frozen evidence tasks')
      const same = [...tasks.values()].find(
        (t) =>
          t.factVersion === input.factVersion &&
          t.operationId === input.operationId &&
          t.question === input.question &&
          t.status !== 'failed' &&
          t.status !== 'cancelled' &&
          t.result?.visual.coverage !== 'insufficient-evidence',
      )
      if (same) return { ...snapshot(same), reused: true }
      if (
        [...tasks.values()].filter((t) => t.status === 'queued' || t.status === 'running').length >=
        (options.maxPending ?? 2)
      )
        throw Error('analysis-backpressure: consume existing tasks before requesting more')
      const reservation = options.reserve()
      const packet = immutable(structuredClone(input))
      const task: AnalysisTask = {
        id: `analysis-${randomUUID()}`,
        runId: packet.runId,
        parentTaskId: packet.parentTaskId,
        dependsOn: [...packet.dependsOn],
        deadlineAt: packet.deadlineAt,
        resourceAccess: 'frozen-evidence-read',
        snapshotId: packet.snapshotId,
        factVersion: packet.factVersion,
        operationId: packet.operationId,
        question: packet.question,
        evidenceRefs: [...packet.evidenceRefs],
        status: 'queued',
      }
      tasks.set(task.id, task)
      try {
        await options.event(snapshot(task))
      } catch (error) {
        tasks.delete(task.id)
        reservation.release()
        throw error
      }
      const work = outsideModelAttempt(() =>
        tail.then(async () => {
          try {
            signal.throwIfAborted()
            task.status = 'running'
            await options.event(snapshot(task))
            const remaining = task.deadlineAt - Date.now()
            if (remaining <= 0) throw Error('analysis-deadline-exceeded')
            const taskSignal = AbortSignal.any([signal, AbortSignal.timeout(remaining)])
            const result = await abortable(
              taskSignal,
              options.execute(packet, taskSignal, reservation),
            )
            signal.throwIfAborted()
            task.result = structuredClone(result)
            task.status = 'completed'
          } catch (error) {
            task.status = signal.aborted ? 'cancelled' : 'failed'
            task.error = String(error instanceof Error ? error.message : error)
          } finally {
            reservation.release()
            await options.event(snapshot(task))
          }
        }),
      )
      tail = work.catch(() => {})
      completions.set(task.id, work)
      return snapshot(task)
    },
    async waitAll() {
      await Promise.all(completions.values())
    },
    consume() {
      const ready = [...tasks.values()].filter(
        (t) => !['queued', 'running'].includes(t.status) && !consumed.has(t.id),
      )
      for (const t of ready) consumed.add(t.id)
      return ready.map(snapshot)
    },
    snapshot: () => [...tasks.values()].map(snapshot),
    pending: () =>
      [...tasks.values()].filter((t) => ['queued', 'running'].includes(t.status)).map((t) => t.id),
    async close() {
      closed = true
      local.abort(Error('analysis-run-ended'))
      await Promise.all(completions.values())
    },
  }
}
