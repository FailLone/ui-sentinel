// Delivery-input integrity check only; no product logic, dependency install, or network.
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve, relative, isAbsolute } from 'node:path'

const root = process.cwd()
const fail = (message) => {
  throw new Error(message)
}
const read = (p) => readFileSync(resolve(root, p))
const json = (p) => JSON.parse(read(p))
const hash = (b) => createHash('sha256').update(b).digest('hex')
const safe = (p) => {
  const rel = relative(root, resolve(root, p))
  if (isAbsolute(p) || !rel || rel.startsWith('..') || isAbsolute(rel)) fail(`unsafe-path:${p}`)
  return p
}
if (Number(process.versions.node.split('.')[0]) !== 24) fail('Node 24.x required for this handoff')
const packageJson = json('package.json')
if (packageJson.packageManager !== 'pnpm@10.17.1') fail('package-manager-mismatch')
const pnpmVersion = execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim()
if (pnpmVersion !== '10.17.1') fail(`pnpm-version:${pnpmVersion}`)
const pnpmNode = execFileSync('pnpm', ['exec', 'node', '--version'], { encoding: 'utf8' }).trim()
if (!pnpmNode.startsWith('v24.')) fail(`pnpm-uses-different-runtime:${pnpmNode}`)
const provenance = json('plans/r1-jev-input/source-provenance.json')
// package/lock are permitted to change with explicit dependency justification in dev delivery.
const mutable = new Set(['package.json', 'pnpm-lock.yaml'])
for (const file of provenance.files) {
  safe(file.path)
  if (!mutable.has(file.path) && hash(read(file.path)) !== file.sha256)
    fail(`reference-modified:${file.path}`)
}
if (hash(read(provenance.roadmap.path)) !== provenance.roadmap.sha256)
  fail('roadmap-snapshot-modified')
const manifest = json('evaluation/r1-jev-dev/manifest.json')
let count = 0
if (manifest.cases.length < 22) fail('required-seed-cases-missing')
for (const scenario of manifest.cases) {
  for (const file of scenario.files) {
    safe(file.path)
    if (hash(read(file.path)) !== file.sha256) fail(`fixture-hash:${file.path}`)
    JSON.parse(read(file.path))
    count++
  }
}
for (const path of ['.env', '.env.local', 'evaluation/private', 'data']) {
  if (existsSync(resolve(root, path))) fail(`unexpected-private-or-shared-material:${path}`)
}
console.log(
  JSON.stringify(
    {
      status: 'input-integrity-passed',
      node: process.version,
      pnpm: pnpmVersion,
      pnpmNode,
      git: execFileSync('git', ['--version'], { encoding: 'utf8' }).trim(),
      sourceOrigin: provenance.sourceCommit,
      head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      cases: manifest.cases.length,
      fixtureFiles: count,
      note: 'Not product tests, semantic schema validation, or Jev quality acceptance.',
    },
    null,
    2,
  ),
)
