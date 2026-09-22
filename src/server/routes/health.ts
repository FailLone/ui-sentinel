import { Hono } from 'hono'
import { getDbClient, checkStorageHealth } from '../../storage/database.ts'
import { checkModelConfig } from '../../shared/config.ts'

export const healthRoutes = new Hono()

healthRoutes.get('/api/health', async (c) => {
  const storage = await checkStorageHealth()
  const model = checkModelConfig()
  const healthy = storage.ok
  const rows = storage.ok
    ? await getDbClient().execute(
        "SELECT status, stop_reason FROM runs WHERE status IN ('running','queued') OR stop_reason='reconciliation-required'",
      )
    : { rows: [] }
  const activeRuns = rows.rows.filter(
    (r) => r.status === 'running' || r.stop_reason === 'reconciliation-required',
  ).length
  const queuedRuns = rows.rows.filter((r) => r.status === 'queued').length

  return c.json(
    {
      status: healthy ? 'ok' : 'degraded',
      storage: { ok: storage.ok, error: storage.error ?? null },
      model: { ready: model.ready, missing: model.missing },
      activeRuns,
      queuedRuns,
      timestamp: new Date().toISOString(),
    },
    healthy ? 200 : 503,
  )
})
