/** Only offline preparation. No --run option, credentials or HTTP client. */
import { readFileSync, mkdirSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import { preparePilot, evaluatePrepared } from './pilot.ts'
import { DEFAULT_PROFILE, sha256 } from '../../src/agent/decisions/jev-provider/profile.ts'
import { writeJson, sealEvidence } from '../r1-jev-real/evidence.ts'
import { configSchema } from '../r1-jev-real/config.ts'

const args = process.argv.slice(2)
const values: Record<string, string> = {}
for (let i = 0; i < args.length; i += 2) {
  if (!['--input', '--labels', '--output'].includes(args[i]) || !args[i + 1] || values[args[i]])
    throw new Error(
      'usage: --output NEW_DIRECTORY [--input NORMALIZED_PUBLIC_JSON] [--labels EVALUATION_ONLY_JSON]',
    )
  values[args[i]] = args[i + 1]
}
if (!values['--output'] || (values['--labels'] && !values['--input']))
  throw new Error('missing-argument')
const output = resolve(values['--output'])
if (relative(process.cwd(), output).startsWith('..') || output === process.cwd())
  throw new Error('output-must-be-a-new-directory-within-workspace')
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const sourceDirty =
  execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== ''
mkdirSync(output, { recursive: false })
if (!values['--input']) {
  writeJson(join(output, 'status.json'), {
    sourceSha,
    sourceDirty,
    expectedStates: 8,
    receivedStates: 0,
    baseline: 'awaiting-r0-export',
    jevDryRun: 'awaiting-eligible-candidates',
    networkRequests: 0,
    blockers: [
      'eight-real-states-not-supplied',
      'historical-choices-and-frozen-human-reference-not-supplied',
      'question-limit-unverified',
      'billing-bound-unverified',
      'user-authorization-not-granted',
    ],
    exactRequestList: null,
    proposedMaximumAttempts: 8,
    proposedTotalBudgetUsd: 0.25,
    reservedCostUsd: null,
    realModel: 'not-run',
  })
} else {
  const raw = JSON.parse(readFileSync(values['--input'], 'utf8'))
  const prepared = preparePilot(raw)
  writeJson(join(output, 'public-input.json'), raw)
  writeJson(join(output, 'baseline.json'), {
    sourceSha,
    sourceDirty,
    ...prepared,
    states: prepared.states.map(({ input, request, ...rest }) => rest),
  })
  let evaluation = null
  if (values['--labels']) {
    const labels = JSON.parse(readFileSync(values['--labels'], 'utf8'))
    evaluation = evaluatePrepared(prepared, labels)
    writeJson(join(output, 'evaluation', 'labels.json'), labels)
    writeJson(join(output, 'evaluation', 'program-vs-history.json'), evaluation)
  }
  const selected = prepared.states.filter((s) => s.request !== null)
  for (const s of selected) writeJson(join(output, 'requests', `${s.id}.json`), s.request)
  writeJson(join(output, 'request-list.json'), {
    sourceSha,
    sourceDirty,
    kind: prepared.kind,
    inputSha256: prepared.inputSha256,
    labelsSha256: evaluation?.labelsSha256 ?? null,
    labelReview: evaluation?.review ?? 'missing',
    networkRequests: 0,
    realModel: 'not-run',
    totalPlannedRequests: selected.length,
    // First eligible state doubles as compatibility check; no extra six synthetic calls.
    entries: selected.map((s, index) => ({
      id: s.id,
      phase: index === 0 ? 'compatibility-first' : 'quality-after-compatibility',
      path: `requests/${s.id}.json`,
      wireSha256: s.request!.wireDigest,
      questions: Object.keys(s.request!.questions).length,
      bytes: s.request!.byteLength,
      eligibleCandidateIds: s.eligibleCandidateIds,
      reservedCostUsd: null,
    })),
    blockers: [
      'question-limit-unverified',
      'billing-bound-unverified',
      'user-authorization-not-granted',
      ...(!prepared.completeExport ? ['eight-real-states-not-supplied'] : []),
      ...(!evaluation ? ['human-reference-not-frozen'] : []),
    ],
  })
  for (const [name, states] of [
    ['compatibility-first', selected.slice(0, 1)],
    ['quality-remainder', selected.slice(1)],
  ] as const) {
    if (!states.length) continue
    const dataset = {
      version: 'r1-jev-dataset-1',
      split: 'development',
      cases: states.map((s) => ({ id: s.id, input: s.input })),
    }
    const path = join(output, `${name}-dataset.json`)
    writeJson(path, dataset)
    const config = configSchema.parse({
      version: 'r1-jev-campaign-1',
      phase: 'decision-pilot',
      profile: DEFAULT_PROFILE,
      dataset: relative(process.cwd(), path),
      datasetSha256: sha256(readFileSync(path)),
      repetitions: 1,
      limits: { maxAttempts: states.length, maxCostUsd: 0.125, maxWallMs: 150000 },
      requestTimeoutMs: 15000,
      protocol: {
        questionsVerified: false,
        billingBoundVerified: false,
        source: '',
        checkedAt: '',
        quoteUsd: null,
        basis:
          'Pending provider question-count and normal/failure/cancellation reservation evidence.',
      },
    })
    writeJson(join(output, `${name}-config.json`), config)
  }
}
sealEvidence(output)
console.log(JSON.stringify({ mode: 'offline-only', output, networkRequests: 0 }))
