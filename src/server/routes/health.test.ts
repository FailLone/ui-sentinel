import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { checkModelConfig } from '../../shared/config.ts'
import { healthRoutes } from './health.ts'

describe('health checks', () => {
  it('reports missing model config when env vars are empty', () => {
    const result = checkModelConfig()
    expect(result).toHaveProperty('ready')
    expect(result).toHaveProperty('missing')
    expect(Array.isArray(result.missing)).toBe(true)
  })

  it('checkStorageHealth returns ok for valid db', async () => {
    const { checkStorageHealth, initDatabase } = await import('../../storage/database.ts')
    await initDatabase()
    const result = await checkStorageHealth()
    expect(result.ok).toBe(true)
  })

  it('health route returns JSON with correct shape', async () => {
    const { initDatabase } = await import('../../storage/database.ts')
    await initDatabase()

    const app = new Hono()
    app.route('/', healthRoutes)

    const res = await app.request('/api/health')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('status')
    expect(body).toHaveProperty('storage')
    expect(body).toHaveProperty('model')
    expect(body).toHaveProperty('timestamp')
    expect(body.storage).toHaveProperty('ok', true)
  })
})
