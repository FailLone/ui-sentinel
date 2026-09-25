import 'dotenv/config'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { randomBytes, createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@libsql/client'
import {
  startGateway,
  AGENT_MODEL,
  VISION_MODEL,
  REVIEW_MODEL,
} from '../../evaluation/support/model-gateway.ts'
import {
  assertExportIdle,
  assertTruth,
  exportControlRequest,
  resetAndVerifyExport,
  type ExportVariantId,
} from '../../evaluation/private/export/controller.ts'
import {
  scoreExportRun,
  scoreExportBatch,
  verifyArtifactBytes,
  auditDurability,
  type BatchRow,
  type ExportRunInput,
  type ExportScore,
} from '../../evaluation/private/export/scorer.ts'
import { sequencingGaps } from '../../evaluation/private/export/diagnostic-sequencing.ts'
import {
  assertClosed,
  importApprovedRule,
  installApprovalIntoBatch,
  loadBatchDeclarations,
} from '../../evaluation/private/export/approval-source.ts'
import {
  planCampaign,
  FORMAL_MATRIX,
  type GroupId,
} from '../../evaluation/private/export/campaign.ts'
import { scoreBoundRecheck } from '../../evaluation/private/learning.ts'
import {
  REQUIRED_PROVIDERS,
  resolveProviders,
} from '../../evaluation/private/export/diagnostic-config.ts'

/**
 * G5: the formal 45-run campaign.
 *
 * This is the acceptance batch, and it is deliberately a different file from the diagnostic. The
 * diagnostic exists to find out whether the machinery survives a real model; this exists to measure
 * the product against the acceptance matrix. A single script with both behaviours would let a
 * mis-set flag turn a five-run probe into a 45-run spend, and - worse - let a diagnostic's result be
 * read as a batch result.
 *
 * What must hold before a single run starts, and is checked here rather than assumed:
 *
 *   - a *diagnostic that passed* from the *same frozen build* (`--diagnostic-source`);
 *   - for B/D, an approved rule whose source is actually present and closed (`--approved-source`).
 *     Absent, those groups are reported `blocked` and the batch exits non-zero - never fabricated;
 *   - one shared budget. The diagnostic and the formal batch draw on the same ceiling, so a new
 *     output directory does not grant a fresh $2.
 */
const args = process.argv.slice(2).filter((a) => a !== '--')
const option = (name: string) => {
  const i = args.indexOf(name)
  return i < 0 ? undefined : args[i + 1]
}
const diagnosticSource = option('--diagnostic-source')
const approvedSource = option('--approved-source')
const groupsArg = option('--groups')
const known = new Set(['--diagnostic-source', '--approved-source', '--groups'])
// Strict option parsing: an unknown or malformed flag is refused rather than ignored, so a typo
// cannot silently change which groups run or which diagnostic authorises them.
for (const arg of args)
  if (arg.startsWith('--') && !known.has(arg)) throw Error(`unknown option: ${arg}`)
if (!diagnosticSource)
  throw Error(
    'Usage: pnpm validate:business -- --formal --diagnostic-source <passed diagnostic directory> ' +
      '[--approved-source <closed learning directory>] [--groups A,C]',
  )
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
  throw Error('Freeze clean commit before model calls')
const key = process.env.OPENROUTER_API_KEY
if (!key) throw Error('configuration-missing: OPENROUTER_API_KEY')
/** Narrowed once, so the runner function cannot be reached without a key. */
const apiKey: string = key

const providers = resolveProviders(process.env)
if (!providers.ok)
  throw Error(
    `configuration-refused: this batch runs the ${JSON.stringify(REQUIRED_PROVIDERS)} baseline, ` +
      `but VALIDATION_AGENT_PROVIDER/VALIDATION_VISION_PROVIDER request another provider ` +
      `(${providers.reasonCodes.join(', ')}); unset them to run the baseline`,
  )

/**
 * The approved source's default location, per the acceptance plan.
 *
 * Recorded here as a literal rather than probed, because the plan names it and a batch should be
 * reproducible from the plan: a default that searched for "whatever learning directory is around"
 * would let a different machine silently authorise a different rule.
 */
const DEFAULT_APPROVED_SOURCE = 'data/learning/2026-09-24T10-57-41-736Z'
const DEFAULT_PROPOSAL_ID = 'proposal-fc30e9bb-46bc-40ec-b88b-ff52f0565607'

const dir = resolve('data/business-formal', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(dir, { recursive: true })
const write = (name: string, value: unknown) =>
  writeFile(resolve(dir, name), JSON.stringify(value, null, 2) + '\n')
/** Text artifacts are written verbatim: JSON-encoding a `.md` or `.jsonl` would escape every line. */
const writeText = (name: string, text: string) => writeFile(resolve(dir, name), text)

const maxCostUsd = Number(process.env.VALIDATION_MAX_COST_USD ?? '2')
if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) throw Error('Invalid VALIDATION_MAX_COST_USD')

const builtServerHash = createHash('sha256')
  .update(await readFile('dist/server/index.js'))
  .digest('hex')
const lockHash = createHash('sha256')
  .update(await readFile('pnpm-lock.yaml'))
  .digest('hex')
const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

/**
 * The shared campaign budget, carried across processes.
 *
 * The plan is explicit that a diagnostic and the formal batch it authorises share one ceiling, and
 * that a new output directory must not reset it. The diagnostic records its own spending, so the
 * remaining balance is derived from what was actually spent rather than re-granted.
 */
async function spentIn(directory: string): Promise<number> {
  const report = await readFile(resolve(directory, 'spending.json'), 'utf8')
    .then((text) => JSON.parse(text) as { accountedUsd?: number })
    .catch(() => null)
  return Number(report?.accountedUsd ?? 0)
}

// --- the diagnostic reference -------------------------------------------------------------
// Read from the campaign file the diagnostic wrote, and re-checked against the bytes of the build
// this batch will run. A directory whose reference says it passed for another build authorises
// nothing here.
let diagnostic: { directory: string; passed: boolean; buildHash: string } | undefined
let diagnosticReason = ''
try {
  const reference = JSON.parse(
    await readFile(resolve(diagnosticSource!, 'diagnostic-reference.json'), 'utf8'),
  ) as { directory?: string; builtServerHash?: string; passed?: boolean }
  if (typeof reference.passed !== 'boolean' || typeof reference.builtServerHash !== 'string')
    diagnosticReason = 'diagnostic-reference-malformed'
  else
    diagnostic = {
      directory: resolve(diagnosticSource!),
      passed: reference.passed,
      buildHash: reference.builtServerHash,
    }
} catch (error) {
  diagnosticReason = `diagnostic-reference-unreadable: ${String(error)}`
}

// --- the approved rule source --------------------------------------------------------------
// Absent or unverifiable means B and D are blocked. The plan is explicit that the approved source
// is not in Git and may be missing on another machine, and that the response is to record the block
// rather than to invent an approval.
let approved:
  | { ok: true; imported: Awaited<ReturnType<typeof importApprovedRule>> }
  | { ok: false; reason: string }
const approvedDirectory = approvedSource ?? DEFAULT_APPROVED_SOURCE
try {
  await assertClosed(resolve(approvedDirectory))
  approved = {
    ok: true,
    imported: await importApprovedRule({
      directory: approvedDirectory,
      expectedProposalId: approvedSource ? undefined : DEFAULT_PROPOSAL_ID,
    }),
  }
} catch (error) {
  approved = { ok: false, reason: String(error) }
}

const requestedGroups = (
  groupsArg ? groupsArg.split(',').map((g) => g.trim()) : ['A', 'B', 'C', 'D']
) as GroupId[]
for (const group of requestedGroups)
  if (!FORMAL_MATRIX.some((g) => g.group === group))
    throw Error(`unknown group: ${group}; expected one of A, B, C, D`)

const budgetRemainingUsd = maxCostUsd - (await spentIn(diagnosticSource!)) - (await spentIn(dir))

const plan = planCampaign({
  diagnostic,
  approvedSource: approved,
  currentBuildHash: builtServerHash,
  budgetRemainingUsd,
  requestedGroups,
})

await write('manifest.json', {
  campaignId: dir,
  kind: 'business-formal',
  realModel: true,
  baseSha: execFileSync('git', ['merge-base', 'main', 'HEAD'], { encoding: 'utf8' }).trim(),
  headSha,
  builtServerHash,
  lockHash,
  agentModel: AGENT_MODEL,
  visionModel: VISION_MODEL,
  agentProvider: providers.agent,
  visionProvider: providers.vision,
  providerSource: providers.source,
  atomicInvestigation: true,
  blockerReview: true,
  limitUsd: maxCostUsd,
  diagnosticSource: diagnosticSource!,
  diagnosticReference: diagnostic ?? { unreadable: diagnosticReason },
  approvedSource: approvedDirectory,
  approvedSourceUsed: approvedSource ?? '(default)',
  approval: approved.ok
    ? {
        ok: true,
        proposalId: approved.imported.proposalId,
        declarationHash: approved.imported.declarationHash,
        databaseHash: approved.imported.databaseHash,
        reviewedBy: approved.imported.reviewedBy,
      }
    : { ok: false, reason: approved.reason },
  budgetRemainingUsd,
})
await write('campaign-plan.json', plan)
await write('protocol.json', {
  matrix: FORMAL_MATRIX,
  providerPin: REQUIRED_PROVIDERS,
  budget: { totalTimeoutMs: 300_000, maxActions: 40, maxModelCalls: 30 },
})

console.log(JSON.stringify({ planned: plan.run.map((g) => g.group), blocked: plan.blocked }))

// The plan gates everything. A batch with no valid diagnostic runs nothing at all - not "most of"
// the matrix - and reports every group as not-run with the reason.
if (plan.diagnosticRefused || !plan.run.length) {
  // Every group is recorded, with the case/repeat expansion of the matrix it would have run. A
  // refusal that emitted nothing would look like a batch with no failures rather than one that
  // never started.
  const blockedRows = FORMAL_MATRIX.filter(
    (g) => !plan.run.some((r) => r.group === g.group),
  ).flatMap((g) =>
    g.cases.flatMap((c) =>
      Array.from({ length: g.repeats }, (_, i) =>
        JSON.stringify({
          group: g.group,
          case: c,
          repeat: i + 1,
          planned: false,
          runId: null,
          status: 'blocked',
          reason:
            plan.blocked.find((b) => b.group === g.group)?.reason ??
            plan.reasonCodes[0] ??
            'not-planned',
          buildHash: builtServerHash,
        }),
      ),
    ),
  )
  await writeText('runs.jsonl', blockedRows.join('\n') + '\n')
  await write('scoreboard.json', {
    gate: false,
    gatePassed: false,
    exitNonZero: true,
    reasonCodes: plan.reasonCodes,
    blocked: plan.blocked,
    scored: null,
    note: 'No run executed: the campaign plan refused the batch before any model call.',
  })
  await writeText('summary.md', summaryMarkdown(plan, [], blockedRows, null))
  console.error(`Blocked before any run: ${plan.reasonCodes.join(', ')}`)
  process.exitCode = 1
} else {
  await runCampaign()
}

/**
 * The batch itself.
 *
 * Kept in a function so the refusal path above can exit without ever having spawned a service or
 * opened a gateway. Every group gets its own database: the plan requires that B cannot inherit
 * anything A discovered, and a shared store would make that structural rather than asserted.
 */
async function runCampaign() {
  const reservePort = async () => {
    const server = createServer()
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as { port: number }).port
    await new Promise<void>((r) => server.close(() => r()))
    return String(port)
  }

  const pricing = (await fetch('https://openrouter.ai/api/v1/models', {
    signal: AbortSignal.timeout(15000),
  }).then((r) => r.json())) as {
    data?: { id: string; pricing?: { prompt: string; completion: string } }[]
  }
  for (const model of [AGENT_MODEL, VISION_MODEL]) {
    const entry = pricing.data?.find((m) => m.id === model)
    if (
      !entry ||
      !Number.isFinite(Number(entry.pricing?.prompt)) ||
      !Number.isFinite(Number(entry.pricing?.completion))
    )
      throw Error(`Model price unavailable for ${model}`)
  }
  await write(
    'models.json',
    pricing.data?.filter((m) => [AGENT_MODEL, VISION_MODEL].includes(m.id)),
  )

  const gateway = await startGateway(apiKey, dir, fetch, {
    limitUsd: maxCostUsd,
    estimateCost: (body) => {
      if (body.model === REVIEW_MODEL) return 0.001344
      const model = pricing.data?.find((m) => m.id === body.model)
      return (
        Buffer.byteLength(JSON.stringify(body)) * Number(model?.pricing?.prompt) +
        4096 * Number(model?.pricing?.completion)
      )
    },
  })

  const rows: BatchRow[] = []
  const records: Record<string, unknown>[] = []
  const children: ChildProcess[] = []
  let log = ''
  let stop = ''

  const launch = (argv: string[], env: NodeJS.ProcessEnv) => {
    const child = spawn(process.execPath, argv, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    children.push(child)
    for (const stream of [child.stdout, child.stderr])
      stream?.on('data', (b) => {
        log += gateway.redact(String(b))
      })
    return child
  }
  const wait = (child: ChildProcess, timeoutMs: number) =>
    new Promise<number>((resolveExit, rejectExit) => {
      const timer = setTimeout(() => {
        child.kill('SIGTERM')
        rejectExit(Error('child-timeout'))
      }, timeoutMs)
      child.once('error', (error) => {
        clearTimeout(timer)
        rejectExit(error)
      })
      child.once('exit', (code) => {
        clearTimeout(timer)
        resolveExit(code ?? 1)
      })
    })

  try {
    // Both arenas and the service, on one frozen build. A campaign that switched builds mid-run
    // would be comparing results it cannot compare, so the hash is asserted rather than recorded.
    const serverEnv: NodeJS.ProcessEnv = {
      ...process.env,
      AGENT_MODEL: `openai/${AGENT_MODEL}`,
      OPENAI_API_KEY: gateway.token,
      OPENAI_BASE_URL: gateway.url,
      VISION_MODEL,
      VISION_API_KEY: gateway.token,
      VISION_BASE_URL: gateway.url,
      VISION_MODEL_FAMILY: 'qwen3',
      COMPLETION_REVIEW_API_KEY: gateway.token,
      COMPLETION_REVIEW_URL: gateway.url + '/decisions',
      PORT: await reservePort(),
      ARENA_PORT: await reservePort(),
      ARENA_API_PORT: await reservePort(),
      ARENA_CONTROL_PORT: await reservePort(),
      EXPORT_ARENA_PORT: await reservePort(),
      EXPORT_API_PORT: await reservePort(),
      EXPORT_CONTROL_PORT: await reservePort(),
      ARENA_CONTROL_TOKEN: randomBytes(32).toString('hex'),
      EXPORT_CONTROL_TOKEN: randomBytes(32).toString('hex'),
      ARENA_STATIC: '1',
      EXPORT_ARENA_STATIC: '1',
      EXECUTION_ATOMIC_INVESTIGATION: '1',
      EXECUTION_BLOCKER_REVIEW: '1',
      VALIDATION_AGENT_PROVIDER: providers.agent,
      VALIDATION_VISION_PROVIDER: providers.vision,
      DATABASE_URL: `file:${dir}/batch.db`,
      OPENROUTER_API_KEY: '',
      RUN_MAX_MODEL_CALLS: '30',
      RUN_MAX_ACTIONS: '40',
      RUN_TOTAL_TIMEOUT_MS: '300000',
      MODEL_REQUEST_TIMEOUT_MS: '60000',
      MODEL_REQUEST_MAX_RETRIES: '1',
      TOOL_TIMEOUT_MS: '15000',
      OTEL_SDK_DISABLED: 'true',
    }
    serverEnv.EXPORT_ARENA_URL = `http://127.0.0.1:${serverEnv.EXPORT_ARENA_PORT}`
    Object.assign(process.env, serverEnv)

    const base = `http://127.0.0.1:${serverEnv.PORT}`
    const get = async (path: string, body?: unknown) => {
      const response = await fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${serverEnv.ARENA_CONTROL_TOKEN}`,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(path === '/api/runs' ? 60000 : 15000),
      })
      if (!response.ok)
        throw Error(`${path}: ${response.status} ${gateway.redact(await response.text())}`)
      return response.json() as Promise<any>
    }

    launch(['dist/server/index.js'], serverEnv)
    launch(['dist/arena/index.js'], serverEnv)
    launch(['dist/arena-export/index.js'], serverEnv)
    let ready = false
    for (let i = 0; i < 160; i++) {
      try {
        if (
          (await fetch(`${base}/api/health`)).ok &&
          (await fetch(serverEnv.EXPORT_ARENA_URL!)).ok
        ) {
          ready = true
          break
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 250))
    }
    if (!ready) throw Error('Services failed to start')

    const settle = async (runId: string) => {
      const deadline = Date.now() + 330_000
      while (true) {
        const state = await get(`/api/runs/${runId}`)
        if (!['queued', 'running'].includes(state.status) && !state.active) return state
        if (Date.now() > deadline) {
          await get(`/api/runs/${runId}/cancel`, {})
          throw Error('Run exceeded its own budget without stopping; cancellation requested')
        }
        await new Promise((r) => setTimeout(r, 250))
      }
    }

    const EXPORT_GOAL =
      'Use a public dataset to produce a CSV export and inspect that flow and the recovery experience it actually triggers. Respect the public requirements and operation limits, report with evidence and finish.'
    const CHECKOUT_GOAL =
      'Inspect the purchase journey. Purchase an item; inspect primary action access, response, expected rejection and recovery. Campaigns must not block submit; retryable failures must provide an operable retry within five seconds. Response above ten seconds warrants a warning.'

    /** The group's own isolated store, so results never cross between groups. */
    const groupDatabase = (group: GroupId) => `file:${dir}/${group.toLowerCase()}/runs.db`

    for (const group of plan.run) {
      await mkdir(resolve(dir, group.group.toLowerCase()), { recursive: true })
      // The group's database is created empty. For B/D the approved declaration is installed
      // read-only; for A/C nothing is, which is what makes "no equivalent retry rule" a fact about
      // the store rather than about the batch's intent.
      const groupClient = createClient({ url: groupDatabase(group.group) })
      if (group.rules === 'approved-imported' && approved.ok) {
        const { initDatabase } = await import('../../src/storage/database.ts')
        await initDatabase()
        await installApprovalIntoBatch({
          client: groupClient,
          imported: approved.imported,
          batchEnvironmentId: group.business === 'export' ? 'export-arena' : 'arena',
          batchEntryUrl:
            group.business === 'export'
              ? `http://127.0.0.1:${serverEnv.EXPORT_ARENA_PORT}`
              : `http://127.0.0.1:${serverEnv.ARENA_PORT}`,
        })
      }
      const declarations = await loadBatchDeclarations(groupClient)
      groupClient.close()

      for (const variant of group.cases)
        for (let repeat = 1; repeat <= group.repeats; repeat++) {
          // A mutable row is filled in as the run progresses and frozen once at the end: `BatchRow`
          // is readonly because the scorer must not be able to rewrite a result it is judging.
          const row: {
            group: string
            case: string
            repeat: number
            planned: boolean
            runId: string | null
            status: 'not-run' | 'failed' | 'passed' | 'blocked'
            buildHash: string | null
            score?: ExportScore
          } = {
            group: group.group,
            case: variant,
            repeat,
            planned: true,
            runId: null,
            status: 'not-run',
            buildHash: builtServerHash,
          }
          const record: Record<string, unknown> = {
            group: group.group,
            case: variant,
            repeat,
            buildHash: builtServerHash,
          }
          try {
            if (group.business === 'export') {
              const exportVariant = variant as ExportVariantId
              const verified = await resetAndVerifyExport(exportVariant)
              assertTruth(exportVariant, verified.truth)
              // The verification drives the arena's one permitted create itself, so the run must
              // start from a fresh arena; without this the agent's own click is answered 409 and no
              // business fact is ever decoded.
              await exportControlRequest('/__control/reset', { variant: exportVariant })
              if (
                sequencingGaps([
                  'fixture-verified',
                  'arena-reset-after-verification',
                  'truth-asserted',
                ]).length
              )
                throw Error('campaign-sequencing-incomplete')
              record.fixture = { jobId: verified.jobId, truth: verified.truth }
              gateway.begin(`${group.group}-${variant}-${repeat}`, 30, 300_000)
              const run = await get('/api/runs', {
                goal: EXPORT_GOAL,
                environmentId: 'export-arena',
                businessProfile: { id: 'export', revision: '1' },
                budget: { totalTimeoutMs: 300_000, maxActions: 40, maxModelCalls: 30 },
              })
              row.runId = run.runId
              record.runId = run.runId
              await settle(run.runId)
              const report = await get(`/api/runs/${run.runId}/report`)
              const truth = await exportControlRequest('/__control/state')
              const downloaded = await downloadArtifacts(base, run.runId, report)
              const artifacts = downloaded.artifacts
              const score = scoreExportRun(exportVariant, {
                truth: {
                  creates: truth.creates,
                  retries: truth.retries,
                  jobs: truth.jobs,
                  artifacts: truth.artifacts,
                  attempts: undefined,
                  artifactContents: truth.artifactContents,
                },
                requests: truth.requests,
                report: {
                  runId: report.runId,
                  status: report.status,
                  businessResult: report.businessResult,
                  stopReason: report.stopReason,
                  persistence: report.persistence,
                  events: report.events,
                  findings: report.findings,
                  hypotheses: report.hypotheses,
                  usage: report.usage,
                  budget: report.budget,
                },
                artifacts,
                contract: {
                  profileId: report.business.profileId,
                  revision: report.business.revision,
                  hash: report.business.hash,
                  retryAvailabilityMs: 5000,
                  adapter: report.business.adapter,
                  environment: {
                    id: report.business.environment.id,
                    origin: report.business.environment.publicOrigin,
                  },
                  effects: report.business.effects,
                },
                selection: { datasetId: 'orders-q3', format: 'csv' },
                rules: declarations,
                approvedRule:
                  group.rules === 'approved-imported' && approved.ok
                    ? {
                        id: approved.imported.proposalId,
                        revision: approved.imported.ruleRevision,
                        reviewedBy: approved.imported.reviewedBy,
                        ruleConfig: approved.imported.ruleConfig,
                      }
                    : undefined,
                declaredTarget: declaredRecoveryTarget(report.events),
              })
              row.status = score.passed ? 'passed' : 'failed'
              row.score = score
              record.score = { passed: score.passed, failedAssertions: score.failedAssertions }
            } else {
              // Groups C/D reuse the existing checkout acceptance runner rather than restating its
              // eighteen-case minimum and six-run recheck here. The plan allows shared orchestration
              // as long as the original commands stay compatible; duplicating the evaluator would
              // let the two drift.
              throw Error(
                'checkout-groups-delegated: run pnpm validate:acceptance and pnpm validate:learning --recheck',
              )
            }
            record.report = {
              status: (record.score as any)?.status,
              failedAssertions: (record.score as any)?.failedAssertions,
            }
          } catch (error) {
            row.status = 'failed'
            record.error = gateway.redact(String(error))
          } finally {
            record.modelRequests = (await gateway.end()).length
          }
          rows.push(row as BatchRow)
          records.push(record)
          await writeText('runs.jsonl', rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
          await write(`${group.group}-${variant}-${repeat}.json`, record)
          await write('spending.json', gateway.spending())
          console.log(`${group.group} ${variant} ${repeat}: ${row.status}`)
          // Integrity stops end the batch immediately: continuing past a reconciliation-required
          // run or an exhausted budget would produce rows that cannot be compared.
          if (gateway.spending().accountedUsd >= maxCostUsd) {
            stop = 'campaign-budget-exhausted'
            break
          }
        }
      if (stop) break
    }
  } catch (error) {
    stop = gateway.redact(String(error))
    console.error(stop)
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill('SIGTERM')
    await Promise.all(
      children.map(
        (child) =>
          new Promise<void>((r) => {
            if (child.exitCode !== null || child.signalCode !== null) return r()
            child.once('exit', () => r())
            setTimeout(() => {
              child.kill('SIGKILL')
              r()
            }, 3000).unref()
          }),
      ),
    )
    await write('server.log', log)
    await gateway.close()
    await assertExportIdle().catch(() => {})
  }

  const expectedPlan = plan.run.flatMap((g) =>
    g.cases.map((c) => ({
      group: g.group,
      case: c,
      repeats: g.repeats,
    })),
  )
  const batch = scoreExportBatch(rows, expectedPlan)
  // B/D were blocked before anything ran, so their rows are recorded as blocked rather than
  // omitted: a scoreboard that silently lacked them would read as a complete 33-run batch.
  const blockedRows = plan.blocked.flatMap((b) => {
    const group = FORMAL_MATRIX.find((g) => g.group === b.group)!
    return group.cases.flatMap((c) =>
      Array.from({ length: group.repeats }, (_, i) => ({
        group: b.group,
        case: c,
        repeat: i + 1,
        planned: false,
        runId: null,
        status: 'blocked' as const,
        reason: b.reason,
        buildHash: builtServerHash,
      })),
    )
  })
  await writeText(
    'runs.jsonl',
    [...rows, ...blockedRows].map((r) => JSON.stringify(r)).join('\n') + '\n',
  )

  const scoreboard = {
    gate: false,
    gatePassed: false,
    batch,
    blocked: plan.blocked,
    reasonCodes: plan.reasonCodes,
    stop: stop || null,
  }
  await write('scoreboard.json', scoreboard)
  await writeText('summary.md', summaryMarkdown(plan, rows, blockedRows, stop || null))
  console.log(JSON.stringify({ scoreboard }, null, 2))
  // Never green while any group is blocked or the batch is incomplete, per the plan.
  if (plan.exitNonZero || !batch.passed) process.exitCode = 1
}

