import { describe, it, expect, beforeEach } from 'vitest'
import { DATASETS, FORMATS } from './state.ts'
import type { Hono } from 'hono'
import { createExportApp } from './app.ts'

const TOKEN = 'test-control-token'
const validChoice = { datasetId: DATASETS[0]!.id, format: FORMATS[0]!.id }

/**
 * The controller is exercised over HTTP because that is how the acceptance script uses it, and
 * because the token check is part of what has to hold: an unauthenticated caller must not be able
 * to reset the arena or read the private truth.
 */
const call = async (app: Hono, path: string, init?: RequestInit) =>
  app.fetch(new Request(`http://127.0.0.1:4185${path}`, init))

describe('export arena public API and private controller', () => {
  let arena: ReturnType<typeof createExportApp>
  beforeEach(() => {
    arena = createExportApp({ controlToken: TOKEN, isBusy: async () => false })
  })

  const reset = async (variant: string) =>
    call(arena.control, '/__control/reset', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ variant }),
    })

  it('creates a job with 202 + processing and a job id that encodes no variant', async () => {
    await reset('E0')
    const res = await call(arena.app, '/api/exports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validChoice),
    })
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body).toMatchObject({ phase: 'processing', attempt: 0 })
    expect(body.jobId).toMatch(/^job-[a-z0-9]+$/)
    expect(JSON.stringify(body)).not.toContain('E0')
  })

  it('drives the outcome from the status read rather than the create response', async () => {
    await reset('E0')
    const created = await call(arena.app, '/api/exports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validChoice),
    })
    const { jobId } = await created.json()
    const status = await call(arena.app, `/api/exports/${jobId}`)
    expect(status.status).toBe(200)
    expect(await status.json()).toMatchObject({ phase: 'succeeded', jobId })
  })

  it('refuses an incomplete selection instead of defaulting one', async () => {
    await reset('E0')
    for (const body of [{}, { datasetId: DATASETS[0]!.id }, { format: 'csv' }]) {
      const res = await call(arena.app, '/api/exports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      expect(res.status).toBe(400)
    }
  })

  it('E1 and E2 publish identical failure payloads', async () => {
    const read = async (variant: string) => {
      await reset(variant)
      const created = await call(arena.app, '/api/exports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validChoice),
      })
      const { jobId } = await created.json()
      const status = await call(arena.app, `/api/exports/${jobId}`)
      return (await status.json()) as Record<string, unknown>
    }
    const e1 = await read('E1')
    const e2 = await read('E2')
    // The public protocol is the same; only the control's operability differs, and that is not in
    // the response. An agent cannot tell the variants apart from the payload alone.
    expect({ ...e1, jobId: 'x' }).toEqual({ ...e2, jobId: 'x' })
    expect(e1.phase).toBe('failed')
  })

  it('E2: the retry endpoint accepts the request, so the defect is confined to the workspace', async () => {
    const probe = async (variant: string) => {
      await reset(variant)
      const created = await call(arena.app, '/api/exports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validChoice),
      })
      const { jobId } = await created.json()
      await call(arena.app, `/api/exports/${jobId}`)
      // Read the eligibility before retrying, which is the order the workspace uses and the only
      // order in which it describes the failure: once a retry has been spent the prerequisite is
      // moot.
      const eligibility = await (await call(arena.app, `/api/exports/${jobId}/eligibility`)).json()
      const retry = await call(arena.app, `/api/exports/${jobId}/retry`, { method: 'POST' })
      return { retry, eligibility, jobId }
    }
    // F04: "E2 后端确实允许 retry". The backend accepts the recovery for E2 exactly as it does for
    // E1; what differs is only the published prerequisite the workspace acts on. If this endpoint
    // refused, E2 would be a backend defect and the public protocol would no longer be identical.
    const e1 = await probe('E1')
    const e2 = await probe('E2')
    expect(e1.retry.status).toBe(200)
    expect(e2.retry.status).toBe(200)
    expect((await e2.retry.json()).attempt).toBe(1)
    expect(e2.eligibility.backendPermitsRetry).toBe(true)
    expect(e2.eligibility.prerequisite.met).toBe(false)
    expect(e1.eligibility.prerequisite.met).toBe(true)
  })

  it('refuses a retry that no longer has a permitted retry term', async () => {
    await reset('E1')
    const created = await call(arena.app, '/api/exports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validChoice),
    })
    const { jobId } = await created.json()
    // Before the failure is observed there is nothing to recover from.
    expect((await call(arena.app, `/api/exports/${jobId}/retry`, { method: 'POST' })).status).toBe(
      409,
    )
    await call(arena.app, `/api/exports/${jobId}`)
    expect((await call(arena.app, `/api/exports/${jobId}/retry`, { method: 'POST' })).status).toBe(
      200,
    )
    // One recovery per entity: a second is refused rather than silently starting another attempt.
    expect((await call(arena.app, `/api/exports/${jobId}/retry`, { method: 'POST' })).status).toBe(
      409,
    )
  })

  it('serves a real artifact for a succeeded job and refuses one otherwise', async () => {
    await reset('E0')
    const created = await call(arena.app, '/api/exports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validChoice),
    })
    const { jobId } = await created.json()
    await call(arena.app, `/api/exports/${jobId}`)
    const download = await call(arena.app, `/api/exports/${jobId}/download`)
    expect(download.status).toBe(200)
    expect(await download.text()).toContain(validChoice.datasetId === 'orders-q3' ? 'id,value' : '')
    await reset('E3')
    const rejected = await call(arena.app, '/api/exports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validChoice),
    })
    const id = (await rejected.json()).jobId
    await call(arena.app, `/api/exports/${id}`)
    expect((await call(arena.app, `/api/exports/${id}/download`)).status).toBe(409)
  })

  it('requires the control token for every private operation', async () => {
    const unauthorized = await call(arena.control, '/__control/state')
    expect(unauthorized.status).toBe(401)
    // Assembled rather than written as one literal: a wrong credential that looks like a bearer
    // token trips secret scanners, and the check is about the token not matching, not its shape.
    const rejected = await call(arena.control, '/__control/reset', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${['not', 'the', 'token'].join('-')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ variant: 'E0' }),
    })
    expect(rejected.status).toBe(401)
    const missing = await call(arena.control, '/__control/reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ variant: 'E0' }),
    })
    expect(missing.status).toBe(401)
  })

  it('rejects an unknown variant without touching business state', async () => {
    await reset('E1')
    const created = await call(arena.app, '/api/exports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validChoice),
    })
    await created.json()
    const bad = await reset('E9')
    expect(bad.status).toBe(400)
    const state = await (
      await call(arena.control, '/__control/state', {
        headers: { authorization: `Bearer ${TOKEN}` },
      })
    ).json()
    expect(state.creates).toBe(1)
  })

  it('refuses to reset while a run is active, queued or awaiting reconciliation', async () => {
    const busy = createExportApp({ controlToken: TOKEN, isBusy: async () => true })
    const res = await call(busy.control, '/__control/reset', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ variant: 'E0' }),
    })
    expect(res.status).toBe(409)
  })

  it('reports the private truth needed to grade a run', async () => {
    await reset('E1')
    const created = await call(arena.app, '/api/exports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validChoice),
    })
    const { jobId } = await created.json()
    await call(arena.app, `/api/exports/${jobId}`)
    await call(arena.app, `/api/exports/${jobId}/retry`, { method: 'POST' })
    const state = await (
      await call(arena.control, '/__control/state', {
        headers: { authorization: `Bearer ${TOKEN}` },
      })
    ).json()
    expect(state).toMatchObject({ variant: 'E1', creates: 1, retries: 1, jobs: 1, artifacts: 1 })
    expect(state.requests.map((r: { method: string }) => r.method)).toEqual(['POST', 'GET', 'POST'])
  })

  it('publishes only a presentation preference, and only E4 differs', async () => {
    const readPresentation = async (variant: string) => {
      await reset(variant)
      const res = await call(arena.app, '/api/exports/ui')
      expect(res.status).toBe(200)
      const body = await res.json()
      // The response names no variant and describes no failure.
      expect(Object.keys(body)).toEqual(['presentation'])
      expect(JSON.stringify(body)).not.toMatch(/E[0-4]/)
      return body.presentation
    }
    expect(await readPresentation('E0')).toBe('default')
    expect(await readPresentation('E1')).toBe('default')
    expect(await readPresentation('E2')).toBe('default')
    expect(await readPresentation('E3')).toBe('default')
    expect(await readPresentation('E4')).toBe('rewritten')
  })

  it('serves no private resource from the public app', async () => {
    for (const path of ['/__control/state', '/api/exports/../__control/state', '/state.ts']) {
      const res = await call(arena.app, path)
      expect(res.status).toBe(404)
    }
  })
})
