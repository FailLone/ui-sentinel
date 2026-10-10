import { batchExitCode } from './exit-code.ts'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { build } from 'esbuild'
import { POLICY, P02_POLICY } from './policy.ts'
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
  const focused =
    mode === '--freeze-p02' ||
    (['--run', '--dry-run'].includes(mode ?? '') &&
      JSON.parse(readFileSync(resolve(a!), 'utf8')).profile === 'P02')
  const policy = focused ? P02_POLICY : POLICY
  const selectedRows = focused ? rows.filter((r) => r.id === 'P02') : rows
  const scoring = focused ? expectedRows.filter((r) => r.id === 'P02') : expectedRows
  if (mode === '--freeze' || mode === '--freeze-p02') {
    const output = resolve(a ?? 'data/parallel-check-tasks/real-preparation')
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
    const quotes = await publishedQuotes(policy)
    const bundle = resolve(output, 'runtime.mjs')
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
      version: policy.version,
      profile: focused ? 'P02' : 'all',
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      node: process.version,
      installedDependencies: installedDependencies(),
      policy,
      sourceFiles: sourceFiles(),
      build: { path: relative(process.cwd(), bundle), sha256: hash(readFileSync(bundle)) },
      quotes,
      publicGoal,
      rows: selectedRows.map((row) => ({
        ...row,
        html: documentFor(row.path),
        htmlSha256: hash(documentFor(row.path)!),
        publicInput: {
          kind: 'ui-scan',
          entryUrl: '<fixture-origin>' + row.path,
          goal: publicGoal,
          popupCheck: { mode: 'popup-viewport' },
          budget: {
            totalTimeoutMs: policy.row.timeoutMs,
            maxActions: policy.row.maxActions,
            maxModelCalls: policy.row.maxModelCalls,
          },
        },
      })),
      privateScoring: scoring,
      freePreparationOnly: true,
      authority:
        'This manifest is a proposal. A separate human approval matching its hash is required for --run.',
      feeFormula: `${policy.mainRequests} × 0.060 + ${policy.jevRequests} × 0.003 <= ${policy.maxCostUsd} USD; one original shared account.`,
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
          maxCostUsd: policy.maxCostUsd,
          maxParents: policy.rows,
          maxMainRequests: policy.mainRequests,
          maxJevRequests: policy.jevRequests,
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
      maxCostUsd: policy.maxCostUsd,
    }
  }
  if (!['--dry-run', '--run'].includes(mode)) throw Error('use-explicit-freeze-dry-run-or-run')
  const manifestBytes = readFileSync(resolve(a)),
    manifest = JSON.parse(manifestBytes.toString())
  if (
    JSON.stringify(manifest.policy) !== JSON.stringify(policy) ||
    JSON.stringify(manifest.sourceFiles) !== JSON.stringify(sourceFiles()) ||
    manifest.build.sha256 !== hash(readFileSync(resolve(manifest.build.path))) ||
    manifest.node !== process.version ||
    JSON.stringify(manifest.installedDependencies) !== JSON.stringify(installedDependencies())
  )
    throw Error('frozen-source-build-or-node-mismatch')
  // Verify all public and private fixture inputs, not just the supplied policy object.
  if (
    manifest.publicGoal !== publicGoal ||
    JSON.stringify(manifest.privateScoring) !== JSON.stringify(scoring) ||
    manifest.rows.length !== selectedRows.length ||
    manifest.rows.some(
      (r: any, i: number) =>
        r.id !== selectedRows[i]!.id ||
        r.path !== selectedRows[i]!.path ||
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
      approval.maxCostUsd !== policy.maxCostUsd ||
      approval.maxParents !== policy.rows ||
      approval.maxMainRequests !== policy.mainRequests ||
      approval.maxJevRequests !== policy.jevRequests ||
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
  return runBatch(resolve(free ? b : c), free, manifest, approvalClaim, policy)
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
