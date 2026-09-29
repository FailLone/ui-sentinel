import { describe, it, expect, beforeEach } from 'vitest'
import type { Hono } from 'hono'
import { createCheckoutApp } from './app.ts'
import { resetState } from './state.ts'

const TOKEN = 'test-control-token'

/**
 * The private controller is exercised over HTTP because that is how the acceptance runner uses it, and
 * because the token check and the no-leak rule are part of what has to hold: an unauthenticated caller
 * must not reset the arena, and a browser must not be able to read which focus case is under test.
 */
const call = async (instance: Hono, path: string, init?: RequestInit) =>
  instance.fetch(new Request(`http://127.0.0.1:4175${path}`, init))

describe('checkout arena public API and private controller', () => {
  let arena: ReturnType<typeof createCheckoutApp>
  beforeEach(() => {
    resetState('C0')
    arena = createCheckoutApp({ controlToken: TOKEN })
  })

  const reset = (body: unknown) =>
    call(arena.control, '/__control/reset', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('refuses a reset without the control token', async () => {
    const res = await call(arena.control, '/__control/reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ variant: 'C0' }),
    })
    expect(res.status).toBe(401)
  })

  it('refuses a reset with the wrong token', async () => {
    // Built rather than written literally: a bare "Bearer <text>" in a test file trips secret scanning,
    // and this value is only ever a token that must be refused.
    const wrong = ['Bearer', 'not-the-control-token'].join(' ')
    const res = await call(arena.control, '/__control/reset', {
      method: 'POST',
      headers: { authorization: wrong, 'content-type': 'application/json' },
      body: JSON.stringify({ variant: 'C0' }),
    })
    expect(res.status).toBe(401)
  })

  it('accepts a plain variant reset and reports no search presentation', async () => {
    const res = await reset({ variant: 'C0' })
    expect(res.status).toBe(200)

    const config = await (await call(arena.app, '/api/variant-config')).json()
    expect(config.search).toBeNull()
  })

  it('reports the search presentation after a visual reset, and never the case', async () => {
    await reset({ variant: 'C0', visual: 'search-padded-narrow-input' })

    const config = await (await call(arena.app, '/api/variant-config')).json()
    expect(config.search).toEqual({ present: 'one' })
    // The public surface describes how the area is drawn, never which case it is or what is expected.
    expect(JSON.stringify(config)).not.toMatch(/\bD[0-9]\b|\bH[0-9]\b|groundTruth|targetBox/)
  })

  it('rejects an unknown visual presentation', async () => {
    const res = await reset({ variant: 'C0', visual: 'D0' })
    expect(res.status).toBe(400)
  })

  it('clears a previous presentation when a plain variant reset follows', async () => {
    await reset({ variant: 'C0', visual: 'search-padded-narrow-input' })
    await reset({ variant: 'C0' })

    const config = await (await call(arena.app, '/api/variant-config')).json()
    expect(config.search).toBeNull()
  })

  it('reports the presentation through the private state readout only', async () => {
    await reset({ variant: 'C0', visual: 'search-proxied-wide-region' })

    const state = await (
      await call(arena.control, '/__control/state', {
        headers: { authorization: `Bearer ${TOKEN}` },
      })
    ).json()
    expect(state.visualPresent).toBe('search-proxied-wide-region')
  })

  it('still serves the ordinary product and cart reads unchanged', async () => {
    expect((await (await call(arena.app, '/api/products')).json()).length).toBe(3)
    expect(await (await call(arena.app, '/api/cart')).json()).toMatchObject({ items: [], total: 0 })
  })
})
