import { buildReport } from '../reports/run-report.ts'
import { terminalRunStatuses as terminals } from '../../execution/run-status.ts'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { readFile, realpath } from 'node:fs/promises'
import { resolve, relative, isAbsolute } from 'node:path'
import { config, checkModelConfig } from '../../shared/config.ts'
import { createRun, getRun, getEvents, isRunActive } from '../../execution/run-manager.ts'
import { startRunExecution, cancelRunExecution } from '../../execution/executor.ts'
import { getDbClient } from '../../storage/database.ts'
import { listPublicProfiles } from '../../business/registry.ts'
import { selectBusinessContract, selectionError } from '../../business/selection.ts'

import { canCreateRun, withAdmission } from '../evaluation-access.ts'

export const runRoutes = new Hono()
const inputSchema = z
  .object({
    goal: z.string().trim().min(1).max(10000),
    environmentId: z.enum(['default', 'arena', 'export-arena']).default('arena'),
    entryUrl: z.string().url().optional(),
    businessProfile: z
      .object({ id: z.string().min(1), revision: z.string().min(1) })
      .strict()
      .optional(),
    budget: z
      .object({
        totalTimeoutMs: z.number().int().positive().max(300000).optional(),
        maxActions: z.number().int().positive().max(40).optional(),
        maxModelCalls: z.number().int().positive().max(60).optional(),
      })
      .strict()
      .optional(),
    viewport: z
      .object({
        width: z.number().int().min(320).max(2560),
        height: z.number().int().min(240).max(2160),
      })
      .strict()
      .optional(),
  })
  .strict()

/** Public catalogue of registered business contracts. Never includes tokens, ports or answers. */
runRoutes.get('/api/business-profiles', (c) => c.json({ profiles: listPublicProfiles() }))

/** Read-only: resolve what a selection would mean without creating anything. */
runRoutes.post('/api/business-profiles/resolve', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z
    .object({
      environmentId: z.string().min(1),
      businessProfile: z.object({ id: z.string(), revision: z.string() }).strict().optional(),
    })
    .strict()
    .safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid-request' }, 400)
  const selection = selectBusinessContract({
    requested: parsed.data.businessProfile,
    environmentId: parsed.data.environmentId,
  })
  if (selection.kind !== 'resolved') {
    const error = selectionError(selection)
    return c.json(error.body, error.status)
  }
  return c.json({
    resolved: true,
    profileId: selection.contract.profileId,
    revision: selection.contract.revision,
    hash: selection.contract.hash,
    adapter: selection.contract.adapter,
    environment: selection.contract.environment,
    legacyDefault: selection.legacyDefault,
  })
})

runRoutes.get('/api/runs', async (c) => {
  const result = await getDbClient().execute(
    'SELECT id FROM runs ORDER BY created_at DESC LIMIT 100',
  )
  const runs = await Promise.all(result.rows.map((row) => getRun(String(row.id))))
  return c.json({ runs })
})

runRoutes.get('/api/execution/status', async (c) => {
  const result = await getDbClient().execute(
    "SELECT id, status, stop_reason FROM runs WHERE status IN ('queued', 'running') OR stop_reason = 'reconciliation-required'",
  )
  return c.json({ busy: result.rows.length > 0, runs: result.rows })
})

runRoutes.post('/api/runs', async (c) => {
  if (!canCreateRun(c.req.header('authorization')))
    return c.json({ error: 'evaluation-in-progress' }, 409)
  const model = checkModelConfig()
  if (!model.ready) return c.json({ error: 'configuration-missing', missing: model.missing }, 503)
  const parsed = inputSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success)
    return c.json({ error: 'invalid-request', details: parsed.error.issues }, 400)
  const body = parsed.data
  // Business selection is resolved before any entry URL handling, so an invalid contract cannot
  // reach the queue or launch a browser. A caller-supplied entryUrl can never widen this: only a
  // registered environment origin is accepted.
  const selection = selectBusinessContract({
    requested: body.businessProfile,
    environmentId: body.environmentId,
  })
  if (selection.kind !== 'resolved') {
    const error = selectionError(selection)
    return c.json(error.body, error.status)
  }
  const contract = selection.contract
  const entryUrl = contract.environment.entryUrl
  if (body.entryUrl && body.entryUrl !== entryUrl) {
    const url = new URL(body.entryUrl)
    if (
      url.origin !== contract.environment.publicOrigin ||
      url.username ||
      url.password ||
      decodeURIComponent(url.pathname).startsWith('/__control')
    ) {
      return c.json(
        {
          error: 'environment-not-allowed',
          message: 'This build only operates on the selected business environment origin.',
        },
        400,
      )
    }
  }
  return withAdmission(async () => {
    if (!canCreateRun(c.req.header('authorization')))
      return c.json({ error: 'evaluation-in-progress' }, 409)
    const run = await createRun({ ...body, entryUrl, businessContract: contract })
    void startRunExecution(run.id).catch((err) =>
      console.error(
        `[run:${run.id}] execution error`,
        err instanceof Error ? err.message : 'execution failed',
      ),
    )
    return c.json(
      {
        runId: run.id,
        status: run.status,
        businessProfile: {
          id: contract.profileId,
          revision: contract.revision,
          hash: contract.hash,
        },
        eventsUrl: `/api/runs/${run.id}/events`,
        reportUrl: `/api/runs/${run.id}/report`,
      },
      202,
    )
  })
})

