import { randomBytes } from 'node:crypto'

/**
 * Private business truth for the dataset-export arena.
 *
 * The variant decides what happens *behind* the public protocol. Nothing here is exported to the
 * browser: the page learns only what a public response carries, and the variant id never appears in
 * a job id, a URL, a response body or a published bundle. That separation is what makes a variant
 * finding meaningful - an agent cannot read the answer, it can only observe behaviour.
 */
export type VariantId = 'E0' | 'E1' | 'E2' | 'E3' | 'E4'

export const DATASETS = Object.freeze([
  Object.freeze({ id: 'orders-q3', name: 'Orders (Q3)' }),
  Object.freeze({ id: 'customers', name: 'Customers' }),
  Object.freeze({ id: 'inventory', name: 'Inventory' }),
])

export const FORMATS = Object.freeze([
  Object.freeze({ id: 'csv', name: 'CSV' }),
  Object.freeze({ id: 'json', name: 'JSON' }),
])

export interface ExportArtifact {
  readonly datasetId: string
  readonly format: string
  readonly rows: readonly string[]
}

export interface ExportJob {
  readonly jobId: string
  readonly attempt: number
  phase: 'processing' | 'succeeded' | 'rejected' | 'failed'
  readonly notice: string | null
  readonly retry: {
    readonly permitted: boolean
    readonly remaining: number
    readonly afterMs: number
    readonly prerequisitesMet: boolean
  }
  readonly datasetId: string
  readonly format: string
  /** The published recovery prerequisite for *this* job. E2 publishes the ineligible one. */
  readonly recoveryPrerequisite: RecoveryPrerequisite
}

/**
 * The published prerequisite for recovering a failed export.
 *
 * This is the eligibility source, and it exists so that recovery eligibility is a *public
 * business resource* rather than a client-side guess or a backend refusal. Making recovery
 * ineligible means publishing the unmet prerequisite; the retry endpoint still accepts the
 * request, so the defect lives entirely in what the workspace is told and how it acts on it.
 * There is no variant flag here and nothing reads the variant to pick a behaviour.
 */
export interface RecoveryPrerequisite {
  readonly scope: string
  readonly note: string
  readonly met: boolean
}

export interface AuditEntry {
  readonly method: string
  readonly path: string
}

interface ArenaState {
  variant: VariantId
  jobs: Map<string, ExportJob>
  /** The job a run created. One create per run: a second is refused, not silently accepted. */
  createdJobId: string | null
  creates: number
  retries: number
  artifacts: ExportArtifact[]
  requests: AuditEntry[]
}

let state: ArenaState = fresh('E0')

function fresh(variant: VariantId): ArenaState {
  return {
    variant,
    jobs: new Map(),
    createdJobId: null,
    creates: 0,
    retries: 0,
    artifacts: [],
    requests: [],
  }
}

export function resetState(variant: VariantId): void {
  state = fresh(variant)
}

export function getVariant(): VariantId {
  return state.variant
}

/**
 * The only thing the browser may learn about a variant: which wording to use.
 *
 * E4 is E1's business with different presentation, so the page needs to know *that* much and
 * nothing more. Mapping the variant to a presentation label here - rather than exporting the
 * variant - is what keeps the id, the root cause and the expected finding out of the client.
 */
export function getPresentation(): 'default' | 'rewritten' {
  return state.variant === 'E4' ? 'rewritten' : 'default'
}

/**
 * Record one request the *browser* made.
 *
 * Called by the HTTP layer, not by the state functions: auditing inside them would count the
 * server's own internal reads too, and the point of the log is to show what the page actually did.
 */
export function audit(method: string, path: string): void {
  state.requests.push({ method, path })
}

/** Random and variant-free: an id must not let a grader or an agent infer which variant ran. */
function newJobId(): string {
  return `job-${randomBytes(6).toString('hex')}`
}

function artifactFor(datasetId: string, format: string): ExportArtifact {
  const rows = ['id,value', '1,alpha', '2,beta']
  return {
    datasetId,
    format,
    rows: format === 'json' ? rows.map((r) => JSON.stringify(r)) : rows,
  }
}

export function createJob(input: {
  datasetId: string
  format: string
}): { ok: true; status: 202; jobId: string } | { ok: false; status: 400 | 409 } {
  if (
    !DATASETS.some((d) => d.id === input.datasetId) ||
    !FORMATS.some((f) => f.id === input.format)
  )
    return { ok: false, status: 400 }
  // One entity per run: a second create is a second business operation, not a way to recover.
  if (state.createdJobId) return { ok: false, status: 409 }
  const jobId = newJobId()
  const job: ExportJob = {
    jobId,
    attempt: 0,
    phase: 'processing',
    notice: null,
    retry: { permitted: false, remaining: 0, afterMs: 0, prerequisitesMet: false },
    datasetId: input.datasetId,
    format: input.format,
    recoveryPrerequisite: RECOVERY_MET,
  }
  state.jobs.set(jobId, job)
  state.createdJobId = jobId
  state.creates++
  return { ok: true, status: 202, jobId }
}

/**
 * Advance the asynchronous work, returning a new job.
 *
 * Late work is not baked in at create time: the terminal state is produced here, so the status
 * read is what drives the outcome - as a real background job runner would. Nothing is mutated, so
 * a job already read by a caller cannot be changed underneath it.
 */
