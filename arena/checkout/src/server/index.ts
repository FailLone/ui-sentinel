import 'dotenv/config'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { randomBytes } from 'node:crypto'
import { serve } from '@hono/node-server'
import {
  getProducts,
  getCart,
  getCartTotal,
  addToCart,
  removeFromCart,
  processPayment,
  getOrders,
  resetState,
  getArenaState,
  getVariant,
  type VariantId,
} from './state.ts'

const VALID_VARIANTS = new Set<VariantId>(['C0', 'C1', 'C2', 'C3', 'C4', 'C5'])
const PORT = Number(process.env.ARENA_API_PORT ?? 4174)

const app = new Hono()

const control = new Hono()
const controlToken = process.env.ARENA_CONTROL_TOKEN ?? randomBytes(32).toString('hex')
control.use('*', async (c, next) => {
  if (c.req.header('authorization') !== `Bearer ${controlToken}`)
    return c.json({ error: 'unauthorized' }, 401)
  await next()
})

app.get('/api/products', (c) => c.json(getProducts()))

app.get('/api/cart', (c) => c.json({ items: getCart(), total: getCartTotal() }))

app.post('/api/cart/add', async (c) => {
  const body = await c.req.json<{ productId: string; quantity?: number }>()
  if (!body.productId) return c.json({ error: 'productId required' }, 400)

  try {
    const cart = addToCart(body.productId, body.quantity ?? 1)
    return c.json({ items: cart, total: getCartTotal() })
  } catch (e) {
    return c.json({ error: String(e) }, 400)
  }
})

app.post('/api/cart/remove', async (c) => {
  const body = await c.req.json<{ productId: string }>()
  if (!body.productId) return c.json({ error: 'productId required' }, 400)

  const cart = removeFromCart(body.productId)
  return c.json({ items: cart, total: getCartTotal() })
})

app.post('/api/checkout', async (c) => {
  try {
    const result = processPayment()
    return c.json(result, result.success ? 200 : 402)
  } catch (e) {
    return c.json({ error: String(e) }, 400)
  }
})

app.get('/api/orders', (c) => c.json(getOrders()))

app.get('/api/variant-config', (c) => {
  const variant = getVariant()
  return c.json({
    overlay: variant === 'C1' || variant === 'C2',
    overlayClosable: variant === 'C1',
    buttonRenamed: variant === 'C3',
    buttonMoved: variant === 'C3',
  })
})

control.post('/__control/reset', async (c) => {
  const body = await c.req
    .json<{ variant?: string; learningRetryAvailable?: boolean }>()
    .catch(() => ({}) as { variant?: string; learningRetryAvailable?: boolean })
  const variant = (body.variant ?? 'C0') as VariantId
  if (!VALID_VARIANTS.has(variant)) {
    return c.json({ error: `Invalid variant: ${variant}` }, 400)
  }
  if (
    body.learningRetryAvailable !== undefined &&
    (typeof body.learningRetryAvailable !== 'boolean' || variant !== 'C5')
  )
    return c.json({ error: 'Invalid learning recovery override' }, 400)
  resetState(variant, body.learningRetryAvailable)
  return c.json({ ok: true, variant })
})

control.get('/__control/state', (c) => c.json({ ...getArenaState(), orders: getOrders() }))

if (process.env.ARENA_STATIC === '1') {
  app.use('/*', serveStatic({ root: './arena/checkout/dist' }))
  serve({ fetch: app.fetch, port: Number(process.env.ARENA_PORT ?? 4173), hostname: '127.0.0.1' })
}

serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, () => {
  console.log(`[arena-api] listening on http://localhost:${PORT}`)
})

export { app }

serve({
  fetch: control.fetch,
  port: Number(process.env.ARENA_CONTROL_PORT ?? 4175),
  hostname: '127.0.0.1',
})
