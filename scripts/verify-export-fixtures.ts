import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertTruth,
  expectedTruth,
  resetAndVerifyExport,
  type ExportVariantId,
} from '../evaluation/private/export/controller.ts'

/**
 * Independent verification of the export arena's five variants.
 *
 * This drives the *built* server and the *built* arena with a real Chromium, and checks each
 * variant's private business truth against what it declares. It makes no model request: it proves
 * the fixture is executable and stable, and explicitly does not claim that an agent found anything.
 */
async function freePort() {
  const s = createServer()
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  const p = (s.address() as { port: number }).port
  await new Promise<void>((r) => s.close(() => r()))
  return p
}

const dir = await mkdtemp(join(tmpdir(), 'sentinel-export-'))
const env = {
  ...process.env,
  PORT: String(await freePort()),
  ARENA_PORT: String(await freePort()),
  ARENA_API_PORT: String(await freePort()),
  ARENA_CONTROL_PORT: String(await freePort()),
  ARENA_CONTROL_TOKEN: randomBytes(32).toString('hex'),
  EXPORT_ARENA_PORT: String(await freePort()),
  EXPORT_API_PORT: String(await freePort()),
  EXPORT_CONTROL_PORT: String(await freePort()),
  EXPORT_CONTROL_TOKEN: randomBytes(32).toString('hex'),
  DATABASE_URL: `file:${join(dir, 'runs.db')}`,
  AGENT_MODEL: '',
  VISION_MODEL: '',
  ARENA_STATIC: '1',
  EXPORT_ARENA_STATIC: '1',
}
Object.assign(process.env, env)

const children = [
  spawn(process.execPath, ['dist/server/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] }),
  spawn(process.execPath, ['dist/arena/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] }),
  spawn(process.execPath, ['dist/arena-export/index.js'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  }),
]
let logs = ''
for (const c of children) {
  c.stdout.on('data', (s) => (logs += String(s)))
  c.stderr.on('data', (s) => (logs += String(s)))
}

const api = `http://127.0.0.1:${env.EXPORT_ARENA_PORT}`
const control = `http://127.0.0.1:${env.EXPORT_CONTROL_PORT}`
const server = `http://127.0.0.1:${env.PORT}`
const token = env.EXPORT_CONTROL_TOKEN
const variants: ExportVariantId[] = ['E0', 'E1', 'E2', 'E3', 'E4']

try {
  // All three services must be up: a readiness check that only watches the arena would let the
  // private controller read against a server that has not finished starting.
  let ready = false
  for (let i = 0; i < 120; i++) {
    try {
      if (
        (await fetch(`${server}/api/health`)).ok &&
        (await fetch(api)).ok &&
        (await fetch(`${api}/api/exports/ui`)).ok
      ) {
        ready = true
        break
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  if (!ready) throw new Error(`Export arena did not become ready: ${logs}`)

  // Isolation: the controller rejects unauthenticated callers, and the public origin serves no
  // private or source route. A browser must not be able to reach the answer key.
  if ((await fetch(`${control}/__control/state`)).status !== 401)
    throw new Error('Private export control must reject unauthenticated access')
  for (const path of [
    '/__control/state',
    '/src/server/state.ts',
    '/evaluation/private/export/controller.ts',
    '/answers.json',
  ])
    if ((await fetch(`${api}${path}`)).status !== 404)
      throw new Error(`Private/source route exposed on the public origin: ${path}`)

  const checks: Record<string, unknown>[] = []
  for (const variant of variants) {
    const observed = await resetAndVerifyExport(variant)
    assertTruth(variant, observed.truth)
    checks.push({ variant, ...observed, expected: expectedTruth(variant) })
    console.log(`${variant}: fixture verified (${JSON.stringify(observed.truth)})`)
  }

  await mkdir('data/verification', { recursive: true })
  await writeFile(
    'data/verification/export-fixtures.json',
    JSON.stringify({ realModel: false, at: new Date().toISOString(), checks }, null, 2),
  )
  console.log(
    'Production boot, private isolation and all five export variants passed; this is not an Agent/model evaluation.',
  )
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  for (const c of children) c.kill('SIGTERM')
  await Promise.all(
    children.map(
      (c) =>
        new Promise<void>((r) => {
          if (c.exitCode !== null) return r()
          c.once('exit', () => r())
          setTimeout(() => {
            c.kill('SIGKILL')
            r()
          }, 2000).unref()
        }),
    ),
  )
  await rm(dir, { recursive: true, force: true })
}
