import { Hono } from 'hono'
import { checkStorageHealth } from '../../storage/database.ts'
import { checkModelConfig } from '../../shared/config.ts'

export const healthRoutes = new Hono()

healthRoutes.get('/api/health', async (c) => {
  const storage = await checkStorageHealth()
  const model = checkModelConfig()
  const healthy = storage.ok

  return c.json({
    status: healthy ? 'ok' : 'degraded',
    storage: { ok: storage.ok, error: storage.error ?? null },
    model: { ready: model.ready, missing: model.missing },
    timestamp: new Date().toISOString(),
  }, healthy ? 200 : 503)
})