function advance(job: ExportJob): ExportJob {
  if (job.phase !== 'processing') return finalize(job)
  const next = (
    phase: ExportJob['phase'],
    prerequisite: RecoveryPrerequisite = RECOVERY_MET,
  ): ExportJob => ({ ...job, phase, recoveryPrerequisite: prerequisite })
  switch (state.variant) {
    case 'E0':
      return finalize(next('succeeded'))
    // E4 is E1's business under different wording and layout: the same failure, the same single
    // permitted recovery, the same terminal artifact.
    case 'E1':
    case 'E4':
      // Only the first attempt fails. The retry is a real second attempt that succeeds, which is
      // what makes "recovery worked" a business fact rather than a second failure.
      return job.attempt === 0 ? finalize(next('failed')) : finalize(next('succeeded'))
    case 'E2':
      // E1's failure exactly, but the published prerequisite is not met. The retry endpoint still
      // accepts the request and the explains helper confirms the backend permits it - the whole
      // difference is that the workspace is told recovery is not available.
      return job.attempt === 0
        ? finalize(next('failed', RECOVERY_UNMET))
        : finalize(next('succeeded'))
    case 'E3':
      return finalize(next('rejected'))
  }
}

/**
 * The recovery eligibility source, published as a public resource.
 *
 * A real deployment gates this so a client asks the server instead of inferring it. Here the
 * answer is honest and per-job; an agent that checks it will see E2's prerequisite is unmet and
 * should conclude recovery is unavailable rather than clicking a control that cannot work.
 */
export function getRecoveryEligibility(jobId: string) {
  const job = state.jobs.get(jobId)
  if (!job) return undefined
  const finalized = finalize(job)
  return {
    jobId,
    prerequisite: finalized.recoveryPrerequisite,
    // The backend's own answer, independent of the prerequisite projection: the API does permit
    // this retry. Publishing both is what makes "the control was inoperable although the backend
    // allowed it" an observable contradiction rather than an assumption.
    backendPermitsRetry:
      finalized.phase === 'failed' && finalized.retry.permitted && finalized.attempt === 0,
  }
}

const NO_RETRY = Object.freeze({
  permitted: false,
  remaining: 0,
  afterMs: 0,
  prerequisitesMet: false,
})

const RECOVERY_MET: RecoveryPrerequisite = Object.freeze({
  scope: 'export.retry',
  note: 'Retrying this export is available.',
  met: true,
})

const RECOVERY_UNMET: RecoveryPrerequisite = Object.freeze({
  scope: 'export.retry',
  note: 'Retrying this export is not available from this workspace.',
  met: false,
})

function finalize(job: ExportJob): ExportJob {
  if (job.phase === 'succeeded') {
    if (!state.artifacts.some((a) => a.datasetId === job.datasetId && a.format === job.format))
      state.artifacts.push(artifactFor(job.datasetId, job.format))
    return {
      ...job,
      notice: `Export ready. ${job.datasetId}.${job.format} is available.`,
      retry: NO_RETRY,
    }
  }
  if (job.phase === 'rejected')
    return {
      ...job,
      notice: 'Export rejected: your account quota for this dataset is exhausted.',
      retry: NO_RETRY,
    }
  if (job.phase === 'failed')
    // Identical public text for E1 and E2 - the difference is operational, not verbal.
    return {
      ...job,
      notice: 'Export could not complete. You may try again.',
      retry: { permitted: true, remaining: 1, afterMs: 0, prerequisitesMet: true },
    }
  return job
}

export function getJob(jobId: string, options: { advance?: boolean } = {}): ExportJob | undefined {
  const job = state.jobs.get(jobId)
  if (!job) return undefined
  if (!options.advance) return finalize(job)
  const advanced = advance(job)
  state.jobs.set(jobId, advanced)
  return advanced
}

export function retryJob(
  jobId: string,
): { ok: true; status: 200; jobId: string; attempt: number } | { ok: false; status: 404 | 409 } {
  const job = state.jobs.get(jobId)
  if (!job) return { ok: false, status: 404 }
  // The public contract alone decides: a failure whose published retry is still permitted can be
  // retried. E2's unmet *prerequisite* is a projection for the workspace, not a backend refusal -
  // refusing here would move the defect out of the UI and change the public protocol, which F04
  // rules out ("E2 后端确实允许 retry").
  if (job.phase !== 'failed' || !job.retry.permitted || job.attempt > 0)
    return { ok: false, status: 409 }
  const attempt = job.attempt + 1
  state.retries++
  const advanced = advance({ ...job, attempt, phase: 'processing' })
  state.jobs.set(jobId, advanced)
  return { ok: true, status: 200, jobId, attempt }
}

/** Public projection of a job. Carries no variant, no private flag and no root cause. */
export function publicJob(job: ExportJob) {
  return {
    jobId: job.jobId,
    attempt: job.attempt,
    version: job.phase === 'processing' ? 1 : job.attempt + 2,
    phase: job.phase,
    notice: job.notice,
    retry: job.retry,
    datasetId: job.datasetId,
    format: job.format,
  }
}

export function getArenaState() {
  return {
    variant: state.variant,
    creates: state.creates,
    retries: state.retries,
    jobs: state.jobs.size,
    artifacts: state.artifacts.length,
    artifactContents: state.artifacts.map((a) => ({ ...a })),
    requests: state.requests.map((r) => ({ ...r })),
  }
}

export function getArtifact(jobId: string): ExportArtifact | undefined {
  const job = state.jobs.get(jobId)
  if (!job || job.phase !== 'succeeded') return undefined
  return state.artifacts.find((a) => a.datasetId === job.datasetId && a.format === job.format)
}
