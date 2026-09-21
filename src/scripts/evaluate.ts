import 'dotenv/config'
import { writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { VARIANT_EXPECTATIONS, type VariantId } from '../../evaluation/private/answers.ts'
import { evaluateRun, summarizeEvaluation, type EvalScore } from '../../evaluation/private/evaluator.ts'
import type { RunReport } from '../shared/types.ts'

const SERVER_URL = `http://localhost:${process.env.PORT ?? 4111}`
const ARENA_API = `http://localhost:${process.env.ARENA_API_PORT ?? 4174}`

const VARIANTS: VariantId[] = ['C0', 'C1', 'C2', 'C3', 'C4', 'C5']

function parseArgs() {
  const args = process.argv.slice(2)
  const suiteIdx = args.indexOf('--suite')
  const repeatsIdx = args.indexOf('--repeats')

  return {
    suite: suiteIdx >= 0 ? args[suiteIdx + 1] : 'minimum',
    repeats: repeatsIdx >= 0 ? Number(args[repeatsIdx + 1]) : 3,
  }
}

async function resetArena(variant: VariantId): Promise<void> {
  const res = await fetch(`${ARENA_API}/__control/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ variant }),
  })
  if (!res.ok) throw new Error(`Arena reset failed: ${res.status}`)
}

async function startRun(goal: string, entryUrl: string): Promise<string> {
  const res = await fetch(`${SERVER_URL}/api/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal, entryUrl }),
  })

  const data = await res.json() as { runId?: string; error?: string; message?: string }
  if (data.error) throw new Error(data.message ?? data.error)
  if (!data.runId) throw new Error('No runId in response')

  return data.runId
}

async function waitForRun(runId: string, timeoutMs = 360_000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const res = await fetch(`${SERVER_URL}/api/runs/${runId}`)
    const data = await res.json() as { status: string; active: boolean }

    if (!data.active) return

    const terminalStatuses = new Set(['completed', 'cancelled', 'timed-out', 'execution-error', 'blocked'])
    if (terminalStatuses.has(data.status)) return

    await new Promise((r) => setTimeout(r, 3000))
  }

  throw new Error(`Run ${runId} timed out after ${timeoutMs}ms`)
}

async function getReport(runId: string): Promise<RunReport> {
  const res = await fetch(`${SERVER_URL}/api/runs/${runId}/report`)
  return res.json() as Promise<RunReport>
}

async function main() {
  const { suite, repeats } = parseArgs()

  console.log(`[evaluate] suite=${suite} repeats=${repeats}`)
  console.log(`[evaluate] server=${SERVER_URL} arena=${ARENA_API}`)

  const healthRes = await fetch(`${SERVER_URL}/api/health`)
  const health = await healthRes.json() as { model: { ready: boolean; missing: string[] } }

  if (!health.model.ready) {
    console.error(`[evaluate] model not configured: ${health.model.missing.join(', ')}`)
    console.error('[evaluate] cannot run evaluation without model credentials')
    process.exit(1)
  }

  const scores: EvalScore[] = []

  for (const variant of VARIANTS) {
    for (let repeat = 1; repeat <= repeats; repeat++) {
      console.log(`\n[evaluate] === ${variant} repeat ${repeat}/${repeats} ===`)

      try {
        console.log(`[evaluate] resetting arena to ${variant}...`)
        await resetArena(variant)

        console.log('[evaluate] starting run...')
        const runId = await startRun(
          'Complete a purchase in the TechMart store. Add a product to cart, proceed to checkout, and complete the payment.',
          'http://localhost:4173',
        )
        console.log(`[evaluate] run started: ${runId}`)

        console.log('[evaluate] waiting for completion...')
        await waitForRun(runId)

        const report = await getReport(runId)
        console.log(`[evaluate] run ${report.status}, business=${report.businessResult}, findings=${report.findings.length}`)

        const score = evaluateRun(report, variant, repeat)
        scores.push(score)

        console.log(`[evaluate] ${variant} R${repeat}: ${score.overallPass ? 'PASS' : 'FAIL'}`)
        if (score.missingFindings.length > 0) {
          console.log(`[evaluate]   missing: ${score.missingFindings.join(', ')}`)
        }
        if (score.falsePositives.length > 0) {
          console.log(`[evaluate]   false positives: ${score.falsePositives.join(', ')}`)
        }
      } catch (err) {
        console.error(`[evaluate] ${variant} R${repeat} ERROR:`, err)
        scores.push({
          variant,
          runId: 'error',
          repeat,
          businessResultCorrect: false,
          findingsScore: 0,
          falsePositives: [],
          missingFindings: ['evaluation error'],
          budgetRespected: false,
          noAnswerLeak: true,
          overallPass: false,
          details: { error: String(err) },
        })
      }
    }
  }

  const summary = summarizeEvaluation(scores)

  console.log('\n[evaluate] ====== SUMMARY ======')
  console.log(`[evaluate] Total: ${summary.totalRuns} runs`)
  console.log(`[evaluate] Passed: ${summary.passedRuns} (${(summary.passRate * 100).toFixed(0)}%)`)

  for (const [variant, varScores] of Object.entries(summary.variants)) {
    const passed = (varScores as EvalScore[]).filter((s) => s.overallPass).length
    const total = (varScores as EvalScore[]).length
    console.log(`[evaluate] ${variant}: ${passed}/${total} passed`)
  }

  const outputDir = resolve('data/evaluations')
  await mkdir(outputDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outputPath = resolve(outputDir, `eval-${timestamp}.json`)
  await writeFile(outputPath, JSON.stringify(summary, null, 2))

  console.log(`\n[evaluate] results saved to ${outputPath}`)
}

main().catch((err) => {
  console.error('[evaluate] fatal:', err)
  process.exit(1)
})
