import { Hono } from 'hono'
import { randomBytes } from 'node:crypto'
import {
  DATASETS,
  FORMATS,
  audit,
  createJob,
  getArenaState,
  getArtifact,
  getJob,
  getPresentation,
  getRecoveryEligibility,
  publicJob,
  resetState,
  retryJob,
  type VariantId,
} from './state.ts'

const VALID_VARIANTS = new Set<VariantId>(['E0', 'E1', 'E2', 'E3', 'E4'])

export interface ExportArenaOptions {
  readonly controlToken: string
  /**
   * Whether the server currently has an active, queued or reconciliation-pending run. The control
   * plane refuses to reset business state while one exists, so a reset cannot yank the ground out
   * from under a run that is still being graded.
   */
  readonly isBusy: () => Promise<boolean>
}

/**
 * Build the export arena's two apps: the public one the browser may reach, and the private
 * controller the browser must never reach.
 *
 * The split is structural rather than conventional. The public app has no route that reads or
 * writes the private state, so there is no path to leak a variant or an answer through it; the
 * controller serves only loopback callers holding the token.
 */
export function createExportApp(options: ExportArenaOptions) {
  const app = new Hono()
  const control = new Hono()

  control.use('*', async (c, next) => {
    if (c.req.header('authorization') !== `Bearer ${options.controlToken}`)
      return c.json({ error: 'unauthorized' }, 401)
    await next()
  })

  app.get('/api/exports/datasets', (c) => c.json({ datasets: DATASETS, formats: FORMATS }))

  // Public presentation preference only: no variant id, no failure description.
  app.get('/api/exports/ui', (c) => c.json({ presentation: getPresentation() }))

  app.post('/api/exports', async (c) => {
    audit('POST', '/api/exports')
    const body = await c.req
      .json<{ datasetId?: string; format?: string }>()
      .catch(() => ({}) as { datasetId?: string; format?: string })
    // The selection is required, not defaulted: an agent must actually choose, so a pre-filled
    // form cannot stand in for completing the task.
    const result = createJob({ datasetId: body.datasetId ?? '', format: body.format ?? '' })
    if (!result.ok)
      return c.json(
        {
          error: result.status === 409 ? 'export-already-created' : 'invalid-selection',
          message:
            result.status === 409
              ? 'This run already created an export job.'
              : 'Choose a dataset and a format from the published options.',
        },
        result.status,
      )
    const job = getJob(result.jobId)
    return c.json(publicJob(job!), 202)
  })

  /**
   * The published recovery prerequisite for a job.
   *
   * An ordinary public resource: this is where a client is meant to find out whether recovery is
   * available instead of inferring it. It reports both the prerequisite and the backend's own
   * answer, so the workspace's decision can be checked against what the API actually allows.
   */
  app.get('/api/exports/:jobId/eligibility', (c) => {
    const jobId = c.req.param('jobId')
    audit('GET', `/api/exports/${jobId}/eligibility`)
    const eligibility = getRecoveryEligibility(jobId)
    if (!eligibility) return c.json({ error: 'unknown-job' }, 404)
    return c.json(eligibility)
  })

  // A status read is what drives the asynchronous work forward, so the terminal state is produced
  // here rather than being baked in at create time.
  app.get('/api/exports/:jobId', (c) => {
    audit('GET', `/api/exports/${c.req.param('jobId')}`)
    const job = getJob(c.req.param('jobId'), { advance: true })
    if (!job) return c.json({ error: 'unknown-job' }, 404)
    return c.json(publicJob(job))
  })

  app.post('/api/exports/:jobId/retry', (c) => {
    audit('POST', `/api/exports/${c.req.param('jobId')}/retry`)
    const result = retryJob(c.req.param('jobId'))
    if (!result.ok)
      return c.json(
        {
          error: result.status === 404 ? 'unknown-job' : 'retry-not-permitted',
          message: 'This export cannot be retried.',
        },
        result.status,
      )
    return c.json(publicJob(getJob(result.jobId, { advance: true })!))
  })

  app.get('/api/exports/:jobId/download', (c) => {
    const jobId = c.req.param('jobId')
    const job = getJob(jobId, { advance: true })
    if (!job) return c.json({ error: 'unknown-job' }, 404)
    audit('GET', `/api/exports/${jobId}/download`)
    const artifact = getArtifact(jobId)
    if (!artifact)
      return c.json(
        { error: 'artifact-unavailable', message: 'No export artifact exists for this job.' },
        409,
      )
    const body =
      artifact.format === 'json' ? JSON.stringify(artifact.rows) : artifact.rows.join('\n')
    return c.body(body, 200, {
      'content-type': artifact.format === 'json' ? 'application/json' : 'text/csv',
      'content-disposition': `attachment; filename="export.${artifact.format}"`,
    })
  })

  // Private controller. Never mounted on the public app.
  control.post('/__control/reset', async (c) => {
    const body = await c.req.json<{ variant?: string }>().catch(() => ({}) as { variant?: string })
    const variant = (body.variant ?? 'E0') as VariantId
    if (!VALID_VARIANTS.has(variant)) return c.json({ error: `Invalid variant: ${variant}` }, 400)
    // Validated first, so a malformed request is rejected without disturbing a running campaign.
    if (await options.isBusy()) return c.json({ error: 'runs-in-progress' }, 409)
    resetState(variant)
    return c.json({ ok: true })
  })

  control.get('/__control/state', (c) => c.json(getArenaState()))

  return { app, control }
}