runRoutes.get('/api/runs/:id', async (c) => {
  const run = await getRun(c.req.param('id'))
  if (!run) return c.json({ error: 'not found' }, 404)
  const events = await getEvents(run.id)
  return c.json({ ...run, latestEventSeq: events.at(-1)?.seq ?? -1, active: isRunActive(run.id) })
})

runRoutes.post('/api/runs/:id/cancel', async (c) => {
  const run = await getRun(c.req.param('id'))
  if (!run) return c.json({ error: 'not found' }, 404)
  if (terminals.has(run.status))
    return c.json({ accepted: false, reason: `run already in terminal state: ${run.status}` })
  const accepted = await cancelRunExecution(run.id)
  return c.json({ accepted })
})

runRoutes.get('/api/runs/:id/events', async (c) => {
  const runId = c.req.param('id')
  if (!(await getRun(runId))) return c.json({ error: 'not found' }, 404)
  const raw = c.req.query('after') ?? c.req.header('Last-Event-ID')
  const after = raw == null ? -1 : Number(raw)
  if (!Number.isSafeInteger(after) || after < -1) return c.json({ error: 'invalid cursor' }, 400)
  if (!c.req.header('accept')?.includes('text/event-stream'))
    return c.json(await getEvents(runId, after))
  // Read from the durable log, so no subscribe/replay race can lose events.
  return streamSSE(c, async (stream) => {
    let cursor = after
    while (!stream.aborted) {
      const events = await getEvents(runId, cursor)
      for (const event of events) {
        await stream.writeSSE({
          id: String(event.seq),
          event: event.type,
          data: JSON.stringify(event),
        })
        cursor = event.seq
      }
      const run = await getRun(runId)
      if (run && terminals.has(run.status) && !isRunActive(runId)) {
        // A terminal event may have committed after the first read.
        for (const event of await getEvents(runId, cursor)) {
          await stream.writeSSE({
            id: String(event.seq),
            event: event.type,
            data: JSON.stringify(event),
          })
          cursor = event.seq
        }
        await stream.writeSSE({
          event: 'done',
          data: JSON.stringify({ runId, status: run.status }),
        })
        return
      }
      await stream.sleep(250)
    }
  })
})

runRoutes.get('/api/runs/:id/report', async (c) => {
  const report = await buildReport(c.req.param('id'))
  return report ? c.json(report) : c.json({ error: 'not found' }, 404)
})

runRoutes.get('/api/runs/:id/artifacts/:artifactId', async (c) => {
  const runId = c.req.param('id')
  const id = c.req.param('artifactId')
  const result = await getDbClient().execute({
    sql: 'SELECT * FROM artifacts WHERE id = ? AND run_id = ?',
    args: [id, runId],
  })
  const row = result.rows[0]
  if (!row) return c.json({ error: 'artifact not found' }, 404)
  try {
    const root = await realpath(resolve('data/artifacts', runId))
    const path = await realpath(String(row.file_path))
    const rel = relative(root, path)
    if (rel.startsWith('..') || isAbsolute(rel))
      return c.json({ error: 'invalid artifact path' }, 400)
    const data = await readFile(path)
    const mime = path.endsWith('.png')
      ? 'image/png'
      : path.endsWith('.json')
        ? 'application/json'
        : 'application/octet-stream'
    return new Response(data, {
      headers: {
        'Content-Type': mime,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return c.json({ error: 'artifact unavailable' }, 404)
  }
})
