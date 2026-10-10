import { z } from 'zod'

export const quotaSchema = z
  .object({
    actions: z.number().int().min(0).max(3),
    modelCalls: z.number().int().min(0).max(6),
    reads: z.number().int().min(1).max(2),
  })
  .strict()
export const checkTaskInput = z
  .object({
    version: z.literal(1),
    key: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    kind: z.enum(['element-measurement', 'popup-viewport']),
    purpose: z.string().trim().min(1).max(1000),
    target: z
      .object({ selector: z.string().min(1).max(500) })
      .strict()
      .optional(),
    start: z
      .object({
        url: z.string().url().max(4096),
        viewport: z
          .object({
            width: z.number().int().min(320).max(2560),
            height: z.number().int().min(240).max(2160),
          })
          .strict(),
        prerequisites: z.array(z.never()).max(0),
      })
      .strict(),
    publicFacts: z.array(z.string().max(1000)).max(8),
    evidenceRefs: z.array(z.string().max(128)).max(12),
    source: z
      .object({ actionId: z.string().max(128).optional(), itemId: z.string().max(128).optional() })
      .strict()
      .optional(),
    permissions: z
      .object({
        session: z.literal('anonymous'),
        writes: z.literal('none'),
        actions: z.enum(['none', 'local-ui']),
      })
      .strict(),
    quota: quotaSchema,
    deadlineAt: z.number().int().positive(),
  })
  .strict()
export type CheckTaskInput = z.infer<typeof checkTaskInput>
export type Quota = z.infer<typeof quotaSchema>
export type TaskStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'defect'
  | 'unverified'
  | 'failed'
  | 'cancelled'
export interface CheckTask extends CheckTaskInput {
  parentRunId: string
  childTaskId: string
  taskHash: string
  contractHash: string
}
export interface MeasurementReceipt {
  measurementId: string
  childTaskId: string
  taskHash: string
  actionId?: string
  itemId?: string
  measuredAt: number
  verified: boolean
  evidenceRefs: string[]
  value: unknown
}
export interface CheckResult {
  original?: Awaited<ReturnType<typeof import('./original-executor.ts').readOriginalChild>>
  status: 'completed' | 'defect' | 'unverified'
  evidenceRefs: string[]
  measurements: MeasurementReceipt[]
  unchecked: string[]
}
export interface CheckSnapshot {
  task: CheckTask
  status: TaskStatus
  acceptedAt: number
  startedAt?: number
  endedAt?: number
  execution?: { runId: string; reportUrl: string }
  progress?: string
  result?: CheckResult
  evidenceRefs?: string[]
  error?: string
  usage: Quota & { elapsedMs: number }
}
export interface BudgetLease {
  consume(kind: keyof Quota, amount?: number): void
  usage(): Quota
  release(): void
}
export interface CheckResources {
  signal: AbortSignal
  budget: BudgetLease
  measure(selector: string): Promise<MeasurementReceipt>
  progress(message: string): Promise<void>
  evidenceRefs?(): string[]
  close(): Promise<void>
}
export type CheckHandler = (task: CheckTask, resources: CheckResources) => Promise<CheckResult>
export const terminal = (status: TaskStatus) => status !== 'queued' && status !== 'running'
export const completed = (s: CheckSnapshot) =>
  (s.status === 'completed' || s.status === 'defect') &&
  !!s.result &&
  s.result.status === s.status &&
  s.result.unchecked.length === 0 &&
  s.result.evidenceRefs.length > 0 &&
  s.result.measurements.length > 0 &&
  s.result.measurements.every(
    (m) => m.verified && m.childTaskId === s.task.childTaskId && m.taskHash === s.task.taskHash,
  )
