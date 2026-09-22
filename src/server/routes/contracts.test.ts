import { beforeAll, describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
vi.mock('../../shared/config.ts', () => ({
  config: {
    databaseUrl: 'file::memory:',
    arenaPort: 4173,
    budget: { totalTimeoutMs: 300000, maxActions: 40, maxModelCalls: 30 },
  },
  checkModelConfig: () => ({ ready: true, missing: [] }),
}))
vi.mock('../../execution/executor.ts', () => ({
  startRunExecution: vi.fn(async () => {}),
  cancelRunExecution: vi.fn(async () => true),
}))
import { initDatabase } from '../../storage/database.ts'
import { createRun, appendEvent, updateRunStatus } from '../../execution/run-manager.ts'
import { runRoutes } from './runs.ts'
const app = new Hono().route('/', runRoutes)
beforeAll(initDatabase)
const post = (body: unknown) =>
  app.request('/api/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
describe('run API contracts', () => {
  it('rejects unbounded budgets, unknown environments and non-arena navigation', async () => {
    for (const body of [
      { goal: 'inspect', budget: { maxActions: -1 } },
      { goal: 'inspect', budget: { totalTimeoutMs: 999999 } },
      { goal: 'inspect', environmentId: 'production' },
      { goal: 'inspect', entryUrl: 'http://localhost:4175/__control/state' },
    ])
      expect((await post(body)).status).toBe(400)
  })
  it('returns immediately with an ID and queued status', async () => {
    const r = await post({ goal: 'inspect', environmentId: 'arena' })
    expect(r.status).toBe(202)
    expect((await r.json()).status).toBe('queued')
  })
  it('rejects malformed JSON rather than creating a run', async () => {
    expect((await app.request('/api/runs', { method: 'POST', body: '{' })).status).toBe(400)
  })
  it('resumes SSE by Last-Event-ID without replaying earlier events', async () => {
    const r = await createRun({
      goal: 'sse',
      environmentId: 'test',
      entryUrl: 'http://localhost:4173',
    })
    await appendEvent(r.id, 'first', {})
    await appendEvent(r.id, 'second', {})
    await updateRunStatus(r.id, 'completed')
    const response = await app.request(`/api/runs/${r.id}/events`, {
      headers: { accept: 'text/event-stream', 'Last-Event-ID': '0' },
    })
    const text = await response.text()
    expect(text).toContain('event: second')
    expect(text).not.toContain('event: first')
    expect(text).toContain('event: done')
  })
  it('reports unexecuted checks as not-checked and includes durable evidence fields', async () => {
    const r = await createRun({
      goal: 'report',
      environmentId: 'test',
      entryUrl: 'http://localhost:4173',
    })
    const data = await (await app.request(`/api/runs/${r.id}/report`)).json()
    expect(data.coverage.checks).toBe('not-checked')
    expect(data.artifacts).toEqual([])
    expect(data.budget.maxActions).toBe(40)
  })
  it('does not serve arbitrary disk paths or artifacts owned by a different run', async () => {
    const response = await app.request('/api/runs/missing/artifacts/package.json')
    expect(response.status).toBe(404)
  })
})
