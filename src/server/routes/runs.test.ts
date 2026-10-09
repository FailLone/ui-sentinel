import { describe, it, expect, beforeAll } from 'vitest'
import { Hono } from 'hono'
import { initDatabase } from '../../storage/database.ts'
import { runRoutes } from './runs.ts'
import { findingRoutes } from './findings.ts'
import { createRun, appendEvent, submitFinding } from '../../execution/run-manager.ts'

describe('run API routes', () => {
  const app = new Hono()
  app.route('/', runRoutes)
  app.route('/', findingRoutes)

  beforeAll(async () => {
    await initDatabase()
  })

  it('POST /api/runs returns 503 when model not configured', async () => {
    const res = await app.request('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: 'test' }),
    })
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('configuration-missing')
  })

  it('GET /api/runs/:id returns 404 for unknown run', async () => {
    const res = await app.request('/api/runs/nonexistent')
    expect(res.status).toBe(404)
  })

  it('GET /api/runs/:id returns run details', async () => {
    const run = await createRun({
      goal: 'test goal',
      environmentId: 'test',
      entryUrl: 'http://localhost:4173',
    })

    const res = await app.request(`/api/runs/${run.id}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(run.id)
    expect(body.status).toBe('queued')
    expect(body.spec.goal).toBe('test goal')
  })

  it('GET /api/runs/:id/events returns events as JSON', async () => {
    const run = await createRun({
      goal: 'test events',
      environmentId: 'test',
      entryUrl: 'http://localhost:4173',
    })

    await appendEvent(run.id, 'run:started', { goal: 'test events' })
    await appendEvent(run.id, 'navigation:completed', { url: 'http://localhost' })

    const res = await app.request(`/api/runs/${run.id}/events`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(2)
    expect(body[0].type).toBe('run:started')
  })

  it('GET /api/runs/:id/events supports after cursor', async () => {
    const run = await createRun({
      goal: 'cursor test',
      environmentId: 'test',
      entryUrl: 'http://localhost:4173',
    })

    await appendEvent(run.id, 'event-0', {})
    await appendEvent(run.id, 'event-1', {})
    await appendEvent(run.id, 'event-2', {})

    const res = await app.request(`/api/runs/${run.id}/events?after=0`)
    const body = await res.json()
    expect(body).toHaveLength(2)
  })

  it('GET /api/runs/:id/report returns report with findings', async () => {
    const run = await createRun({
      goal: 'report test',
      environmentId: 'test',
      entryUrl: 'http://localhost:4173',
    })

    await submitFinding({
      runId: run.id,
      source: 'agent',
      ruleId: null,
      ruleRevision: null,
      hypothesisId: null,
      validationStatus: 'candidate',
      severity: 'warning',
      title: 'Test finding',
      expected: 'clean page',
      actual: 'overlay present',
      stepId: null,
      evidenceRefs: [],
    })

    const res = await app.request(`/api/runs/${run.id}/report`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.runId).toBe(run.id)
    expect(body.findings).toHaveLength(1)
    expect(body.findings[0].title).toBe('Test finding')
  })

  it('POST /api/findings/:id/feedback validates verdict', async () => {
    const run = await createRun({
      goal: 'feedback test',
      environmentId: 'test',
      entryUrl: 'http://localhost:4173',
    })

    const finding = await submitFinding({
      runId: run.id,
      source: 'agent',
      ruleId: null,
      ruleRevision: null,
      hypothesisId: null,
      validationStatus: 'candidate',
      severity: 'warning',
      title: 'Feedback test finding',
      expected: 'x',
      actual: 'y',
      stepId: null,
      evidenceRefs: [],
    })

    const badRes = await app.request(`/api/findings/${finding.id}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verdict: 'invalid' }),
    })
    expect(badRes.status).toBe(400)

    const goodRes = await app.request(`/api/findings/${finding.id}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verdict: 'confirmed', reason: 'verified manually' }),
    })
    expect(goodRes.status).toBe(200)
    const body = await goodRes.json()
    expect(body.verdict).toBe('confirmed')
  })
})
