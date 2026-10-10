import { batchExitCode } from './exit-code.ts'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { build } from 'esbuild'
import { POLICY } from './policy.ts'
import { rows, publicGoal, documentFor } from './fixtures.ts'
import { expectedRows } from './score.ts'
import { publishedQuotes } from './quote.ts'
import { runBatch } from './run.ts'
const hash = (x: string | Buffer) => createHash('sha256').update(x).digest('hex')
function installedDependencies() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  return {
    lockSha256: hash(readFileSync('node_modules/.pnpm/lock.yaml')),
    versions: Object.fromEntries(
      Object.keys(pkg.dependencies)
        .sort()
        .map((name) => [
          name,
          JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version,
        ]),
    ),
  }
}
function sourceFiles() {
  const files = execFileSync(
    'git',
    ['ls-files', 'src', 'scripts', 'evaluation', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json'],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
  return Object.fromEntries(files.map((f) => [f, hash(readFileSync(f))]))
}
const [mode, a, b, c] = process.argv.slice(2)
async function main() {
  if (process.env.DOTENV_CONFIG_PATH !== '/dev/null') throw Error('explicit-empty-dotenv-required')
  if (mode === '--freeze') {
    const output = resolve(a ?? 'plans/parallel-check-tasks/real-preparation')
    if (existsSync(resolve(output, 'manifest.json'))) throw Error('freeze-already-exists')
    if (
      execFileSync(
        'git',
        [
          'diff',
          '--name-only',
          'HEAD',
          '--',
          'src',
          'scripts',
          'evaluation',
          'package.json',
          'pnpm-lock.yaml',
        ],
        { encoding: 'utf8' },
      ).trim()
    )
      throw Error('commit-runtime-before-freeze')
    mkdirSync(output, { recursive: true })
    mkdirSync('data/parallel-popup-prepared', { recursive: true })
    const quotes = await publishedQuotes()
    const bundle = resolve('data/parallel-popup-prepared/runtime.mjs')
    await build({
      entryPoints: ['scripts/parallel-popup-real/cli.ts'],
      outfile: bundle,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node24',
      packages: 'external',
    })
    const manifest = {
      version: POLICY.version,
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      node: process.version,
      installedDependencies: installedDependencies(),
      policy: POLICY,
      sourceFiles: sourceFiles(),
      build: { path: relative(process.cwd(), bundle), sha256: hash(readFileSync(bundle)) },
      quotes,
      publicGoal,
      rows: rows.map((row) => ({
        ...row,
        html: documentFor(row.path),
        htmlSha256: hash(documentFor(row.path)!),
        publicInput: {
          kind: 'ui-scan',
          entryUrl: '<fixture-origin>' + row.path,
          goal: publicGoal,
          popupCheck: { mode: 'popup-viewport' },
          budget: {
            totalTimeoutMs: POLICY.row.timeoutMs,
            maxActions: POLICY.row.maxActions,
            maxModelCalls: POLICY.row.maxModelCalls,
          },
        },
      })),
      privateScoring: expectedRows,
      freePreparationOnly: true,
      authority:
        'This manifest is a proposal. A separate human approval matching its hash is required for --run.',
      feeFormula:
        '30 × 0.060 + 18 × 0.003 = 1.854 USD <= 1.860 USD; one original shared account, no separate additive wallets.',
    }
    const bytes = JSON.stringify(manifest, null, 2) + '\n'
    writeFileSync(resolve(output, 'manifest.json'), bytes, { flag: 'wx' })
    writeFileSync(
      resolve(output, 'approval.example.json'),
      JSON.stringify(
        {
          approvedBy: null,
          approvalReference: null,
          expiresAt: null,
          manifestSha256: hash(bytes),
          maxCostUsd: POLICY.maxCostUsd,
          maxParents: 3,
          maxMainRequests: 30,
          maxJevRequests: 18,
          singleBatch: true,
          retries: 0,
          oldAccountsUntouched: true,
          authorizeNewIsolatedAccount: true,
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx' },
    )
    return {
      manifest: resolve(output, 'manifest.json'),
      manifestSha256: hash(bytes),
      buildSha256: manifest.build.sha256,
      maxCostUsd: POLICY.maxCostUsd,
    }
  }
  if (!['--dry-run', '--run'].includes(mode)) throw Error('use-explicit-freeze-dry-run-or-run')
  const manifestBytes = readFileSync(resolve(a)),
    manifest = JSON.parse(manifestBytes.toString())
  if (
    JSON.stringify(manifest.policy) !== JSON.stringify(POLICY) ||
    JSON.stringify(manifest.sourceFiles) !== JSON.stringify(sourceFiles()) ||
    manifest.build.sha256 !== hash(readFileSync(resolve(manifest.build.path))) ||
    manifest.node !== process.version ||
    JSON.stringify(manifest.installedDependencies) !== JSON.stringify(installedDependencies())
  )
    throw Error('frozen-source-build-or-node-mismatch')
  // Verify all public and private fixture inputs, not just the supplied policy object.
  if (
    manifest.publicGoal !== publicGoal ||
    JSON.stringify(manifest.privateScoring) !== JSON.stringify(expectedRows) ||
    manifest.rows.length !== rows.length ||
    manifest.rows.some(
      (r: any, i: number) =>
        r.id !== rows[i]!.id ||
        r.path !== rows[i]!.path ||
        r.html !== documentFor(r.path) ||
        r.htmlSha256 !== hash(documentFor(r.path)!),
    )
  )
    throw Error('frozen-fixture-mismatch')
  const free = mode === '--dry-run'
  let approvalClaim: { manifestSha256: string; approvalReference: string } | undefined
  if (!free) {
    const approval = JSON.parse(readFileSync(resolve(b), 'utf8'))
    if (
      typeof approval.approvedBy !== 'string' ||
      !approval.approvedBy.trim() ||
      typeof approval.approvalReference !== 'string' ||
      !approval.approvalReference.trim() ||
      approval.manifestSha256 !== hash(manifestBytes) ||
      approval.maxCostUsd !== POLICY.maxCostUsd ||
      approval.maxParents !== 3 ||
      approval.maxMainRequests !== 30 ||
      approval.maxJevRequests !== 18 ||
      approval.singleBatch !== true ||
      approval.retries !== 0 ||
      approval.oldAccountsUntouched !== true ||
      approval.authorizeNewIsolatedAccount !== true ||
      !(Date.parse(approval.expiresAt) > Date.now())
    )
      throw Error('new-batch-explicit-human-approval-required')
    approvalClaim = {
      manifestSha256: hash(manifestBytes),
      approvalReference: approval.approvalReference,
    }
  }
  return runBatch(resolve(free ? b : c), free, manifest, approvalClaim)
}
main().then(
  (result) => {
    console.log(JSON.stringify(result, null, 2))
    process.exit(batchExitCode(result))
  },
  (error) => {
    console.error(String(error))
    process.exit(1)
  },
)