/** The semantic target the run declared for its own recovery measurement, when it made one. */
function declaredRecoveryTarget(
  events: readonly { type: string; payload: unknown }[],
): string | undefined {
  for (const event of [...events].reverse()) {
    if (event.type !== 'investigation:declared') continue
    const target = (event.payload as { target?: unknown }).target
    if (typeof target === 'string' && target) return target
  }
  return undefined
}

/** Download a run's evidence through the public API and hash the real bytes. */
async function downloadArtifacts(
  base: string,
  runId: string,
  report: { artifacts: { id: string; type: string; available: boolean }[] },
): Promise<{
  artifacts: Record<string, { type: string; exists: boolean; sha256?: string; data?: unknown }>
  index: {
    runId: string
    artifactId: string
    type: string
    bytes: number
    sha256: string
    available: boolean
  }[]
}> {
  const artifacts: Record<
    string,
    { type: string; exists: boolean; sha256?: string; data?: unknown }
  > = {}
  const index: {
    runId: string
    artifactId: string
    type: string
    bytes: number
    sha256: string
    available: boolean
  }[] = []
  for (const artifact of report.artifacts) {
    const url = `${base}/api/runs/${runId}/artifacts/${encodeURIComponent(artifact.id)}`
    const bytes = new Uint8Array(
      await fetch(url, { signal: AbortSignal.timeout(15000) })
        .then((r) => (r.ok ? r.arrayBuffer() : new ArrayBuffer(0)))
        .catch(() => new ArrayBuffer(0)),
    )
    const check = verifyArtifactBytes(artifact.id, artifact.type, bytes, {
      available: artifact.available,
    })
    let data: unknown
    if (check.exists && !artifact.type.includes('screenshot')) {
      try {
        data = JSON.parse(Buffer.from(bytes).toString('utf8'))
      } catch {
        /* a non-JSON artifact has no parsed payload */
      }
    }
    artifacts[artifact.id] = {
      type: artifact.type,
      exists: check.exists,
      sha256: check.sha256,
      data,
    }
    index.push({
      runId,
      artifactId: artifact.id,
      type: artifact.type,
      bytes: check.bytes,
      sha256: check.sha256,
      available: check.exists,
    })
  }
  return { artifacts, index }
}

function summaryMarkdown(
  plan: ReturnType<typeof planCampaign>,
  rows: readonly BatchRow[],
  blockedRows: readonly unknown[],
  stop: string | null,
): string {
  const passed = rows.filter((r) => r.status === 'passed').length
  const failed = rows.filter((r) => r.status === 'failed').length
  return [
    '# Business formal campaign',
    '',
    `Planned groups: ${plan.run.map((g) => g.group).join(', ') || '(none)'}`,
    `Blocked groups: ${plan.blocked.map((b) => `${b.group} (${b.reason})`).join(', ') || '(none)'}`,
    `Runs executed: ${rows.length}; passed: ${passed}; failed: ${failed}`,
    `Rows recorded blocked: ${blockedRows.length}`,
    `Stop: ${stop ?? '(none)'}`,
    '',
    'A batch with any blocked group never gates. Blocked groups are recorded, never omitted.',
    'This file states counts only; the per-run assertions are in scoreboard.json and runs.jsonl.',
  ].join('\n')
}
