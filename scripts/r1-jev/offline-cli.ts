/**
 * `pnpm r1:jev:offline -- --output <package-relative dir>`
 *
 * Free, offline replay of the committed seed set. Default mode is `stub`: fixed responses, no
 * network, no key, no dotenv. `--real` is a DRY-RUN PLAN only and stays unauthorized.
 *
 * The two columns (program baseline, program + stub) are emitted separately and the real-model
 * row is explicitly "not-run". No coverage, discovery, time or cost claim is made.
 */
import { mkdirSync, writeFileSync, existsSync, lstatSync } from 'node:fs'
import { resolve, relative, isAbsolute } from 'node:path'
import { runOfflineCase } from './offline-runner.ts'

const PACKAGE_ROOT = process.cwd()

export type OfflineOptions = {
  readonly output: string
  readonly real?: boolean
  readonly dryRun?: boolean
}

/** Fields that legitimately vary run to run. Excluded only from the determinism comparison. */
const VOLATILE = [
  'durationMs',
  'transportMs',
  'startedAt',
  'finishedAt',
  'attemptId',
  'timestamp',
  'timeZone',
] as const

export function stripVolatile(jsonl: string): string {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize)
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => !(VOLATILE as readonly string[]).includes(key))
          .map(([key, v]) => [key, normalize(v)]),
      )
    return value
  }
  return jsonl
    .trim()
    .split('\n')
    .map((line) => JSON.stringify(normalize(JSON.parse(line))))
    .join('\n')
}

function safeOutput(output: string): string {
  const absolute = resolve(PACKAGE_ROOT, output)
  const rel = relative(PACKAGE_ROOT, absolute)
  // Refuse absolute paths, escapes and symlink-ish traversal out of the package.
  if (isAbsolute(output) || !rel || rel.startsWith('..') || isAbsolute(rel))
    throw new Error(`outside-package:${output}`)
  let parent = PACKAGE_ROOT
  for (const component of rel.split('/')) {
    parent = resolve(parent, component)
    if (existsSync(parent) && lstatSync(parent).isSymbolicLink())
      throw new Error('output-symlink-refused')
  }
  return absolute
}

export async function runOfflineCli(options: OfflineOptions): Promise<number> {
  const dir = safeOutput(options.output)
  mkdirSync(dir, { recursive: true })

  if (options.real && !options.dryRun)
    throw new Error('real-not-authorized: run with --real --dry-run to emit a plan only')

  if (options.real && options.dryRun) {
    // Planning output only. Nothing is dispatched and no provider is contacted.
    writeFileSync(
      `${dir}/real-plan.json`,
      `${JSON.stringify(
        {
          schemaVersion: 'r1-jev-real-plan-1',
          authorized: false,
          requiresSeparateAuthorization: true,
          modelCompatibility: 'unverified',
          adapterRevision: null,
          candidates: ['<exact model id to be fixed at authorization time>'],
          samples: 22,
          runs: 0,
          independentPriceSource: 'unknown',
          priceObservedAt: null,
          inputCeilingBytes: 32768,
          stopOnUnknownCost: true,
          notes: [
            'No R0 budget, authorization or ledger is reused here.',
            'Model capability and pricing are unknown and must be established before any call.',
          ],
        },
        null,
        2,
      )}\n`,
    )
    return 0
  }

  const cases = await runOfflineCase()
  const rows = cases.map((entry) => {
    const { startedAt, durationMs } = entry
    return {
      ...entry,
      scenario: entry.scenario,
      outcome: entry.stubOutcome,
      baselineOutcome: entry.baselineOutcome,
      reasonCode: entry.stubReasonCode,
      baselineReasonCode: entry.baselineReasonCode,
      expected: { baseline: entry.expectedBaseline, stub: entry.expectedStub },
      orderedCandidateIds: entry.orderedCandidateIds,
      transmissions: entry.transmissions,
      checks: entry.checks,
      reason: entry.reason,
      rotation: entry.rotation,
      versions: {
        contract: 'r1-exploration-contract-1',
        policy: 'r1-exploration-policy-2',
        prompt: 'r1-exploration-prompt-2',
      },
      usage: { mode: 'stub', billable: false },
      realModel: entry.realModel,
      startedAt,
      durationMs,
    }
  })

  writeFileSync(`${dir}/results.jsonl`, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`)
  // `baselineOutcome` is its own column; the stub branch is the row's primary `outcome`.
  const count = (field: 'baselineOutcome' | 'outcome', value: string) =>
    rows.filter((r) => r[field] === value).length
  writeFileSync(
    `${dir}/summary.json`,
    `${JSON.stringify(
      {
        schemaVersion: 'r1-jev-offline-summary-1',
        cases: rows.length,
        baselineRanked: count('baselineOutcome', 'ranked'),
        baselineHandoff: count('baselineOutcome', 'handoff'),
        baselineInvalidInput: count('baselineOutcome', 'invalid-input'),
        stubRanked: count('outcome', 'ranked'),
        stubHandoff: count('outcome', 'handoff'),
        stubInvalidInput: count('outcome', 'invalid-input'),
        realModel: 'not-run',
        claims: [],
        note: 'Fixed responses prove wiring and defensive handling only. They do not establish Jev judgement quality, anti-injection quality, or any coverage/time/cost improvement.',
      },
      null,
      2,
    )}\n`,
  )
  return cases.every(
    (c) => c.stubOutcome === c.expectedStub && c.baselineOutcome === c.expectedBaseline,
  )
    ? 0
    : 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const outputIndex = args.indexOf('--output')
  const output = outputIndex >= 0 ? args[outputIndex + 1] : undefined
  if (!output) {
    console.error('usage: pnpm r1:jev:offline -- --output <package-relative dir>')
    process.exit(2)
  }
  try {
    const code = await runOfflineCli({
      output,
      real: args.includes('--real'),
      dryRun: args.includes('--dry-run'),
    })
    process.exit(code)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
