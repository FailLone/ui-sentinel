import { Hono } from 'hono'
import { cors } from 'hono/cors'
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

app.use('*', cors())

app.get('/api/products', (c) => c.json(getProducts()))

app.get('/api/cart', (c) =>
  c.json({ items: getCart(), total: getCartTotal() }),
)

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

app.post('/__control/reset', async (c) => {
  const body = await c.req.json<{ variant?: string }>().catch(() => ({}))
  const variant = (body.variant ?? 'C0') as VariantId
  if (!VALID_VARIANTS.has(variant)) {
    return c.json({ error: `Invalid variant: ${variant}` }, 400)
  }
  resetState(variant)
  return c.json({ ok: true, variant })
})

app.get('/__control/state', (c) => c.json(getArenaState()))

app.post('/__control/verify', async (c) => {
  const arenaState = getArenaState()
  const variant = arenaState.variant
  const orders = getOrders()

  const checks: Record<string, boolean | string> = {
    variant,
    variantActive: true,
  }

  switch (variant) {
    case 'C0':
      checks.normalFlow = true
      break
    case 'C1':
      checks.overlayPresent = true
      checks.overlayClosable = true
      break
    case 'C2':
      checks.overlayPresent = true
      checks.overlayClosable = false
      break
    case 'C3':
      checks.buttonRenamed = true
      checks.buttonMoved = true
      break
    case 'C4': {
      const rejectedOrders = orders.filter((o) => o.status === 'rejected')
      checks.paymentRejected = rejectedOrders.length > 0 || 'no orders yet'
      checks.hasRetryOption = true
      break
    }
    case 'C5': {
      checks.paymentAlwaysFails = true
      checks.retryNeverSucceeds = true
      checks.retryCount = String(arenaState.paymentRetryCount)
      break
    }
  }

  return c.json(checks)
})

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[arena-api] listening on http://localhost:${PORT}`)
})

export { app }
