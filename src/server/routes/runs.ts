import { unresolvedAnalyses } from '../../execution/evidence-analysis/coverage.ts'
import type { AnalysisTask } from '../../execution/evidence-analysis/queue.ts'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { readFile, realpath, stat } from 'node:fs/promises'
import { resolve, relative, isAbsolute } from 'node:path'
import { config, checkModelConfig } from '../../shared/config.ts'
import {
  createRun,
  getRun,
  getEvents,
  getFindings,
  isRunActive,
} from '../../execution/run-manager.ts'
import { startRunExecution, cancelRunExecution } from '../../execution/executor.ts'
import { getDbClient } from '../../storage/database.ts'

import { canCreateRun, withAdmission } from '../evaluation-access.ts'

export const runRoutes = new Hono()
const terminals = new Set([
  'completed',
  'blocked',
  'cancelled',
  'timed-out',
  'execution-error',
  'interrupted',
])
const inputSchema = z
  .object({
    goal: z.string().trim().min(1).max(10000),
    environmentId: z.enum(['default', 'arena']).default('arena'),
    entryUrl: z.string().url().optional(),
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
  const entryUrl = body.entryUrl ?? `http://localhost:${config.arenaPort}`
  const url = new URL(entryUrl)
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.protocol !== 'http:' ||
    url.port !== String(config.arenaPort) ||
    url.username ||
    url.password ||
    decodeURIComponent(url.pathname).startsWith('/__control')
  ) {
    return c.json(
      {
        error: 'environment-not-allowed',
        message: 'This validation build only operates on the configured local arena.',
      },
      400,
    )
  }
  return withAdmission(async () => {
    if (!canCreateRun(c.req.header('authorization')))
      return c.json({ error: 'evaluation-in-progress' }, 409)
    const run = await createRun({ ...body, entryUrl })
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

export async function buildReport(runId: string) {
  const run = await getRun(runId)
  if (!run) return null
  const db = getDbClient()
  const [findings, events, hypothesisRows, artifactRows] = await Promise.all([
    getFindings(runId),
    getEvents(runId),
    db.execute({
      sql: 'SELECT * FROM hypotheses WHERE run_id = ? ORDER BY created_at',
      args: [runId],
    }),
    db.execute({
      sql: 'SELECT * FROM artifacts WHERE run_id = ? ORDER BY created_at',
      args: [runId],
    }),
  ])
  const artifacts = await Promise.all(
    artifactRows.rows.map(async (row) => {
      const id = String(row.id)
      let available = false
      try {
        available = (await stat(String(row.file_path))).isFile()
      } catch {
        /* evidence remains explicitly unavailable */
      }
      return {
        id,
        type: String(row.type),
        kind: String(row.type),
        metadata: JSON.parse(String(row.metadata)),
        available,
        url: `/api/runs/${runId}/artifacts/${encodeURIComponent(id)}`,
      }
    }),
  )
  const hypotheses = hypothesisRows.rows.map((row) => ({
    id: String(row.id),
    runId,
    phenomenon: String(row.phenomenon),
    basis: String(row.basis),
    verificationPlan: String(row.verification_plan),
    status: String(row.status),
    evidenceRefs: JSON.parse(String(row.evidence_refs)),
  }))
  const evaluations = events
    .filter((e) => e.type === 'rule:evaluated')
    .map((e) => ({
      ...e.payload,
      verdict: e.payload.verdict,
      eventId: e.id,
      stepId: e.stepId,
      evidenceRefs: e.evidenceRefs,
    }))
  const exploredStates = [
    ...new Set(
      events
        .filter((e) => e.type === 'exploration:state-reached')
        .map((e) => String(e.payload.state ?? e.payload.url ?? 'unknown')),
    ),
  ]
  const lastTask = [...events]
    .reverse()
    .find(
      (e) =>
        [
          'finish:accepted',
          'execution:partial',
          'execution:stopped',
          'exploration:coverage-updated',
        ].includes(e.type) && e.payload.task,
    )?.payload.task as
    | {
        unexploredBranches?: (
          | string
          | { description: string; trigger: string; applicability: string }
        )[]
        conditions?: unknown[]
      }
    | undefined
  const unexploredBranches = lastTask?.unexploredBranches
    ? lastTask.unexploredBranches
        .filter((b) => typeof b === 'string' || b.applicability !== 'not-triggered')
        .map((b) => (typeof b === 'string' ? b : b.description))
    : events
        .filter(
          (e) => e.type === 'exploration:branch-skipped' || e.type === 'exploration:branch-pending',
        )
        .map((e) => String(e.payload.branch ?? 'unknown'))
  const untriggeredBranches =
    lastTask?.unexploredBranches?.filter(
      (b) => typeof b !== 'string' && b.applicability === 'not-triggered',
    ) ?? []
  const executionErrors = events.filter((e) =>
    ['action:failed', 'run:error', 'agent:error'].includes(e.type),
  )
  const analysisTasks = [
    ...new Map(
      events
        .filter((e) => e.type === 'analysis:state')
        .map((e) => [String(e.payload.id), e.payload as unknown as AnalysisTask]),
    ).values(),
  ]
  return {
    runId,
    status: run.status,
    businessResult: run.businessResult,
    stopReason: run.stopReason,
    conclusion: {
      reasonCode:
        [...events].reverse().find((e) => e.type === 'finish:accepted')?.payload.reasonCode ?? null,
      reason:
        [...events].reverse().find((e) => e.type === 'finish:accepted')?.payload.summary ?? null,
      source: 'persisted-evidence',
      supportedFindingIds: findings
        .filter((f) => f.validationStatus === 'supported')
        .map((f) => f.id),
      unresolvedFindingIds: findings
        .filter((f) => ['candidate', 'inconclusive'].includes(f.validationStatus))
        .map((f) => f.id),
    },
    findings,
    usage: run.usage,
    budget: run.spec.budget,
    events,
    hypotheses,
    artifacts,
    evaluations,
    evidenceRefs: artifacts.map((a) => a.id),
    exploredStates,
    unexploredBranches,
    untriggeredBranches,
    conditions: lastTask?.conditions ?? [],
    analysisTasks,
    evaluatedRuleCount: evaluations.length,
    unknownCount:
      evaluations.filter((e) => e.verdict === 'unknown').length +
      findings.filter((f) => f.validationStatus === 'inconclusive').length,
    coverage: {
      exploredStates,
      unexploredBranches,
      checks: evaluations.length ? 'checked' : 'not-checked',
      executionErrors,
      unverifiedAnalysisTasks: unresolvedAnalyses(analysisTasks).map((t) => t.id),
      stopReason: run.stopReason,
    },
  }
}

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
