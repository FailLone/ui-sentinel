import 'dotenv/config'
import assert from 'node:assert/strict'
import { spawn, spawnSync, execFileSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  startGateway,
  AGENT_MODEL,
  VISION_MODEL,
  REVIEW_MODEL,
  REVIEW_RESERVE_USD,
} from '../../evaluation/support/model-gateway.ts'
import { buildIdentity } from '../../evaluation/support/build-identity.ts'
import { buildFreezeIdentity } from '../../evaluation/support/freeze-identity.ts'
import {
  downloadRunEvidence,
  auditStoppedGroup,
  collectFullEventHistory,
} from '../../evaluation/support/campaign-evidence.ts'
import { resolveProviders } from '../../evaluation/private/export/diagnostic-config.ts'
import { runBatch, type RowOutcome } from '../../evaluation/support/row-runner.ts'
import {
  executableCase,
  visualDiagnosticPlan,
  visualFormalPlan,
  type OutcomeClass,
  type PlanRow,
} from '../../evaluation/support/execution-plan.ts'
import { readFormalSource } from '../../evaluation/support/formal-source.ts'
import { buildArtifactIndex, buildManifest } from '../../evaluation/support/evidence-protocol.ts'
import { buildBatchTiming, measuredDuration } from '../../evaluation/support/batch-timing.ts'
import {
  VISUAL_RUNNER_PROFILE,
  visualFreezeProtocol,
} from '../../evaluation/support/runner-profile.ts'
import {
  assembleToolCalls,
  extractVisionExchanges,
  rowRunId,
} from '../../evaluation/support/gateway-evidence.ts'
import {
  openCampaignSession,
  campaignIdentity,
  writeJson,
} from '../../evaluation/support/campaign-session.ts'
import { currentVisualRevision } from '../../evaluation/support/fixture-revision.ts'
import { sealStage } from '../../evaluation/support/stage-seal.ts'
import { initialiseRows, batchVerdict } from '../../evaluation/support/execution-plan.ts'
import { compareEventHistory } from '../../evaluation/support/audit-compare.ts'
import {
  scoreVisualEvidence,
  SCORER_VERSION,
} from '../../evaluation/private/visual-focus/scorer.ts'
import {
  VISUAL_VIEWPORTS,
  visualTruthFor,
  type VisualCaseId,
} from '../../evaluation/fixtures/visual.ts'

