import 'dotenv/config'
import { serveStatic } from '@hono/node-server/serve-static'
import { randomBytes } from 'node:crypto'
import { serve } from '@hono/node-server'
import { createCheckoutApp } from './app.ts'

const PORT = Number(process.env.ARENA_API_PORT ?? 4174)
const controlToken = process.env.ARENA_CONTROL_TOKEN ?? randomBytes(32).toString('hex')

const { app, control } = createCheckoutApp({ controlToken })

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
