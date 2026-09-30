import { Hono } from 'hono'
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
  getVisualPresent,
  setVisualPresent,
  isVisualPresent,
  publicVisualToken,
  type VariantId,
} from './state.ts'

const VALID_VARIANTS = new Set<VariantId>(['C0', 'C1', 'C2', 'C3', 'C4', 'C5'])

/**
 * The checkout arena's HTTP surface, as a factory so the private controller's token check and the
 * public no-leak rule can be exercised over HTTP the way the acceptance runner uses them. The
 * production entry composes this and serves it; tests build it directly.
 */
export function createCheckoutApp(options: { controlToken: string }) {
  const app = new Hono()

  const control = new Hono()
  control.use('*', async (c, next) => {
    if (c.req.header('authorization') !== `Bearer ${options.controlToken}`)
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
    const visualPresent = getVisualPresent()
    return c.json({
      overlay: variant === 'C1' || variant === 'C2',
      overlayClosable: variant === 'C1',
      buttonRenamed: variant === 'C3',
      buttonMoved: variant === 'C3',
      // Presentation only, as an opaque token: a browser can learn how the search area is drawn,
      // never which case it is or what is expected of it. The viewport is deliberately NOT disclosed
      // here - the component lays out to whatever width the page has, so publishing a case's
      // viewport would be handing over case metadata for nothing.
      search: visualPresent === null ? null : { present: publicVisualToken(visualPresent) },
    })
  })

  control.post('/__control/reset', async (c) => {
    const body = await c.req
      .json<{ variant?: string; learningRetryAvailable?: boolean; visual?: string }>()
      .catch(() => ({}) as { variant?: string; learningRetryAvailable?: boolean; visual?: string })
    const variant = (body.variant ?? 'C0') as VariantId
    if (!VALID_VARIANTS.has(variant)) {
      return c.json({ error: `Invalid variant: ${variant}` }, 400)
    }
    if (
      body.learningRetryAvailable !== undefined &&
      (typeof body.learningRetryAvailable !== 'boolean' || variant !== 'C5')
    )
      return c.json({ error: 'Invalid learning recovery override' }, 400)
    if (body.visual !== undefined && !isVisualPresent(body.visual))
      return c.json({ error: 'Invalid visual presence' }, 400)
    resetState(variant, body.learningRetryAvailable)
    // Absent means "no search region": a plain variant run must not inherit a previous case's search UI.
    if (body.visual !== undefined) setVisualPresent(body.visual)
    return c.json({ ok: true, variant, visual: body.visual ?? null })
  })

  control.get('/__control/state', (c) => c.json({ ...getArenaState(), orders: getOrders() }))

  return { app, control }
}
