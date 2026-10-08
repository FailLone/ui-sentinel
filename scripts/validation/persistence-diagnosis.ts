/** Bounded free entry: one self-check, or one existing API scenario + one small parallel test. */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
const mode = process.argv[2] ?? 'self-check'
if (!['self-check', 'api'].includes(mode)) throw Error('Use self-check or api; no loop/retry mode.')
const root = resolve(
  'data/r0-persistence-repair',
  mode + '-' + new Date().toISOString().replace(/[:.]/g, '-'),
)
await mkdir(root, { recursive: true })
const plan = {
  mode,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  realModels: 0,
  paidCostUsd: 0,
  newBrowserRuns: mode === 'api' ? 1 : 0,
  stop: 'one invocation; any failure retained; no retry/next batch',
  question:
    mode === 'self-check'
      ? 'Do controlled transaction, stale-reader, file-replacement, zero-change mechanisms produce distinct bounded evidence without logging user values?'
      : 'Does one real API/SDK/Chromium run, under an explicitly reduced separate-process parallel read/write test, show a first file/transaction/view mismatch?',
  limitations: [
    'parallel workload is smaller than the original 66+5 tests; not a reconstruction of their timing',
    'synchronous tracing and optional independent read-back change timing',
    'injection/self-check does not attribute original failure',
  ],
}
await writeFile(resolve(root, 'plan.json'), JSON.stringify(plan, null, 2) + '\n')
async function run(label: string, command: string, args: string[], env = process.env) {
  return new Promise<{ label: string; exitCode: number | null; output: string }>((done, reject) => {
    const child = spawn(command, args, {
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
    child.stdout.on('data', (b) => {
      output += String(b)
      process.stdout.write(b)
    })
    child.stderr.on('data', (b) => {
      output += String(b)
      process.stderr.write(b)
    })
    child.on('error', reject)
    child.on('exit', async (exitCode) => {
      clearTimeout(timer)
      await writeFile(resolve(root, label + '.log'), output)
      done({ label, exitCode, output })
    })
  })
}
const pnpm = 'pnpm'
const results =
  mode === 'self-check'
    ? [
        await run(
          'self-check',
          pnpm,
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
    : await Promise.all([
        run(
          'api',
          pnpm,
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
          },
        ),
        run('parallel-poll', pnpm, [
          'exec',
          'vitest',
          'run',
          'src/execution/completion-integrity.test.ts',
          '-t',
          'retains every acknowledged event',
          '--reporter=json',
          '--outputFile=' + resolve(root, 'parallel-test.json'),
        ]),
      ])
await writeFile(
  resolve(root, 'results.json'),
  JSON.stringify(
    results.map(({ output: _, ...r }) => r),
    null,
    2,
  ) + '\n',
)
console.log(
  JSON.stringify({
    evidenceRoot: root,
    allExitCodesZero: results.every((r) => r.exitCode === 0),
    paidCostUsd: 0,
  }),
)
if (results.some((r) => r.exitCode !== 0)) process.exitCode = 1
