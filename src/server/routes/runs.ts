import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { checkModelConfig } from '../../shared/config.ts'
import {
  createRun,
  getRun,
  updateRunStatus,
  getEvents,
  getFindings,
  subscribeToEvents,
  isRunActive,
  getActiveRun,
} from '../../execution/run-manager.ts'
import { startRunExecution } from '../../execution/executor.ts'
import type { RunReport, RunEvent } from '../../shared/types.ts'

export const runRoutes = new Hono()

runRoutes.post('/api/runs', async (c) => {
  const model = checkModelConfig()
  if (!model.ready) {
    return c.json({
      error: 'configuration-missing',
      missing: model.missing,
      message: 'Model configuration is incomplete. Set the required environment variables.',
    }, 503)
  }

  const body = await c.req.json<{
    goal: string
    environmentId?: string
    entryUrl?: string
    budget?: { totalTimeoutMs?: number; maxActions?: number; maxModelCalls?: number }
    viewport?: { width: number; height: number }
  }>()

  if (!body.goal) {
    return c.json({ error: 'goal is required' }, 400)
  }

  const run = await createRun({
    goal: body.goal,
    environmentId: body.environmentId ?? 'default',
    entryUrl: body.entryUrl ?? `http://localhost:${process.env.ARENA_PORT ?? 4173}`,
    budget: body.budget,
    viewport: body.viewport,
  })

  startRunExecution(run.id).catch((err) => {
    console.error(`[run:${run.id}] execution error:`, err)
  })

  return c.json({
    runId: run.id,
    status: run.status,
    eventsUrl: `/api/runs/${run.id}/events`,
    reportUrl: `/api/runs/${run.id}/report`,
  }, 202)
})

runRoutes.get('/api/runs/:id', async (c) => {
  const run = await getRun(c.req.param('id'))
  if (!run) return c.json({ error: 'not found' }, 404)

  const events = await getEvents(run.id)
  const latestSeq = events.length > 0 ? events[events.length - 1].seq : -1

  return c.json({
    ...run,
    latestEventSeq: latestSeq,
    active: isRunActive(run.id),
  })
})

runRoutes.post('/api/runs/:id/cancel', async (c) => {
  const runId = c.req.param('id')
  const run = await getRun(runId)
  if (!run) return c.json({ error: 'not found' }, 404)

  const terminalStatuses = new Set(['completed', 'cancelled', 'timed-out', 'execution-error'])
  if (terminalStatuses.has(run.status)) {
    return c.json({ accepted: false, reason: `run already in terminal state: ${run.status}` })
  }

  const active = getActiveRun(runId)
  if (active) {
    active.abortController.abort()
  }

  await updateRunStatus(runId, 'cancelled', { stopReason: 'cancelled' })
  return c.json({ accepted: true })
})

runRoutes.get('/api/runs/:id/events', async (c) => {
  const runId = c.req.param('id')
  const run = await getRun(runId)
  if (!run) return c.json({ error: 'not found' }, 404)

  const afterParam = c.req.query('after')
  const afterSeq = afterParam != null ? Number(afterParam) : undefined

  const accept = c.req.header('accept') ?? ''
  if (accept.includes('text/event-stream')) {
    return streamSSE(c, async (stream) => {
      const pastEvents = await getEvents(runId, afterSeq)
      for (const event of pastEvents) {
        await stream.writeSSE({
          id: String(event.seq),
          event: event.type,
          data: JSON.stringify(event),
        })
      }

      if (!isRunActive(runId)) {
        await stream.writeSSE({
          event: 'done',
          data: JSON.stringify({ runId, status: run.status }),
        })
        return
      }

      const unsubscribe = subscribeToEvents(runId, async (event: RunEvent) => {
        try {
          await stream.writeSSE({
            id: String(event.seq),
            event: event.type,
            data: JSON.stringify(event),
          })

          if (event.type === 'run:completed' || event.type === 'run:error' || event.type === 'run:cancelled') {
            await stream.writeSSE({
              event: 'done',
              data: JSON.stringify({ runId, status: event.type }),
            })
          }
        } catch { /* client disconnected */ }
      })

      stream.onAbort(() => unsubscribe())

      await new Promise<void>((resolve) => {
        const check = setInterval(async () => {
          if (!isRunActive(runId)) {
            clearInterval(check)
            unsubscribe()
            resolve()
          }
        }, 2000)

        stream.onAbort(() => {
          clearInterval(check)
          resolve()
        })
      })
    })
  }

  const events = await getEvents(runId, afterSeq)
  return c.json(events)
})

runRoutes.get('/api/runs/:id/report', async (c) => {
  const runId = c.req.param('id')
  const run = await getRun(runId)
  if (!run) return c.json({ error: 'not found' }, 404)

  const findings = await getFindings(runId)
  const events = await getEvents(runId)

  const exploredStates = events
    .filter((e) => e.type === 'exploration:state-reached')
    .map((e) => String(e.payload.state ?? 'unknown'))

  const unexploredBranches = events
    .filter((e) => e.type === 'exploration:branch-skipped')
    .map((e) => String(e.payload.branch ?? 'unknown'))

  const report: RunReport = {
    runId,
    status: run.status,
    businessResult: run.businessResult,
    stopReason: run.stopReason,
    findings,
    usage: run.usage,
    exploredStates,
    unexploredBranches,
    evaluatedRuleCount: events.filter((e) => e.type === 'rule:evaluated').length,
    unknownCount: findings.filter((f) => f.validationStatus === 'inconclusive').length,
  }

  return c.json(report)
})

runRoutes.get('/api/runs/:id/artifacts/:artifactId', async (c) => {
  const artifactId = c.req.param('artifactId')

  if (artifactId.includes('..') || artifactId.includes('/')) {
    return c.json({ error: 'invalid artifact id' }, 400)
  }

  const runId = c.req.param('id')
  const { readFile } = await import('node:fs/promises')
  const { join, resolve } = await import('node:path')

  const artifactsDir = resolve('data/artifacts', runId)
  const filePath = join(artifactsDir, artifactId)

  if (!filePath.startsWith(artifactsDir)) {
    return c.json({ error: 'invalid path' }, 400)
  }

  try {
    const data = await readFile(filePath)
    const ext = artifactId.split('.').pop()?.toLowerCase() ?? ''
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      json: 'application/json',
      html: 'text/html',
    }
    return new Response(data, {
      headers: { 'Content-Type': mimeMap[ext] ?? 'application/octet-stream' },
    })
  } catch {
    return c.json({ error: 'artifact not found' }, 404)
  }
})
