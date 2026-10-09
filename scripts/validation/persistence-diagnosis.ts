/** Fixed free diagnostic entry: self-check, or ONE API scenario at a controlled contention point. */
import { mkdir, writeFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
const mode = process.argv[2] ?? 'self-check'
if (mode === 'parallel-worker') {
  const directory = process.env.R0_PERSISTENCE_WORKER_DIR
  if (!directory || !resolve(directory).startsWith(resolve('data/r0-persistence-repair') + '/api-'))
    throw Error('Worker requires an isolated api-* diagnostic directory')
  process.env.DATABASE_URL = 'file:' + resolve(directory, 'parallel.db')
  const { createRun, appendEvent, getRunSnapshot } = await import(
    '../../src/execution/run-manager.ts'
  )
  const { getDbClient } = await import('../../src/storage/database.ts')
  const run = await createRun({
    goal: 'Storage diagnostic only',
    environmentId: 'diagnostic',
    entryUrl: 'http://localhost/',
  })
  await writeFile(
    resolve(directory, 'worker-ready.json'),
    JSON.stringify({ pid: process.pid, at: new Date().toISOString() }),
  )
  await Promise.all([
    (async () => {
      for (let i = 0; i < 150; i++)
        await appendEvent(run.id, 'diagnostic:acknowledged', { index: i })
    })(),
    ...Array.from({ length: 4 }, async () => {
      for (let i = 0; i < 60; i++) await getRunSnapshot(run.id)
    }),
  ])
  const snapshot = await getRunSnapshot(run.id)
  const exactHistory =
    snapshot?.events.length === 150 && snapshot.events.every((e, i) => e.seq === i)
  getDbClient().close()
  await writeFile(
    resolve(directory, 'worker-result.json'),
    JSON.stringify({
      pid: process.pid,
      at: new Date().toISOString(),
      exactHistory,
      writes: 150,
      reads: 240,
    }),
  )
  if (!exactHistory) process.exitCode = 1
} else {
  if (!['self-check', 'api'].includes(mode))
    throw Error('Use self-check or api; no loop/retry mode.')
  const root = resolve(
    'data/r0-persistence-repair',
    mode + '-' + new Date().toISOString().replace(/[:.]/g, '-'),
  )
  await mkdir(root, { recursive: true })
  await writeFile(
    resolve(root, 'plan.json'),
    JSON.stringify(
      {
        mode,
        sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        realModels: 0,
        paidCostUsd: 0,
        newBrowserRuns: mode === 'api' ? 1 : 0,
        stop: 'one invocation; bounded timers; failures retained; no retries',
        question:
          mode === 'self-check'
            ? 'Distinguish uncommitted, stale-reader, file identity, zero-update and controlled loss without logging user contents'
            : 'At the first post-action artifact INSERT, does one bounded separate-process read/write workload coincide with a captured persistence mismatch?',
        limitations: [
          'separate database, reduced workload; NOT original66+5 test timing',
          'test pause and read-back alter timing',
          'injection proves detector/mechanism, NOT original root cause',
        ],
      },
      null,
      2,
    ) + '\n',
  )
  async function run(label: string, args: string[], env = process.env) {
    return new Promise<{ label: string; exitCode: number | null }>((done, reject) => {
      const child = spawn('pnpm', args, {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      })
      let output = ''
      const timer = setTimeout(
        () => {
          if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM')
          else child.kill('SIGTERM')
        },
        mode === 'api' ? 70000 : 30000,
      )
      for (const pipe of [child.stdout, child.stderr])
        pipe.on('data', (b) => {
          output += String(b)
          process.stdout.write(b)
        })
      child.on('error', (e) => {
        clearTimeout(timer)
        reject(e)
      })
      child.on('exit', async (exitCode) => {
        clearTimeout(timer)
        await writeFile(resolve(root, label + '.log'), output)
        done({ label, exitCode })
      })
    })
  }
  async function api() {
    const apiRun = run(
      'api',
      [
        'exec',
        'tsx',
        'scripts/validation/r0-effect-exploration.ts',
        'persistence-capture',
        'linked-pass',
      ],
      {
        ...process.env,
        R0_PERSISTENCE_TRACE_DIR: resolve(root, 'trace'),
        R0_PERSISTENCE_TRACE_READ_BACK: '1',
        R0_PERSISTENCE_TRACE_CAPTURE: '1',
        R0_PERSISTENCE_BARRIER_DIR: root,
      },
    )
    const waitFile = async (name: string) => {
      const deadline = Date.now() + 10000
      while (
        !(await access(resolve(root, name)).then(
          () => true,
          () => false,
        ))
      ) {
        if (Date.now() > deadline) throw Error('diagnostic synchronization timeout: ' + name)
        await new Promise((r) => setTimeout(r, 5))
      }
    }
    let worker: ReturnType<typeof run> | undefined
    try {
      await waitFile('paused.json')
      worker = run(
        'parallel-worker',
        ['exec', 'tsx', 'scripts/validation/persistence-diagnosis.ts', 'parallel-worker'],
        {
          ...process.env,
          R0_PERSISTENCE_WORKER_DIR: root,
        },
      )
      await waitFile('worker-ready.json')
      await writeFile(resolve(root, 'release'), 'release once\n')
      return await Promise.all([apiRun, worker])
    } catch (error) {
      await writeFile(
        resolve(root, 'synchronization-error.json'),
        JSON.stringify({ error: String(error) }),
      )
      await writeFile(resolve(root, 'release'), 'release after diagnostic error\n')
      const completed = await Promise.all([apiRun, ...(worker ? [worker] : [])])
      return [...completed, { label: 'synchronization', exitCode: 1 }]
    }
  }
  const results =
    mode === 'self-check'
      ? [
          await run(
            'self-check',
            [
              'exec',
              'vitest',
              'run',
              'scripts/validation/support/persistence-trace.test.ts',
              '--reporter=json',
              '--outputFile=' + resolve(root, 'tests.json'),
            ],
            {
              ...process.env,
              R0_PERSISTENCE_SELF_CHECK_EVIDENCE: resolve(root, 'cases'),
            },
          ),
        ]
      : await api()
  await writeFile(resolve(root, 'results.json'), JSON.stringify(results, null, 2) + '\n')
  console.log(
    JSON.stringify({
      evidenceRoot: root,
      allExitCodesZero: results.every((r) => r.exitCode === 0),
      paidCostUsd: 0,
    }),
  )
  if (results.some((r) => r.exitCode !== 0)) process.exitCode = 1
}
