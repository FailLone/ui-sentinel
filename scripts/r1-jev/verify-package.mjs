/** Verify a received archive's extracted directory; optional fresh reconstruction. */
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  existsSync,
} from 'node:fs'
import { resolve, relative, isAbsolute, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
const root = resolve(process.argv[2] ?? '.')
const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const safe = (p) => {
  if (
    typeof p !== 'string' ||
    !p ||
    isAbsolute(p) ||
    p.includes('\\') ||
    p.split('/').some((c) => c === '..' || !c) ||
    /[\r\n]/.test(p)
  )
    throw Error(`unsafe-relative-path:${p}`)
  return resolve(root, p)
}
const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = lstatSync(p)
    if (st.isSymbolicLink()) throw Error('package-symlink')
    if (st.isDirectory()) walk(p)
    else if (st.isFile()) files.push(relative(root, p))
    else throw Error('nonregular-package-member')
  }
}
walk(root)
const listed = new Set()
for (const line of readFileSync(join(root, 'SHA256SUMS'), 'utf8').trim().split('\n')) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line)
  if (!match) throw Error('invalid-sha256-line')
  const [, digest, path] = match
  if (listed.has(path) || path === 'SHA256SUMS') throw Error('duplicate-or-self-checksum')
  listed.add(path)
  if (hash(safe(path)) !== digest) throw Error(`checksum-mismatch:${path}`)
}
if (
  files
    .filter((p) => p !== 'SHA256SUMS')
    .sort()
    .join('\n') !== [...listed].sort().join('\n')
)
  throw Error('unindexed-package-files')
const manifest = JSON.parse(readFileSync(safe('delivery.json')))
if (
  manifest.schemaVersion !== 'r1-jev-closeout-package-1' ||
  manifest.bundleType !== 'full' ||
  manifest.prerequisites.length !== 0
)
  throw Error('unsupported-delivery-contract')
for (const field of ['sourceOrigin', 'inputTip', 'devTip', 'finalTip'])
  if (!/^[a-f0-9]{40}$/.test(manifest[field])) throw Error(`missing-sha:${field}`)
const evidence = JSON.parse(readFileSync(safe('evidence/index.json')))
if (evidence.sourceCommit !== manifest.finalTip) throw Error('evidence-commit-mismatch')
const evidencePaths = new Set()
for (const file of evidence.files) {
  const p = `evidence/${file.path}`
  if (
    evidencePaths.has(p) ||
    file.sourceCommit !== manifest.finalTip ||
    hash(safe(p)) !== file.sha256 ||
    lstatSync(safe(p)).size !== file.bytes
  )
    throw Error(`evidence-invalid:${p}`)
  evidencePaths.add(p)
}
if (
  files
    .filter((p) => p.startsWith('evidence/') && p !== 'evidence/index.json')
    .sort()
    .join('\n') !== [...evidencePaths].sort().join('\n')
)
  throw Error('evidence-index-incomplete')
const commands = JSON.parse(readFileSync(safe('evidence/commands.json')))
if (
  !commands.length ||
  commands.some(
    (c) =>
      c.sourceCommit !== manifest.finalTip ||
      c.exitCode !== 0 ||
      !Array.isArray(c.argv) ||
      !c.argv.length ||
      !c.startedAt ||
      !c.endedAt ||
      !evidencePaths.has(`evidence/${c.log}`),
  )
)
  throw Error('command-evidence-incomplete')
const temporary = mkdtempSync(join(tmpdir(), 'r1-jev-package-'))
const run = (argv, cwd = temporary) => {
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  if (r.status !== 0)
    throw Error(`command-failed:${argv.join(' ')}\n${r.stdout ?? ''}${r.stderr ?? ''}`)
  return r.stdout.trim()
}
run(['git', 'init', '-q'])
const bundle = safe(manifest.bundle)
if (hash(bundle) !== manifest.bundleSha256) throw Error('bundle-hash-mismatch')
run(['git', 'bundle', 'verify', bundle])
const refs = run(['git', 'bundle', 'list-heads', bundle]).split('\n')
if (!refs.includes(`${manifest.finalTip} ${manifest.ref}`)) throw Error('bundle-ref-mismatch')
run(['git', 'fetch', '-q', bundle, `${manifest.ref}:refs/heads/review`])
run(['git', 'checkout', '-q', 'review'])
if (run(['git', 'rev-parse', 'HEAD']) !== manifest.finalTip) throw Error('tip-mismatch')
for (const sha of [manifest.inputTip, manifest.devTip])
  run(['git', 'merge-base', '--is-ancestor', sha, manifest.finalTip])
for (const file of ['verify-package.mjs', 'collect-evidence.mjs', 'network-trap.cjs'])
  if (hash(join(temporary, 'scripts/r1-jev', file)) !== hash(safe(`tools/${file}`)))
    throw Error(`tool-does-not-match-commit:${file}`)
const changed = run(['git', 'diff', '--name-only', manifest.inputTip, manifest.finalTip]).split(
  '\n',
)
for (const p of changed)
  if (
    !/^(src\/agent\/decisions\/exploration\/|scripts\/r1-jev\/|evaluation\/r1-jev-dev\/|docs\/r1-jev-decision\.md$|package\.json$|pnpm-lock\.yaml$)/.test(
      p,
    )
  )
    throw Error(`out-of-scope:${p}`)
for (const command of commands) {
  if (!command.config || Object.keys(command.config).length < 4)
    throw Error('missing-config-provenance')
  for (const [path, digest] of Object.entries(command.config)) {
    safe(path)
    if (hash(join(temporary, path)) !== digest) throw Error(`config-commit-mismatch:${path}`)
  }
}
if (readFileSync(safe('evidence/10-status.log'), 'utf8').trim())
  throw Error('source-status-not-clean')
console.log(
  JSON.stringify(
    {
      materialStatus: 'PASS',
      finalTip: manifest.finalTip,
      files: listed.size,
      evidence: evidencePaths.size,
      scope: 'PASS',
      importedCheckout: temporary,
      modelQuality: 'not-evaluated',
      r1Complete: false,
    },
    null,
    2,
  ),
)
if (process.argv.includes('--rebuild')) {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw Error('Node-24-required')
  if (run(['pnpm', '--version']) !== '10.17.1') throw Error('pnpm-10.17.1-required')
  // Per-import writable directories. No developer node_modules, store, browser, DB or data reused.
  writeFileSync(join(temporary, '.git/info/exclude'), 'artifacts/\n.r1-pnpm-store/\n')
  const startedAt = new Date().toISOString()
  const install = spawnSync(
    'pnpm',
    ['install', '--frozen-lockfile', '--store-dir', '.r1-pnpm-store'],
    { cwd: temporary, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  )
  writeFileSync(
    join(temporary, '.git/r1-install.log'),
    (install.stdout ?? '') + (install.stderr ?? ''),
  )
  writeFileSync(
    join(temporary, '.git/r1-install.json'),
    JSON.stringify(
      {
        argv: ['pnpm', 'install', '--frozen-lockfile', '--store-dir', '.r1-pnpm-store'],
        startedAt,
        endedAt: new Date().toISOString(),
        exitCode: install.status,
        sourceCommit: manifest.finalTip,
      },
      null,
      2,
    ),
  )
  if (install.status !== 0) throw Error(`install-failed; log: ${temporary}/.git/r1-install.log`)
  console.log(
    run([process.execPath, 'scripts/r1-jev/collect-evidence.mjs', 'artifacts/reverification']),
  )
  console.log(`REBUILD PASS: ${temporary}/artifacts/reverification`)
}