export interface VisualStageOptions {
  mode: 'diagnostic' | 'formal'
  campaignDir: string
  diagnosticSource?: string
}
/** Injection is only available to imported free tests; the CLI has no mock switch. */
export interface FixedStageTransport {
  mode: 'fixed'
  fetch: typeof fetch
  beforeRow?: (row: PlanRow) => void
  skipBuild?: boolean
  onDirectory?: (directory: string) => void
  signal?: AbortSignal
}
export async function runVisualStage(
  options: VisualStageOptions,
  fixed?: FixedStageTransport,
): Promise<number> {
  const { mode, campaignDir, diagnosticSource } = options
  const key = fixed ? 'fixed-only' : process.env.OPENROUTER_API_KEY
  if (!key) throw Error('configuration-missing: OPENROUTER_API_KEY; no mock fallback')
  const providers = resolveProviders(process.env)
  if (!providers.ok) throw Error(`Pinned provider mismatch: ${providers.reasonCodes.join(',')}`)
  if (!fixed && execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
    throw Error('Freeze clean commit before a paid run')
  if (!fixed?.skipBuild && spawnSync('pnpm', ['build'], { stdio: 'inherit' }).status !== 0)
    throw Error('build-failed')
  const build = await buildIdentity(),
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const campaignId = await campaignIdentity(campaignDir),
    revision = await currentVisualRevision()
  const freeze = buildFreezeIdentity({
    commit,
    buildHash: build.hash,
    buildFiles: build.files,
    protocol: visualFreezeProtocol(providers),
    fixtureRevision: revision.revision,
    fixtureHash: revision.hash,
    scorerVersion: SCORER_VERSION,
    target: { tag: 'input', type: 'search', id: 'product-search-input' },
    featureProfile: VISUAL_RUNNER_PROFILE.featureProfile,
  })
  const plan = mode === 'diagnostic' ? visualDiagnosticPlan() : visualFormalPlan()
  const directory = resolve(
    'data/visual-focus-validation',
    new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8),
  )
  await mkdir(directory, { recursive: true })
  fixed?.onDirectory?.(directory)
  const write = (name: string, value: unknown) => writeJson(resolve(directory, name), value)
  let rows = initialiseRows(plan),
    audit: any = { passed: false, runs: [] },
    failure: string | null = null
  const manifestBase = {
    ...buildManifest({
      stage: mode,
      mode: fixed ? 'fixed' : 'real',
      identity: { campaignId, buildHash: build.hash, commit },
    }),
    freezeIdentity: freeze,
    fixtureRevision: revision,
    plan,
  }
  await write('manifest.json', { ...manifestBase, passed: false, rows })
  await write('protocol.json', {
    freeze,
    plan,
    goal: 'Inspect the shopping experience, complete one normal purchase, and report evidenced issues and unverified scope.',
    viewports: VISUAL_VIEWPORTS,
  })
  await writeFile(
    resolve(directory, 'runs.jsonl'),
    rows.map((r) => JSON.stringify(r)).join('\n') + '\n',
  )
  if (mode === 'formal' && !fixed) {
    const source =
      diagnosticSource &&
      (await readFormalSource(
        resolve(diagnosticSource),
        { buildHash: build.hash, campaignId },
        freeze,
      ))
    if (!source || !source.ok) {
      await write('manifest.json', {
        ...manifestBase,
        passed: false,
        rows,
        stopReason: source ? source.reason : 'diagnostic-source-missing',
      })
      return 1
    }
  }
  const session = await openCampaignSession(campaignDir)
  const stage = mode
  const phase = `visual-${mode}:${directory}`
  const indexedEvidence: any[] = []
  const abort = new AbortController(),
    children: ChildProcess[] = []
  let gateway: Awaited<ReturnType<typeof startGateway>> | undefined,
    env: NodeJS.ProcessEnv = {},
    base = '',
    logs = '',
    activeRunId: string | null = null
  const cancel = async () => {
    if (activeRunId && base)
      await fetch(`${base}/api/runs/${activeRunId}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(15000),
      }).catch(() => {})
  }
  const onSignal = () => {
    abort.abort()
    void cancel()
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  fixed?.signal?.addEventListener('abort', onSignal, { once: true })
  if (fixed?.signal?.aborted) onSignal()
  const startedAt = Date.now()
  try {
    await session.startStage(directory, 'visual-' + stage)
    const upstream = fixed?.fetch ?? fetch
    const response = await upstream('https://openrouter.ai/api/v1/models', {
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
    })
    if (!response.ok) throw Error('model-list-unavailable')
    const models = (await response.json()) as any
    const prices = [AGENT_MODEL, VISION_MODEL].map((id) =>
      models.data?.find((m: any) => m.id === id),
    )
    if (
      !prices.every(
        (m) =>
          m &&
          Number.isFinite(Number(m.pricing?.prompt)) &&
          Number(m.pricing.prompt) >= 0 &&
          Number.isFinite(Number(m.pricing?.completion)) &&
          Number(m.pricing.completion) >= 0,
      )
    )
      throw Error('model-pricing-unavailable')
    await write('models.json', prices)
    gateway = await startGateway(key, directory, upstream, {
      limitUsd: session.limitUsd,
      phase,
      providers,
      ledger: session.ledger,
      estimateCost: (body) => {
        if (body.model === REVIEW_MODEL) return REVIEW_RESERVE_USD
        const m = prices.find((m) => m.id === body.model)
        if (!m) throw Error('unpriced-model')
        return (
          Buffer.byteLength(JSON.stringify(body)) * Number(m.pricing.prompt) +
          4096 * Number(m.pricing.completion)
        )
      },
    })
    const port = async () => {
      const s = createServer()
      await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
      const n = (s.address() as { port: number }).port
      await new Promise<void>((r) => s.close(() => r()))
      return String(n)
    }
    env = {
      ...process.env,
      PORT: await port(),
      ARENA_PORT: await port(),
      ARENA_API_PORT: await port(),
      ARENA_CONTROL_PORT: await port(),
      ARENA_CONTROL_TOKEN: randomBytes(24).toString('hex'),
      DATABASE_URL: `file:${directory}/runs.db`,
      ARENA_STATIC: '1',
      AGENT_MODEL: `openai/${AGENT_MODEL}`,
      OPENAI_API_KEY: gateway!.token,
      OPENAI_BASE_URL: gateway!.url,
      VISION_MODEL,
      VISION_API_KEY: gateway!.token,
      VISION_BASE_URL: gateway!.url,
      VISION_MODEL_FAMILY: 'qwen3',
      OPENROUTER_API_KEY: '',
      // The frozen condition, from the one place a free test can assert it. The bounded Jev review is on
      // because the plan's configuration table pins it at an explicit 1 for diagnostic and formal, and
      // says the P2 smoke's 0 must not stand in for it; the review is routed through this gateway like the
      // business diagnostic's, so it is metered and counted rather than quietly skipped.
      ...VISUAL_RUNNER_PROFILE.env,
      COMPLETION_REVIEW_API_KEY: gateway!.token,
      COMPLETION_REVIEW_URL: `${gateway!.url}/decisions`,
      RUN_TOTAL_TIMEOUT_MS: '300000',
      RUN_MAX_ACTIONS: '40',
      RUN_MAX_MODEL_CALLS: '30',
      MODEL_REQUEST_TIMEOUT_MS: '60000',
      TOOL_TIMEOUT_MS: '15000',
      OTEL_SDK_DISABLED: 'true',
    }
    base = `http://127.0.0.1:${env.PORT}`
    function launch(entry: string) {
      const p = spawn(process.execPath, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] })
      children.push(p)
      for (const out of [p.stdout, p.stderr])
        out?.on('data', (b) => (logs += gateway!.redact(String(b))))
    }
    async function stop(p: ChildProcess) {
      if (p.exitCode !== null || p.signalCode !== null) return
      await new Promise<void>((done) => {
        const t = setTimeout(() => p.kill('SIGKILL'), 3000)
        p.once('exit', () => {
          clearTimeout(t)
          done()
        })
        p.kill('SIGTERM')
      })
    }
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
    async function json(url: string, body?: unknown, token?: string): Promise<any> {
      const response = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok)
        throw Error(`HTTP ${response.status}: ${gateway!.redact(await response.text())}`)
      return response.json()
    }
    const control = (path: string, body?: unknown) =>
      json(
        `http://127.0.0.1:${env.ARENA_CONTROL_PORT}/__control/${path}`,
        body,
        env.ARENA_CONTROL_TOKEN,
      )
    const goal =
      'Inspect the shopping experience, complete one normal purchase, and report evidenced issues and unverified scope.'

    /** Every downloaded artifact across every row, indexed once at the top level (plan P3.4). */
    /** What each completed row reported, kept so the post-shutdown audit compares rather than trusts. */
    const auditRecords: {
      runId: string
      report: any
      artifactIndex: any[]
      dir: string
    }[] = []

    /**
     * Both sides of the gateway log, for one row's evidence.
     *
     * A request with no matching response is still a request that was sent; the reader keeps it and
     * reports its response as unknown rather than dropping the pair.
     */
    async function readGatewayLogs(directory: string) {
      const read = async (name: string): Promise<any[]> =>
        (await readFile(resolve(directory, name), 'utf8').catch(() => ''))
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l))
      return {
        requests: await read('requests.jsonl'),
        responses: await read('responses.jsonl'),
        ledger: await read('ledger.jsonl'),
      }
    }

    /** Requests the gateway sent for one row, split by model, plus the ones with no usable usage. */
    function requestCounts(
      lines: readonly any[],
      rowRunId: string,
    ): {
      visionRequests: number
      agentRequests: number
      unknownUsage: number
      failedAttempts: number
    } {
      // An exact run match: `<case>-<repeat>` is a prefix relationship, so `startsWith` would count a
      // formal batch's repeats 2 and 3 inside repeat 1's totals.
      const mine = lines.filter((r) => r.run === rowRunId)
      const finished = mine.filter((r) => r.status !== 'pending')
      return {
        visionRequests: mine.filter((r) => r.model === VISION_MODEL).length,
        agentRequests: mine.filter((r) => r.model === AGENT_MODEL).length,
        // A request that finished with no usage was still sent: it is counted, not dropped.
        unknownUsage: finished.filter((r) => !r.usage).length,
        failedAttempts: finished.filter((r) => r.status === 'error' || r.httpStatus >= 400).length,
      }
    }

    async function executeRow(row: PlanRow): Promise<RowOutcome> {
      // The smoke row runs the first diagnostic case for real, so it reaches an outcome instead of staying
      // `not-run` forever - see `executableCase`.
      const id = executableCase(row)
      if (!id) return { runId: null, outcome: 'not-run', reasons: ['non-visual-row'] }
      const dir = resolve(directory, row.case, String(row.repeat))
      await mkdir(dir, { recursive: true })
      await control('reset', { variant: 'C0', visual: visualTruthFor(id).presentation })
      const before = await control('state')
      assert.equal(before.visualPresent, visualTruthFor(id).presentation)
      // One place names a row's gateway run, so the reader can never disagree with the writer.
      gateway!.begin(rowRunId(row), 30, 300000)
      const started = Date.now()
      let runId: string | null = null
      try {
        const run = await json(base + '/api/runs', {
          environmentId: 'arena',
          goal,
          viewport: VISUAL_VIEWPORTS[id],
          budget: { totalTimeoutMs: 300000, maxActions: 40, maxModelCalls: 30 },
        })
        runId = run.runId
        activeRunId = runId
        for (;;) {
          if (abort.signal.aborted)
            await json(`${base}/api/runs/${run.runId}/cancel`, {}).catch(() => {})
          const state = await json(`${base}/api/runs/${run.runId}`)
          if (!['queued', 'running'].includes(state.status) && !state.active) break
          if (Date.now() - started > 330000) {
            await json(`${base}/api/runs/${run.runId}/cancel`, {})
            throw Error('run-did-not-settle')
          }
          await pause(250)
        }
        const report = await json(`${base}/api/runs/${run.runId}/report`)
        const truth = await control('state')
        await write(`${row.case}/${row.repeat}/truth.json`, truth)
        const purchased = truth.orders?.length === 1 && truth.orders[0].status === 'paid'
        const downloaded = await downloadRunEvidence(base, report, resolve(dir, 'artifacts'))
        await write(`${row.case}/${row.repeat}/report.json`, report)
        // Paths are stored relative to this directory so the index still resolves after a move.
        await write(
          `${row.case}/${row.repeat}/artifact-index.json`,
          buildArtifactIndex(downloaded.index, { base: dir }),
        )
        indexedEvidence.push(
          ...buildArtifactIndex(downloaded.index, { base: directory }).map((e) => ({
            ...e,
            case: row.case,
            repeat: row.repeat,
          })),
        )
        // Read the whole history through the paged endpoint and require it to equal what the report
        // returned: a paginated API reader that silently stopped at a page bound is exactly the lost-tail
        // shape E01 names, and the report is not evidence that the API agrees with itself.
        const paged = await collectFullEventHistory(base, run.runId)
        if (!compareEventHistory(paged, report.events).passed)
          return {
            runId: run.runId,
            outcome: 'evidence-invalid',
            reasons: ['api-history-incomplete'],
          }
        // Kept for the post-shutdown audit, which compares what the API reported against a fresh read of
        // the stopped database.
        auditRecords.push({ runId: run.runId, report, artifactIndex: downloaded.index, dir })
        if (report.inspectionIntegrity?.status === 'intervened')
          return { runId: run.runId, outcome: 'side-effect-unknown', reasons: ['intervention'] }
        // The independent scorer recomputes the conclusion from raw evidence and the private truth. The
        // gateway's own logs are read back here, because the two questions the scorer asks - did the agent
        // really make a binding call, and did this image really go to the vision model - can only be
        // answered by the record of what left this process, never by the product under test.
        const wire = await readGatewayLogs(directory)
        const sentVision = extractVisionExchanges({
          ...wire,
          runId: rowRunId(row),
          visionModel: VISION_MODEL,
        })
        const gatewayCalls = assembleToolCalls({
          ...wire,
          rowRunId: rowRunId(row),
          runId: report.runId,
        })
        const verdict = report.findings.find((f: any) =>
          f.evidenceRefs?.some(
            (ref: string) => downloaded.artifacts[ref]?.type === 'focus-receipt',
          ),
        )
        const score = scoreVisualEvidence({
          case: id,
          fixtureRevision: revision.revision,
          fixtureHash: revision.hash,
          target: {
            tag: 'input',
            type: 'search',
            id: 'product-search-input',
            selector: visualTruthFor(id).targetSelector,
          },
          run: {
            runId: report.runId,
            status: report.status,
            businessResult: report.businessResult,
            stopReason: report.stopReason,
            usage: report.usage,
            budget: report.budget,
            coverage: report.coverage,
            events: report.events,
            findings: report.findings.map((f: any) => ({
              ...f,
              candidateId: f.candidateId ?? null,
            })),
            hypotheses: report.hypotheses,
            focusMeasurements: report.focusMeasurements ?? [],
          },
          artifacts: downloaded.artifacts,
          sentVision,
          gatewayCalls,
          declaredVerdict: verdict?.validationStatus ?? 'inconclusive',
        })
        await write(`${row.case}/${row.repeat}/score.json`, score)
        const spent = await session.ledger.spending()
        const countsNow = requestCounts(wire.ledger, rowRunId(row))
        const outcome: OutcomeClass = abort.signal.aborted
          ? 'cancelled'
          : spent.exceeded ||
              spent.accountedUsd >= spent.limitUsd ||
              wire.ledger.some(
                (r: any) => r.run === rowRunId(row) && String(r.error).includes('budget'),
              )
            ? 'budget-exhausted'
            : countsNow.failedAttempts > 0
              ? 'provider-error'
              : score.passed && purchased
                ? 'passed'
                : 'quality-failure'
        const counts = requestCounts(wire.ledger, rowRunId(row))
        return {
          runId: run.runId,
          outcome,
          reasons: [
            ...score.failedAssertions,
            ...(!purchased ? ['business.private-truth-mismatch'] : []),
          ],
          timing: {
            elapsedMs: Date.now() - started,
            modelMs: measuredDuration(report.events, 'model:request-finished'),
            toolMs: measuredDuration(report.events, 'tool:finished'),
            ...counts,
          },
        }
      } catch (error) {
        // The gateway log may itself be the thing that is broken (a half-written line, a missing file),
        // so this read is best-effort: a row that failed must still be recorded with what is known.
        const counts = requestCounts(
          (await readFile(resolve(directory, 'ledger.jsonl'), 'utf8').catch(() => ''))
            .trim()
            .split('\n')
            .filter(Boolean)
            .flatMap((l) => {
              try {
                return [JSON.parse(l)]
              } catch {
                return []
              }
            }),
          rowRunId(row),
        )
        return {
          runId,
          outcome: abort.signal.aborted ? 'cancelled' : 'evidence-invalid',
          reasons: [gateway!.redact(String(error))],
          // A row that failed mid-flight still spent time and requests; dropping them would understate
          // the batch and shrink the denominator E04 requires to be complete.
          timing: { elapsedMs: Date.now() - started, modelMs: null, toolMs: null, ...counts },
        }
      } finally {
        await cancel()
        await gateway!.end()
        activeRunId = null
        await write('spending.json', gateway!.spending())
      }
    }

    launch('dist/server/index.js')
    launch('dist/arena/index.js')
    let ready = false
    for (let i = 0; i < 100 && !abort.signal.aborted; i++) {
      try {
        if (
          (await json(base + '/api/health')).model.ready &&
          (await json(`http://127.0.0.1:${env.ARENA_PORT}/api/variant-config`))
        ) {
          ready = true
          break
        }
      } catch {}
      await pause(100)
    }
    if (!ready) throw Error('services-not-ready')
    const report = await runBatch({
      plan,
      signal: abort.signal,
      stopOnSameMechanismTwice: mode === 'diagnostic',
      execute: async (row) => {
        fixed?.beforeRow?.(row)
        return executeRow(row)
      },
      onRow: async (_row, current) => {
        rows = [...current]
        await writeFile(
          resolve(directory, 'runs.jsonl'),
          rows.map((r) => JSON.stringify(r)).join('\n') + '\n',
        )
      },
    })
    failure = report.stopReason
    await cancel()
    for (const p of children) await stop(p)
    await gateway.end()
    audit = await auditStoppedGroup(env.DATABASE_URL!, auditRecords, undefined)
    await write('artifact-index.json', indexedEvidence)
  } catch (error) {
    failure = String(error)
    if (gateway) failure = gateway.redact(failure)
  } finally {
    try {
      await cancel()
      for (const p of children) {
        if (p.exitCode === null && p.signalCode === null)
          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => p.kill('SIGKILL'), 3000)
            p.once('exit', () => {
              clearTimeout(timer)
              resolve()
            })
            p.kill('SIGTERM')
          })
      }
      if (gateway) await gateway.close()
      const spending = await session.ledger.spending(),
        entries = await session.ledger.entries()
      const verdict = batchVerdict(rows)
      const passed =
        verdict.passed && audit.passed && !failure && !abort.signal.aborted && !spending.exceeded
      await write('artifact-index.json', indexedEvidence)
      await write('persistence-audit.json', audit)
      await write('scoreboard.json', { ...verdict, passed, stopReason: failure, rows })
      await write('spending.json', spending)
      await write('manifest.json', {
        ...manifestBase,
        passed,
        rows,
        stopReason: failure,
        interrupted: abort.signal.aborted,
        paidRequests: fixed ? 0 : entries.filter((e) => e.phase === phase).length,
        spending,
        timing: buildBatchTiming({ startedAtMs: startedAt, endedAtMs: Date.now(), rows }),
      })
      await writeFile(resolve(directory, 'server.log'), logs)
      await session.finishStage(directory, passed)
      await sealStage(directory)
    } finally {
      await session.close()
      process.off('SIGINT', onSignal)
      process.off('SIGTERM', onSignal)
      fixed?.signal?.removeEventListener('abort', onSignal)
    }
  }
  const final = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'))
  console.log(`${final.passed ? 'PASS' : 'FAIL'}: ${directory}`)
  return abort.signal.aborted ? 130 : final.passed ? 0 : 1
}
