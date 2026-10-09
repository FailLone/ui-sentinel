/** Collect actual commands and raw output against a committed tree. No model calls. */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, relative, isAbsolute } from 'node:path'
const root = process.cwd()
const output = process.argv[2]
if (!output || isAbsolute(output) || output.split(/[\\/]/).includes('..'))
  throw Error('relative-output-required')
const out = resolve(root, output)
if (existsSync(out)) throw Error('output-must-be-new')
let ancestor = root
for (const part of output.split('/')) {
  ancestor = resolve(ancestor, part)
  if (existsSync(ancestor) && lstatSync(ancestor).isSymbolicLink()) throw Error('output-symlink')
}
mkdirSync(out, { recursive: true })
const hash = (b) => createHash('sha256').update(b).digest('hex')
const git = (args) => {
  const r = spawnSync('git', args, { encoding: 'utf8' })
  if (r.status) throw Error('git-failed')
  return r.stdout.trim()
}
const commit = git(['rev-parse', 'HEAD'])
if (git(['status', '--porcelain=v1', '--untracked-files=all']))
  throw Error(
    'clean-committed-tree-required; exclude only generated artifacts/store via .git/info/exclude',
  )
const commands = []
const config = Object.fromEntries(
  [
    'package.json',
    'pnpm-lock.yaml',
    'plans/r1-jev-input/vitest.r1.config.ts',
    'evaluation/r1-jev-dev/manifest.json',
    'scripts/r1-jev/network-trap.cjs',
  ].map((p) => [p, hash(readFileSync(p))]),
)
const run = (name, argv, env = process.env) => {
  const startedAt = new Date().toISOString()
  const result = spawnSync(argv[0], argv.slice(1), {
    encoding: 'utf8',
    env,
    maxBuffer: 20 * 1024 * 1024,
  })
  const log = `${name}.log`
  writeFileSync(
    resolve(out, log),
    (result.stdout ?? '') + (result.stderr ?? '') + (result.error ? String(result.error) : ''),
  )
  commands.push({
    name,
    argv,
    cwd: '.',
    sourceCommit: commit,
    config,
    startedAt,
    endedAt: new Date().toISOString(),
    exitCode: result.status,
    signal: result.signal,
    log,
  })
  writeFileSync(resolve(out, 'commands.json'), JSON.stringify(commands, null, 2) + '\n')
  console.log(`${name}: exit ${result.status}`)
  if (result.status !== 0) throw Error(`verification-failed:${name}`)
}
run('01-preflight', [process.execPath, 'plans/r1-jev-input/preflight.mjs'])
run('02-versions', [
  process.execPath,
  '-e',
  'console.log(JSON.stringify({node:process.version,versions:process.versions,platform:process.platform,arch:process.arch},null,2))',
])
run('03-types', ['pnpm', 'exec', 'tsc', '--noEmit'])
const trap = resolve('scripts/r1-jev/network-trap.cjs')
// trap is inherited into child processes, unlike patching fetch in the collector itself.
const trapped = {
  ...process.env,
  NODE_OPTIONS: `--require ${JSON.stringify(trap)}`,
  OPENROUTER_API_KEY: 'synthetic-must-not-be-used',
  AGENT_MODEL: 'synthetic-must-not-be-read',
}
run(
  '04-trap-positive-control',
  [
    process.execPath,
    '-e',
    "let n=0;for(const f of [()=>fetch('https://example.invalid'),()=>require('node:https').get('https://example.invalid'),()=>require('node:net').connect(9,'127.0.0.1')]){try{f()}catch(e){if(String(e).includes('r1-network-trap:'))n++;else throw e}}console.log({blocked:n});if(n!==3)process.exit(1)",
  ],
  trapped,
)
run(
  '05-tests',
  [
    process.execPath,
    'node_modules/vitest/vitest.mjs',
    'run',
    '--config',
    'plans/r1-jev-input/vitest.r1.config.ts',
  ],
  trapped,
)
const changed = git([
  'diff',
  '--name-only',
  '--diff-filter=ACMR',
  'c15f0ff3af50bc8c77da429a706432e8df739cde',
  'HEAD',
])
  .split('\n')
  .filter((p) => /\.(?:[cm]?js|ts|json)$/.test(p))
run('06-format', ['pnpm', 'exec', 'biome', 'format', ...changed])
for (const name of ['a', 'b'])
  run(
    `07-offline-${name}`,
    [
      process.execPath,
      '--import',
      'tsx',
      'scripts/r1-jev/offline-cli.ts',
      '--output',
      `${output}/offline-${name}`,
    ],
    trapped,
  )
run(
  '08-determinism',
  [
    process.execPath,
    '--import',
    'tsx',
    '--input-type=module',
    '-e',
    `import {readFileSync} from 'node:fs';import {stripVolatile} from './scripts/r1-jev/offline-cli.ts'; const a=stripVolatile(readFileSync(${JSON.stringify(output + '/offline-a/results.jsonl')},'utf8')); const b=stripVolatile(readFileSync(${JSON.stringify(output + '/offline-b/results.jsonl')},'utf8'));if(a!==b)throw Error('nondeterministic');console.log('PASS: all deterministic fields equal; raw timing preserved')`,
  ],
  trapped,
)
run(
  '09-real-dry-run',
  [
    process.execPath,
    '--import',
    'tsx',
    'scripts/r1-jev/offline-cli.ts',
    '--real',
    '--dry-run',
    '--output',
    `${output}/real-plan`,
  ],
  trapped,
)
run('10-status', ['git', 'status', '--porcelain=v1', '--untracked-files=all'])
run('11-diff-scope', ['git', 'diff', '--stat', 'c15f0ff3af50bc8c77da429a706432e8df739cde', 'HEAD'])
writeFileSync(
  resolve(out, 'path-map.json'),
  JSON.stringify(
    {
      sourceCommit: commit,
      mappings: [
        {
          from: root,
          to: 'imported-checkout',
          sourceBundle: '../code/r1-jev-closeout.bundle',
          note: 'imported-checkout is generated by the documented bundle import. Remaining suffix is a tracked Git path; no remote absolute file is required.',
        },
      ],
      evidenceRoot: '.',
    },
    null,
    2,
  ) + '\n',
)
const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir).sort()) {
    const p = resolve(dir, name)
    const st = lstatSync(p)
    if (st.isSymbolicLink()) throw Error('symlink-evidence')
    if (st.isDirectory()) walk(p)
    else if (p !== resolve(out, 'index.json'))
      files.push({
        path: relative(out, p),
        sha256: hash(readFileSync(p)),
        bytes: st.size,
        sourceCommit: commit,
      })
  }
}
walk(out)
writeFileSync(
  resolve(out, 'index.json'),
  JSON.stringify(
    {
      schemaVersion: 'r1-evidence-index-2',
      sourceCommit: commit,
      files,
      note: 'Index excludes itself; outer SHA256SUMS covers it.',
    },
    null,
    2,
  ) + '\n',
)
console.log(`Evidence collected for ${commit}; ${files.length} files`)
