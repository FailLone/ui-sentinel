import 'dotenv/config'
import { serveStatic } from '@hono/node-server/serve-static'
import { serve } from '@hono/node-server'
import { randomBytes } from 'node:crypto'
import { createExportApp } from './app.ts'

/**
 * Production entry for the dataset-export arena.
 *
 * Kept separate from the app factory so importing the factory - as the tests do - cannot start a
 * server or bind a port as a side effect.
 */
const controlToken = process.env.EXPORT_CONTROL_TOKEN ?? randomBytes(32).toString('hex')
const apiPort = Number(process.env.EXPORT_API_PORT ?? 4184)
const arenaPort = Number(process.env.EXPORT_ARENA_PORT ?? 4183)
const controlPort = Number(process.env.EXPORT_CONTROL_PORT ?? 4185)
const serverBaseUrl = process.env.SERVER_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? 4111}`

/** Whether a run is active, queued or awaiting reconciliation. */
const isBusy = async () => {
  try {
    // The server's own statement of whether anything is queued, running or awaiting
    // reconciliation - the same condition the reset is meant to respect.
    const res = await fetch(`${serverBaseUrl}/api/execution/status`, {
      signal: AbortSignal.timeout(1500),
    })
    if (!res.ok) return true
    return Boolean((await res.json()).busy)
  } catch {
    // An unreachable server is not proof of idleness, so refuse the reset rather than risk it.
    return true
  }
}

const { app, control } = createExportApp({ controlToken, isBusy })

if (process.env.EXPORT_ARENA_STATIC === '1') {
  app.use('/*', serveStatic({ root: './arena/export/dist' }))
  serve({ fetch: app.fetch, port: arenaPort, hostname: '127.0.0.1' })
}
serve({ fetch: app.fetch, port: apiPort, hostname: '127.0.0.1' })
serve({ fetch: control.fetch, port: controlPort, hostname: '127.0.0.1' })
