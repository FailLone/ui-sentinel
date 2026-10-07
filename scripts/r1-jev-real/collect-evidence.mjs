import { spawnSync, execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, readdirSync, lstatSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { createHash } from 'node:crypto'
const root = process.cwd()
const out = resolve(process.argv[2] ?? 'artifacts/r1-jev-real/free-evidence')
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
  throw Error('clean-commit-required')
mkdirSync(out, { recursive: false })
const hash = (x) => createHash('sha256').update(x).digest('hex')
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const version = (command) => execFileSync(command[0], command.slice(1), { encoding: 'utf8' }).trim()
const steps = [
  ['preflight', ['node', 'plans/r1-jev-input/preflight.mjs'], 'none'],
  ['typecheck', ['pnpm', 'exec', 'tsc', '--noEmit'], 'none'],
  ['old-tests', ['pnpm', 'r1:jev:test'], 'offline'],
  ['new-tests', ['pnpm', 'r1:jev:real:test'], 'loopback'],
  [
    'dry-run',
    [
      'pnpm',
      'r1:jev:real',
      '--',
      '--dry-run',
      '--config',
      'plans/r1-jev-real/development-config.json',
      '--output',
      join(out, 'dry'),
    ],
    'offline',
  ],
  ['verify-dry', ['pnpm', 'r1:jev:verify', '--', '--evidence', join(out, 'dry')], 'offline'],
]
const commands = []
for (const [name, argv, network] of steps) {
  const trap =
    network === 'offline'
      ? 'scripts/r1-jev/network-trap.cjs'
      : network === 'loopback'
        ? 'scripts/r1-jev-real/loopback-trap.cjs'
        : null
  const start = new Date().toISOString()
  const result = spawnSync(argv[0], argv.slice(1), {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      NODE_OPTIONS: trap ? `--require ${JSON.stringify(resolve(trap))}` : '',
      R1_JEV_API_KEY: '',
      OPENROUTER_API_KEY: '',
      COMPLETION_REVIEW_API_KEY: '',
    },
  })
  writeFileSync(join(out, `${name}.log`), (result.stdout ?? '') + (result.stderr ?? ''))
  commands.push({
    name,
    argv,
    network,
    start,
    end: new Date().toISOString(),
    exitCode: result.status,
    signal: result.signal,
    log: `${name}.log`,
    sourceSha,
  })
}
writeFileSync(
  join(out, 'verification.json'),
  JSON.stringify(
    {
      version: 'r1-free-verification-1',
      sourceSha,
      node: process.version,
      pnpm: version(['pnpm', '--version']),
      git: version(['git', '--version']),
      lockSha256: hash(readFileSync('pnpm-lock.yaml')),
      configSha256: hash(readFileSync('plans/r1-jev-real/development-config.json')),
      pathMappings: { [root]: 'repository checkout at sourceSha', [out]: '.' },
      commands,
      realModel: 'not-run',
      passed: commands.every((c) => c.exitCode === 0),
    },
    null,
    2,
  ) + '\n',
)
function files(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((n) => {
      const p = join(dir, n)
      return lstatSync(p).isDirectory() ? files(p) : [p]
    })
}
writeFileSync(
  join(out, 'manifest.json'),
  JSON.stringify(
    {
      version: 'r1-jev-evidence-1',
      files: files(out).map((p) => ({ path: relative(out, p), sha256: hash(readFileSync(p)) })),
    },
    null,
    2,
  ) + '\n',
)
if (commands.some((c) => c.exitCode !== 0)) process.exitCode = 1
console.log(
  JSON.stringify(
    {
      sourceSha,
      passed: commands.every((c) => c.exitCode === 0),
      commands: commands.map(({ name, exitCode }) => ({ name, exitCode })),
    },
    null,
    2,
  ),
)
