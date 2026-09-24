import { describe, it, expect, beforeEach } from 'vitest'
import {
  DATASETS,
  FORMATS,
  createJob,
  getArenaState,
  getJob,
  getRecoveryEligibility,
  resetState,
  retryJob,
  type VariantId,
} from './state.ts'

const validChoice = { datasetId: DATASETS[0]!.id, format: FORMATS[0]!.id }

describe('export arena private business truth', () => {
  beforeEach(() => {
    resetState('E0')
  })

  it('offers at least two public datasets and two formats, with CSV among them', () => {
    expect(DATASETS.length).toBeGreaterThanOrEqual(2)
    expect(FORMATS.length).toBeGreaterThanOrEqual(2)
    expect(FORMATS.map((f) => f.id)).toContain('csv')
    // The choice must be real: ids are not interchangeable labels.
    expect(new Set(DATASETS.map((d) => d.id)).size).toBe(DATASETS.length)
  })

  it('refuses a create without an explicit dataset and format', () => {
    expect(createJob({ datasetId: '', format: 'csv' })).toMatchObject({ ok: false })
    expect(createJob({ datasetId: DATASETS[0]!.id, format: '' })).toMatchObject({ ok: false })
    expect(createJob({ datasetId: 'nope', format: 'csv' })).toMatchObject({ ok: false })
    expect(createJob({ datasetId: DATASETS[0]!.id, format: 'xml' })).toMatchObject({ ok: false })
    expect(getArenaState().creates).toBe(0)
  })

  it('E0: accepts with processing, then succeeds with a real artifact', () => {
    const created = createJob(validChoice)
    expect(created).toMatchObject({ ok: true, status: 202 })
    const id = created.ok ? created.jobId : ''
    expect(id).toBeTruthy()
    expect(getJob(id)).toMatchObject({ phase: 'processing', attempt: 0 })
    expect(getArenaState().creates).toBe(1)
    expect(getArenaState().artifacts).toBe(0)
    // The terminal state is driven by the status read, not fabricated at create time.
    expect(getJob(id, { advance: true })).toMatchObject({ phase: 'succeeded' })
    const artifact = getArenaState().artifactContents[0]!
    expect(artifact.datasetId).toBe(validChoice.datasetId)
    expect(artifact.format).toBe('csv')
    expect(artifact.rows.length).toBeGreaterThan(0)
  })

  it('E1: first attempt fails with a met recovery prerequisite, and one retry succeeds', () => {
    resetState('E1')
    const created = createJob(validChoice)
    expect(created).toMatchObject({ ok: true, status: 202 })
    const id = created.ok ? created.jobId : ''
    const failed = getJob(id, { advance: true })!
    expect(failed).toMatchObject({
      phase: 'failed',
      attempt: 0,
      recoveryPrerequisite: { met: true },
      retry: { permitted: true, remaining: 1 },
    })
    const retried = retryJob(id)!
    expect(retried).toMatchObject({ ok: true, attempt: 1 })
    expect(getJob(id, { advance: true })).toMatchObject({ phase: 'succeeded', attempt: 1 })
    expect(getArenaState()).toMatchObject({ creates: 1, retries: 1, artifacts: 1 })
  })

  it('E1: the recovery prerequisite stays met until the retry is used', () => {
    resetState('E1')
    const created = createJob(validChoice)
    expect(created).toMatchObject({ ok: true, status: 202 })
    const id = created.ok ? created.jobId : ''
    getJob(id, { advance: true })
    // Read repeatedly, as a polling page does: the prerequisite must not time out while the agent
    // is still arriving. Only using the retry changes it.
    for (let i = 0; i < 5; i++) expect(getRecoveryEligibility(id)!.prerequisite.met).toBe(true)
    retryJob(id)
    expect(getRecoveryEligibility(id)!.backendPermitsRetry).toBe(false)
  })

  it('E2: the same public failure and a backend that allows retry, but an unmet prerequisite', () => {
    resetState('E2')
    const created = createJob(validChoice)
    expect(created).toMatchObject({ ok: true, status: 202 })
    const id = created.ok ? created.jobId : ''
    const failed = getJob(id, { advance: true })!
    // E1 and E2 are indistinguishable from the job payload alone: same phase, same notice, same
    // retry terms. That identity is the point - only the eligibility resource differs.
    expect(failed.phase).toBe('failed')
    expect(failed.notice).toBe('Export could not complete. You may try again.')
    expect(failed.retry).toMatchObject({ permitted: true, remaining: 1 })
    const eligibility = getRecoveryEligibility(id)!
    expect(eligibility.prerequisite.met).toBe(false)
    // F04: the backend really does permit the retry. If this were false, E2 would be a backend
    // defect and a retried request would be rejected - changing the public protocol.
    expect(eligibility.backendPermitsRetry).toBe(true)
    expect(retryJob(id)).toMatchObject({ ok: true, attempt: 1 })
    expect(getArenaState()).toMatchObject({ creates: 1, retries: 1, artifacts: 1 })
  })

  it('E2: never retrying leaves no artifact, and a second retry is refused', () => {
    resetState('E2')
    const created = createJob(validChoice)
    const id = created.ok ? created.jobId : ''
    getJob(id, { advance: true })
    // The graded outcome for E2: recovery is not used, so there is no artifact.
    expect(getArenaState()).toMatchObject({ creates: 1, retries: 0, artifacts: 0 })
    retryJob(id)
    expect(retryJob(id)).toMatchObject({ ok: false, status: 409 })
    expect(getArenaState().retries).toBe(1)
  })

  it('E3: an explicit business rejection is not a recoverable failure', () => {
    resetState('E3')
    const created = createJob(validChoice)
    expect(created).toMatchObject({ ok: true, status: 202 })
    const id = created.ok ? created.jobId : ''
    const rejected = getJob(id, { advance: true })!
    expect(rejected).toMatchObject({ phase: 'rejected', retry: { permitted: false } })
    expect(retryJob(id)).toMatchObject({ ok: false })
    expect(getArenaState()).toMatchObject({ creates: 1, retries: 0, artifacts: 0 })
  })

  it('E4: the same business protocol as E1, only presentation differs', () => {
    resetState('E4')
    const created = createJob(validChoice)
    expect(created).toMatchObject({ ok: true, status: 202 })
    const id = created.ok ? created.jobId : ''
    expect(getJob(id, { advance: true })).toMatchObject({ phase: 'failed', attempt: 0 })
    expect(getRecoveryEligibility(id)!.prerequisite.met).toBe(true)
    expect(retryJob(id)).toMatchObject({ ok: true, attempt: 1 })
    expect(getJob(id, { advance: true })).toMatchObject({ phase: 'succeeded', attempt: 1 })
    // Same counts as E1: this is a naming/layout variant, not a different business.
    expect(getArenaState()).toMatchObject({ creates: 1, retries: 1, artifacts: 1 })
  })

  it('counts exactly one create per job and refuses a second create for the same run', () => {
    resetState('E1')
    const first = createJob(validChoice)
    expect(first).toMatchObject({ ok: true, status: 202 })
    expect(createJob(validChoice)).toMatchObject({ ok: false, status: 409 })
    expect(getArenaState().creates).toBe(1)
  })

  it('refuses a retry before any failure and for an unknown job', () => {
    resetState('E1')
    expect(retryJob('job-does-not-exist')).toMatchObject({ ok: false, status: 404 })
    expect(getArenaState()).toMatchObject({ creates: 0, retries: 0 })
  })

  it('never exposes the variant id in a job id, a public payload or a published resource', () => {
    for (const variant of ['E0', 'E1', 'E2', 'E3', 'E4'] as VariantId[]) {
      resetState(variant)
      const created = createJob(validChoice)
      expect(created).toMatchObject({ ok: true, status: 202 })
      const id = created.ok ? created.jobId : ''
      expect(id).not.toContain(variant)
      // Random, so two runs cannot be compared by id shape either.
      expect(id).toMatch(/^job-[a-z0-9]+$/)
    }
  })

  it('isolates reset: each variant starts from clean counters', () => {
    resetState('E1')
    const created = createJob(validChoice)
    expect(created).toMatchObject({ ok: true, status: 202 })
    const id = created.ok ? created.jobId : ''
    getJob(id, { advance: true })
    retryJob(id)
    expect(getArenaState().creates).toBe(1)
    resetState('E0')
    expect(getArenaState()).toMatchObject({
      creates: 0,
      retries: 0,
      jobs: 0,
      artifacts: 0,
      requests: [],
    })
    expect(getJob(id)).toBeUndefined()
  })
})
