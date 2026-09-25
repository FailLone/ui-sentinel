import 'dotenv/config'
import { buildIdentity } from '../../evaluation/support/build-identity.ts'
import {
  downloadRunEvidence,
  auditStoppedGroup,
} from '../../evaluation/support/campaign-evidence.ts'
import { evaluateRun } from '../../evaluation/private/evaluator.ts'
import { resetAndVerify, controlRequest, assertIdle } from '../../evaluation/private/controller.ts'
import type { VariantId } from '../../evaluation/private/answers.ts'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { randomBytes, createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@libsql/client'
import {
  startGateway,
  AGENT_MODEL,
  VISION_MODEL,
  REVIEW_MODEL,
} from '../../evaluation/support/model-gateway.ts'
import {
  assertTruth,
  exportControlRequest,
  resetAndVerifyExport,
  type ExportVariantId,
} from '../../evaluation/private/export/controller.ts'
import {
  scoreExportRun,
  scoreExportBatch,
  type BatchRow,
} from '../../evaluation/private/export/scorer.ts'
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

const RUN_BUDGET = { totalTimeoutMs: 300000, maxActions: 40, maxModelCalls: 30 }
const EXPORT_GOAL =
  'Use a public dataset to produce a CSV export and inspect that flow and the recovery experience it actually triggers. Respect the public requirements and operation limits, report with evidence and finish.'
const CHECKOUT_GOAL =
  'Inspect the purchase journey. Purchase an item; inspect primary action access, response, expected rejection and recovery. Campaigns must not block submit; retryable failures must provide an operable retry within five seconds. Response above ten seconds warrants a warning.'

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
for (let i = 0; i < args.length; i += 2) {
  if (
    !['--diagnostic-source', '--approved-source', '--groups'].includes(args[i]!) ||
    !args[i + 1] ||
    args[i + 1]!.startsWith('--') ||
    args.indexOf(args[i]!) !== i
  )
    throw Error('Malformed or duplicate option: ' + args[i])
}
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
 *
 * The plan moved this from the original author's local learning directory to the Git-backed
 * fixture, so the source is now something a new checkout can actually obtain:
 * `pnpm fixture:approved-retry` verifies and imports it. The historical directory is a provenance
 * reference only, not a cross-machine prerequisite. Importing is a migration of an existing human
 * approval, never a new approval.
 */
const DEFAULT_APPROVED_SOURCE = 'data/fixtures/approved-retry'
const DEFAULT_PROPOSAL_ID = 'proposal-fc30e9bb-46bc-40ec-b88b-ff52f0565607'

const dir = resolve('data/business-formal', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(dir, { recursive: true })
const write = (name: string, value: unknown) =>
  writeFile(resolve(dir, name), JSON.stringify(value, null, 2) + '\n')
/** Text artifacts are written verbatim: JSON-encoding a `.md` or `.jsonl` would escape every line. */
const writeText = (name: string, text: string) => writeFile(resolve(dir, name), text)

const maxCostUsd = Number(process.env.VALIDATION_MAX_COST_USD ?? '2')
if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) throw Error('Invalid VALIDATION_MAX_COST_USD')

const build = await buildIdentity()
await write('build-identity.json', build)
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
  if (!report || !Number.isFinite(report.accountedUsd) || Number(report.accountedUsd) < 0)
    throw Error('diagnostic-spending-unavailable')
  return Number(report.accountedUsd)
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
  ) as { directory?: string; builtServerHash?: string; passed?: boolean; buildHash?: string }
  if (typeof reference.passed !== 'boolean' || typeof reference.builtServerHash !== 'string')
    diagnosticReason = 'diagnostic-reference-malformed'
  else
    diagnostic = {
      directory: resolve(diagnosticSource!),
      passed: reference.passed && reference.buildHash === build.hash,
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
if (new Set(requestedGroups).size !== requestedGroups.length) throw Error('Duplicate groups')
for (const group of requestedGroups)
  if (!FORMAL_MATRIX.some((g) => g.group === group))
    throw Error(`unknown group: ${group}; expected one of A, B, C, D`)

const budgetRemainingUsd = maxCostUsd - (await spentIn(diagnosticSource!))

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
  buildHash: build.hash,
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
  const pricing = (await fetch('https://openrouter.ai/api/v1/models', {
    signal: AbortSignal.timeout(15000),
  }).then((r) => r.json())) as {
    data: { id: string; pricing: { prompt: string; completion: string } }[]
  }
  for (const id of [AGENT_MODEL, VISION_MODEL]) {
    const model = pricing.data.find((m) => m.id === id)
    if (
      !model ||
      !Number.isFinite(Number(model.pricing?.prompt)) ||
      !Number.isFinite(Number(model.pricing?.completion))
    )
      throw Error(`Model price unavailable: ${id}`)
  }
  // The diagnostic already consumed part of this campaign's budget.
  const gateway = await startGateway(apiKey, dir, fetch, {
    limitUsd: budgetRemainingUsd,
    estimateCost: (body) => {
      if (body.model === REVIEW_MODEL) return 0.001344
      const model = pricing.data.find((m) => m.id === body.model)!
      return (
        Buffer.byteLength(JSON.stringify(body)) * Number(model.pricing.prompt) +
        4096 * Number(model.pricing.completion)
      )
    },
  })
  const rows: BatchRow[] = FORMAL_MATRIX.flatMap((g) =>
    g.cases.flatMap((c) =>
      Array.from({ length: g.repeats }, (_, i) => ({
        group: g.group,
        case: c,
        repeat: i + 1,
        planned: true,
        runId: null,
        status: plan.run.some((p) => p.group === g.group)
          ? ('not-run' as const)
          : ('blocked' as const),
        buildHash: builtServerHash,
      })),
    ),
  )
  const audits: unknown[] = []
  const artifactIndex: unknown[] = []
  let stop = ''
  const diagnosticSpend = maxCostUsd - budgetRemainingUsd
  const saveProgress = async () => {
    await writeText('runs.jsonl', rows.map((row) => JSON.stringify(row)).join('\n') + '\n')
    await write('artifact-index.json', artifactIndex)
    await write('spending.json', {
      ...gateway.spending(),
      diagnosticAccountedUsd: diagnosticSpend,
      campaignAccountedUsd: diagnosticSpend + gateway.spending().accountedUsd,
    })
  }
  await saveProgress()
  const port = async () => {
    const socket = createServer()
    await new Promise<void>((r) => socket.listen(0, '127.0.0.1', r))
    const value = String((socket.address() as { port: number }).port)
    await new Promise<void>((r) => socket.close(() => r()))
    return value
  }
  const kill = async (child: ChildProcess) => {
    if (child.exitCode !== null || child.signalCode !== null) return
    await new Promise<void>((done) => {
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000)
      child.once('exit', () => {
        clearTimeout(timer)
        done()
      })
      child.kill('SIGTERM')
    })
  }
  try {
    for (const group of plan.run) {
      if (stop) break
      const groupDir = resolve(dir, group.group)
      await mkdir(groupDir, { recursive: true })
      const env: NodeJS.ProcessEnv = {
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
        ARENA_CONTROL_TOKEN: randomBytes(32).toString('hex'),
        EXPORT_CONTROL_TOKEN: randomBytes(32).toString('hex'),
        ARENA_STATIC: '1',
        EXPORT_ARENA_STATIC: '1',
        EXECUTION_ATOMIC_INVESTIGATION: '1',
        EXECUTION_BLOCKER_REVIEW: '1',
        VALIDATION_AGENT_PROVIDER: providers.agent,
        VALIDATION_VISION_PROVIDER: providers.vision,
        DATABASE_URL: `file:${groupDir}/runs.db`,
        OPENROUTER_API_KEY: '',
        RUN_MAX_MODEL_CALLS: '30',
        RUN_MAX_ACTIONS: '40',
        RUN_TOTAL_TIMEOUT_MS: '300000',
        MODEL_REQUEST_TIMEOUT_MS: '60000',
        MODEL_REQUEST_MAX_RETRIES: '1',
        TOOL_TIMEOUT_MS: '15000',
        OTEL_SDK_DISABLED: 'true',
      }
      for (const key of [
        'PORT',
        'ARENA_PORT',
        'ARENA_API_PORT',
        'ARENA_CONTROL_PORT',
        'EXPORT_ARENA_PORT',
        'EXPORT_API_PORT',
        'EXPORT_CONTROL_PORT',
      ])
        env[key] = await port()
      env.SERVER_URL = `http://127.0.0.1:${env.PORT}`
      env.ARENA_URL = `http://127.0.0.1:${env.ARENA_PORT}`
      env.EXPORT_ARENA_URL = `http://127.0.0.1:${env.EXPORT_ARENA_PORT}`
      Object.assign(process.env, env)
      const client = createClient({ url: env.DATABASE_URL! })
      const { initializeDatabase } = await import('../../src/storage/database.ts')
      await initializeDatabase(client)
      const approval =
        group.rules === 'approved-imported' && approved.ok ? approved.imported : undefined
      if (approval)
        await installApprovalIntoBatch({
          client,
          imported: approval,
          batchEnvironmentId: group.business === 'export' ? 'export-arena' : 'arena',
          batchEntryUrl: group.business === 'export' ? env.EXPORT_ARENA_URL! : env.ARENA_URL!,
        })
      const declarations = await loadBatchDeclarations(client)
      client.close()
      const children: ChildProcess[] = []
      const records: any[] = []
      let log = ''
      const launch = (path: string) => {
        const child = spawn(process.execPath, [path], { env, stdio: ['ignore', 'pipe', 'pipe'] })
        children.push(child)
        for (const stream of [child.stdout, child.stderr])
          stream?.on('data', (b) => {
            log += gateway.redact(String(b))
          })
      }
      const base = env.SERVER_URL!
      const request = async (path: string, body?: unknown) => {
        const response = await fetch(base + path, {
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${env.ARENA_CONTROL_TOKEN}`,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(15000),
        })
        if (!response.ok)
          throw Error(`${path}: ${response.status} ${gateway.redact(await response.text())}`)
        return response.json() as Promise<any>
      }
      let lease: string | undefined
      try {
        launch('dist/server/index.js')
        launch('dist/arena/index.js')
        launch('dist/arena-export/index.js')
        let ready = false
        for (let i = 0; i < 160; i++) {
          try {
            if (
              (await request('/api/health')).model.ready &&
              (await fetch(env.ARENA_URL!)).ok &&
              (await fetch(env.EXPORT_ARENA_URL!)).ok
            ) {
              ready = true
              break
            }
          } catch {}
          await new Promise((r) => setTimeout(r, 250))
        }
        if (!ready) throw Error('Services failed to start')
        const acquired = await request('/api/evaluation/lease', {})
        lease = acquired.lease
        if (
          approval
            ? !acquired.rules.some((r: any) => r.id === approval.proposalId)
            : acquired.rules.some((r: any) => r.category === 'transition')
        )
          throw Error('runtime-rule-isolation-failed')
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]!
          if (row.group !== group.group || stop) continue
          const record: any = {
            group: row.group,
            case: row.case,
            repeat: row.repeat,
            buildHash: builtServerHash,
          }
          const output = resolve(groupDir, `${row.case}-${row.repeat}`)
          await mkdir(output, { recursive: true })
          let score: any
          let runId: string | null = null
          try {
            if (group.business === 'export') {
              record.fixture = await resetAndVerifyExport(row.case as ExportVariantId)
              assertTruth(row.case as ExportVariantId, record.fixture.truth)
              await exportControlRequest('/__control/reset', { variant: row.case })
            } else if (group.group === 'C')
              record.fixture = await resetAndVerify(row.case as VariantId)
            else {
              await assertIdle()
              await controlRequest('/__control/reset', {
                variant: 'C5',
                learningRetryAvailable: row.case === 'healthy',
              })
            }
            gateway.begin(`${row.group}-${row.case}-${row.repeat}`, 30, 300000)
            const run = await request('/api/runs', {
              goal: group.business === 'export' ? EXPORT_GOAL : CHECKOUT_GOAL,
              environmentId: group.business === 'export' ? 'export-arena' : 'arena',
              businessProfile: { id: group.business, revision: '1' },
              budget: RUN_BUDGET,
            })
            runId = run.runId
            const deadline = Date.now() + 330000
            while (true) {
              const current = await request(`/api/runs/${runId}`)
              if (!['queued', 'running'].includes(current.status) && !current.active) break
              if (Date.now() > deadline) {
                await request(`/api/runs/${runId}/cancel`, {})
                throw Error('run-did-not-settle')
              }
              await new Promise((r) => setTimeout(r, 250))
            }
            const report = (record.report = await request(`/api/runs/${runId}/report`))
            const downloaded = await downloadRunEvidence(base, report, resolve(output, 'artifacts'))
            record.artifactIndex = downloaded.index
            artifactIndex.push(...downloaded.index)
            const truth = (record.truth =
              group.business === 'export'
                ? await exportControlRequest('/__control/state')
                : await controlRequest('/__control/state'))
            if (
              report.stopReason === 'reconciliation-required' ||
              report.persistence?.status !== 'verified' ||
              downloaded.index.some((a) => !a.exists)
            )
              stop = 'integrity-stop'
            if (group.business === 'export') {
              const creation = report.events.find(
                (e: any) =>
                  e.type === 'business:observation' &&
                  e.payload.method === 'POST' &&
                  new URL(e.payload.url).pathname === '/api/exports',
              )
              const selection = {
                datasetId: creation?.payload.body?.datasetId ?? '',
                format: creation?.payload.body?.format ?? '',
              }
              score = scoreExportRun(row.case as ExportVariantId, {
                truth,
                requests: truth.requests,
                report,
                artifacts: downloaded.artifacts,
                contract: {
                  ...report.business,
                  retryAvailabilityMs: 5000,
                  environment: {
                    id: report.business.environment.id,
                    origin: report.business.environment.publicOrigin,
                  },
                },
                selection,
                rules: declarations,
                approvedRule: approval
                  ? {
                      id: approval.proposalId,
                      revision: approval.ruleRevision,
                      reviewedBy: approval.reviewedBy,
                      ruleConfig: approval.ruleConfig,
                    }
                  : undefined,
                declaredTarget: approval ? undefined : declaredRecoveryTarget(report.events),
              })
              // Independently download the generated business artifact, rather than trusting its presence.
              if (truth.artifacts > 0) {
                const jobId = creation?.payload.body?.jobId
                const response = await fetch(
                  `${env.EXPORT_ARENA_URL}/api/exports/${jobId}/download`,
                  { signal: AbortSignal.timeout(15000) },
                )
                const body = await response.text()
                await writeFile(resolve(output, 'export-download.txt'), body)
                const expected = truth.artifactContents.find(
                  (a: any) => a.datasetId === selection.datasetId && a.format === selection.format,
                )
                const matches =
                  response.ok &&
                  expected &&
                  body ===
                    (selection.format === 'json'
                      ? JSON.stringify(expected.rows)
                      : expected.rows.join('\n'))
                if (!matches)
                  score = {
                    ...score,
                    passed: false,
                    failedAssertions: [...score.failedAssertions, 'download-content-mismatch'],
                  }
              }
            } else if (group.group === 'C') {
              const checked = evaluateRun(report, row.case as VariantId, row.repeat, {
                fixtureValid: record.fixture.valid === true,
                backend: truth,
                artifacts: downloaded.artifacts,
                events: report.events,
                budget: RUN_BUDGET,
                hypotheses: report.hypotheses,
              })
              score = { ...checked, passed: checked.overallPass }
            } else
              score = scoreBoundRecheck(
                report,
                truth,
                Object.values(downloaded.artifacts),
                approval!.proposalId,
                (approval!.ruleConfig.expectation as { timeoutMs: number }).timeoutMs,
                row.case === 'healthy',
              )
            if (stop) score = { ...score, passed: false }
            record.score = score
          } catch (error) {
            record.error = gateway.redact(String(error))
            score = { passed: false, error: record.error }
            const health = await request('/api/health').catch(() => null)
            if (!health || health.activeRuns || health.queuedRuns || health.storage?.ok !== true)
              stop = 'isolation-or-integrity-stop'
          } finally {
            record.modelRequests = await gateway.end()
          }
          records.push(record)
          rows[i] = { ...row, runId, status: score?.passed ? 'passed' : 'failed', score }
          await writeFile(resolve(output, 'record.json'), JSON.stringify(record, null, 2) + '\n')
          await saveProgress()
          console.log(`${group.group} ${row.case} ${row.repeat}: ${rows[i]!.status}`)
          if (gateway.spending().accountedUsd >= budgetRemainingUsd)
            stop = 'campaign-budget-exhausted'
        }
      } finally {
        if (lease) await request('/api/evaluation/release', { lease }).catch(() => {})
        await Promise.all(children.map(kill))
        await writeFile(resolve(groupDir, 'server.log'), log)
        const audit = await auditStoppedGroup(
          env.DATABASE_URL!,
          records,
          approval ? { id: approval.proposalId, ruleConfig: approval.ruleConfig } : undefined,
        )
        audits.push({ group: group.group, ...audit })
        await write('durability-audit.json', audits)
        if (!audit.passed) stop = 'durability-audit-failed'
      }
    }
  } catch (error) {
    stop = gateway.redact(String(error))
    console.error(stop)
  } finally {
    await gateway.close()
    await saveProgress()
  }
  const batch = scoreExportBatch(
    rows,
    FORMAL_MATRIX.flatMap((g) =>
      g.cases.map((c) => ({ group: g.group, case: c, repeats: g.repeats })),
    ),
  )
  const gatePassed = batch.passed && !stop && !plan.exitNonZero && audits.length === 4
  await write('scoreboard.json', {
    gatePassed,
    batch,
    stop,
    groups: FORMAL_MATRIX.map((g) => ({
      group: g.group,
      passed: rows.filter((r) => r.group === g.group && r.status === 'passed').length,
      total: g.runs,
    })),
  })
  await writeText(
    'summary.md',
    `# Business acceptance\n\nGate: ${gatePassed}\n\n${rows.filter((r) => r.status === 'passed').length}/45 passed. Stop: ${stop || 'none'}.\n`,
  )
  console.log(
    JSON.stringify({
      directory: dir,
      gatePassed,
      stop,
      passed: rows.filter((r) => r.status === 'passed').length,
      total: rows.length,
    }),
  )
  if (!gatePassed) process.exitCode = 1
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
