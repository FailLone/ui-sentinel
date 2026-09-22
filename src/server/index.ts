import 'dotenv/config'
import { serve } from '@hono/node-server'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { loadEnabledProposals } from '../rules/proposal.ts'
import { reconcileInterruptedRuns } from '../execution/executor.ts'
import { config, checkModelConfig } from '../shared/config.ts'
import { initDatabase } from '../storage/database.ts'
import { registerBuiltinRules } from '../rules/builtin/index.ts'
import { healthRoutes } from './routes/health.ts'
import { runRoutes } from './routes/runs.ts'
import { findingRoutes } from './routes/findings.ts'
import { proposalRoutes } from './routes/proposals.ts'

import { evaluationRoutes } from './evaluation-access.ts'

const app = new Hono()
app.route('/', evaluationRoutes)

app.use('/api/*', async (c, next) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin)
    return c.json({ error: 'cross-origin request denied' }, 403)
  await next()
})
app.onError((err, c) =>
  c.json(
    {
      error: 'request-failed',
      message: err instanceof SyntaxError ? 'Invalid JSON' : 'Request failed',
    },
    err instanceof SyntaxError ? 400 : 500,
  ),
)
app.use('/assets/*', serveStatic({ root: './dist/web' }))

app.route('/', healthRoutes)
app.route('/', runRoutes)
app.route('/', findingRoutes)
app.route('/', proposalRoutes)

app.get('/', async (c) => {
  const html = await readFile(resolve('dist/web/index.html'), 'utf-8')
  return c.html(html)
})

async function main() {
  console.log('[ui-sentinel] initializing database...')
  await initDatabase()
  console.log('[ui-sentinel] database ready')

  await reconcileInterruptedRuns()
  registerBuiltinRules()
  await loadEnabledProposals()
  console.log('[ui-sentinel] rules registered')

  const modelCheck = checkModelConfig()
  if (!modelCheck.ready) {
    console.warn(`[ui-sentinel] model not configured (missing: ${modelCheck.missing.join(', ')})`)
  }

  serve({ fetch: app.fetch, port: config.port, hostname: '127.0.0.1' }, (info) => {
    console.log(`[ui-sentinel] server listening on http://localhost:${info.port}`)
    console.log(`[ui-sentinel] health: http://localhost:${info.port}/api/health`)
  })
}

main().catch((err) => {
  console.error('[ui-sentinel] startup failed:', err)
  process.exit(1)
})

export { app }
