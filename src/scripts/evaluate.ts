import 'dotenv/config'
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import type { VariantId } from '../../evaluation/private/answers.ts'
import {
  evaluateRun,
  summarizeEvaluation,
  type EvalScore,
  type IndependentEvidence,
} from '../../evaluation/private/evaluator.ts'
import {
  resetAndVerify,
  controlRequest,
  arenaUrl,
  assertIdle,
} from '../../evaluation/private/controller.ts'
import type { RunReport, RunEvent } from '../shared/types.ts'

const base = process.env.SERVER_URL ?? `http://localhost:${process.env.PORT ?? 4111}`
const args = process.argv.slice(2).filter((a) => a !== '--')
const option = (key: string, defaultValue: string) =>
  args.includes(key) ? args[args.indexOf(key) + 1] : defaultValue
const suite = option('--suite', 'minimum'),
  repeats = Number(option('--repeats', '3')),
  onlyVariant = option('--variant', '')
const budget = { totalTimeoutMs: 300000, maxActions: 40, maxModelCalls: 40 }
async function request(path: string, body?: unknown) {
  const r = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.ARENA_CONTROL_TOKEN ?? ''}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  })
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${await r.text()}`)
  return r.json() as Promise<any>
}
async function wait(runId: string, timeout = budget.totalTimeoutMs + 30000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const r = await request(`/api/runs/${runId}`)
    if (!['queued', 'running'].includes(r.status) && !r.active) return
    await new Promise((r) => setTimeout(r, 250))
  }
  await request(`/api/runs/${runId}/cancel`, {})
  throw new Error('Run timed out; cancel requested. Further resets require idle queue.')
}
async function main() {
  if (suite !== 'minimum' || repeats !== 3)
    throw new Error('Fixed minimum suite requires --suite minimum --repeats 3')
  const health = await request('/api/health')
  if (!health.model.ready)
    throw new Error('configuration-missing: ' + health.model.missing.join(', '))
  const lease = await request('/api/evaluation/lease', {})
  const dir = resolve('data/evaluations', new Date().toISOString().replace(/[:.]/g, '-'))
  await mkdir(dir, { recursive: true })
  const scores: EvalScore[] = []
  try {
    if (lease.rules.some((r: { category: string }) => r.category === 'transition'))
      throw new Error(
        'Minimum discovery suite cannot run with learned transition rules enabled; use a fresh isolated evaluation database',
      )
    const manifest = {
      suite,
      repeats,
      budget,
      agentModel: process.env.AGENT_MODEL,
      visionModel: process.env.VISION_MODEL,
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
      lockHash: createHash('sha256')
        .update(await readFile('pnpm-lock.yaml'))
        .digest('hex'),
      rules: lease.rules,
      startedAt: new Date().toISOString(),
    }
    await writeFile(resolve(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
    const allVariants = ['C0', 'C1', 'C2', 'C3', 'C4', 'C5'] as VariantId[]
    const variants = onlyVariant ? allVariants.filter((v) => v === onlyVariant) : allVariants
    for (const variant of variants)
      for (let repeat = 1; repeat <= 3; repeat++) {
        let runId = 'not-created',
          record: Record<string, unknown> = {},
          score: EvalScore
        try {
          const fixture = await resetAndVerify(variant)
          record.fixture = fixture
          const run = await request('/api/runs', {
            goal: 'Inspect the purchase journey. Purchase an item; inspect primary action access, response, expected rejection and recovery. Campaigns must not block submit; retryable failures must provide an operable retry within five seconds. Response above ten seconds warrants a warning.',
            environmentId: 'arena',
            entryUrl: arenaUrl(),
            budget,
          })
          runId = run.runId
          record.runId = runId
          await wait(runId)
          const report = (await request(`/api/runs/${runId}/report`)) as RunReport & {
            artifacts: { id: string; type: string; available: boolean }[]
            events: RunEvent[]
            hypotheses: IndependentEvidence['hypotheses']
          }
          record.report = report
          const artifacts: IndependentEvidence['artifacts'] = {}
          for (const a of report.artifacts) {
            const r = await fetch(
              `${base}/api/runs/${runId}/artifacts/${encodeURIComponent(a.id)}`,
              { signal: AbortSignal.timeout(15000) },
            )
            const bytes = new Uint8Array(await r.arrayBuffer())
            const exists =
              r.ok &&
              a.available &&
              (a.type === 'screenshot'
                ? Buffer.from(bytes)
                    .subarray(0, 8)
                    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
                : bytes.length > 0)
            artifacts[a.id] = {
              type: a.type,
              exists,
              ...(exists && a.type !== 'screenshot'
                ? { data: JSON.parse(Buffer.from(bytes).toString('utf8')) }
                : {}),
            }
          }
          const evidence: IndependentEvidence = {
            fixtureValid: fixture.valid === true,
            backend: await controlRequest('/__control/state'),
            artifacts,
            events: report.events,
            budget,
            hypotheses: report.hypotheses,
          }
          record.evidence = evidence
          score = evaluateRun(report, variant, repeat, evidence)
        } catch (error) {
          score = {
            variant,
            repeat,
            runId,
            businessResultCorrect: false,
            findingsScore: 0,
            falsePositives: [],
            missingFindings: [],
            budgetRespected: false,
            noAnswerLeak: false,
            overallPass: false,
            classification: 'invalid',
            details: { error: String(error) },
          }
        }
        scores.push(score)
        record.score = score
        await writeFile(resolve(dir, `${variant}-${repeat}.json`), JSON.stringify(record, null, 2))
        console.log(`${variant} ${repeat}/3: ${score.classification} (${runId})`)
      }
    const summary = summarizeEvaluation(scores)
    await writeFile(resolve(dir, 'summary.json'), JSON.stringify(summary, null, 2))
    console.log(`All ${scores.length} records: ${dir}; gatePassed=${summary.gatePassed}`)
    if (!summary.gatePassed) process.exitCode = 1
  } finally {
    await request('/api/evaluation/release', { lease: lease.lease })
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
