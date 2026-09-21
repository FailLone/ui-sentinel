import 'dotenv/config'
import { serve } from '@hono/node-server'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { config, checkModelConfig } from '../shared/config.ts'
import { initDatabase } from '../storage/database.ts'
import { registerBuiltinRules } from '../rules/builtin/index.ts'
import { healthRoutes } from './routes/health.ts'
import { runRoutes } from './routes/runs.ts'
import { findingRoutes } from './routes/findings.ts'
import { proposalRoutes } from './routes/proposals.ts'

const app = new Hono()

app.use('*', cors())

app.route('/', healthRoutes)
app.route('/', runRoutes)
app.route('/', findingRoutes)
app.route('/', proposalRoutes)

app.get('/', async (c) => {
  const html = await readFile(resolve('src/web/workbench.html'), 'utf-8')
  return c.html(html)
})

async function main() {
  console.log('[ui-sentinel] initializing database...')
  await initDatabase()
  console.log('[ui-sentinel] database ready')

  registerBuiltinRules()
  console.log('[ui-sentinel] rules registered')

  const modelCheck = checkModelConfig()
  if (!modelCheck.ready) {
    console.warn(`[ui-sentinel] model not configured (missing: ${modelCheck.missing.join(', ')})`)
  }

  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`[ui-sentinel] server listening on http://localhost:${info.port}`)
    console.log(`[ui-sentinel] health: http://localhost:${info.port}/api/health`)
  })
}

main().catch((err) => {
  console.error('[ui-sentinel] startup failed:', err)
  process.exit(1)
})

export { app }
