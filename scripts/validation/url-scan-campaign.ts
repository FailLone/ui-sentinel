import { execFileSync, spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'node:net'
import { isDeepStrictEqual } from 'node:util'
import { chromium } from 'playwright'
import { createClient } from '@libsql/client'
import { startGateway, AGENT_MODEL, VISION_MODEL } from '../../evaluation/support/model-gateway.ts'
import { openCampaignSession, writeJson } from '../../evaluation/support/campaign-session.ts'
import { downloadRunEvidence } from '../../evaluation/support/campaign-evidence.ts'
import {
  startUrlScanFixture,
  URL_SCAN_HOLDOUT_LAYOUT,
} from '../../evaluation/private/url-scan/fixture.ts'
import { verifyHealthyBehavior } from '../../evaluation/private/url-scan/healthy-behavior.ts'
import { replayUrlSample } from '../../evaluation/private/url-scan/replay.ts'
import { verifiesSortFinding } from '../../evaluation/private/url-scan/finding-target.ts'
import { urlScanTruth } from '../../evaluation/private/url-scan/truth.ts'
import { scoreUrlScan } from '../../evaluation/private/url-scan/scorer.ts'
import { scoreBoundary } from '../../evaluation/private/url-scan/boundary-scorer.ts'
import { readUrlScanPrices } from './url-scan-prices.ts'
import {
  hashTree,
  dirtyPathsAffectingRuns,
  verifyUrlScanManifest,
  type UrlScanManifest,
} from './url-scan-freeze.ts'

export function urlScanConfiguration(input: {
  providers: unknown
  prices: unknown
  stage: 'diagnostic' | 'formal'
}) {
  return {
    model: AGENT_MODEL,
    visionModel: VISION_MODEL,
    providers: input.providers,
    prices: input.prices,
    stage: input.stage,
    urlScan: true,
    fixtureLayout: URL_SCAN_HOLDOUT_LAYOUT,
    viewport: { width: 1280, height: 768 },
    scope: { maxPages: 3, maxDepth: 1 },
    budget: { totalTimeoutMs: 300000, maxActions: 20, maxModelCalls: 30 },
    timeouts: { toolMs: 15000, modelMs: 60000, retries: 1 },
    gateway: { maxOutputTokens: 4096, smokeRequests: 1, maxRequestsPerRun: 60 },
    lengthRecoveryWithoutReasoning: false,
    visionModelFamily: 'qwen3',
    features: {
      atomicInvestigation: true,
      blockerReview: false,
      observation: true,
      ruleRouting: true,
      journeys: false,
      modelStreaming: true,
      shortFinish: true,
      visualDiscovery: false,
    },
  }
}

export function assertFrozenConfiguration(config: any) {
  if (
    !['diagnostic', 'formal'].includes(config?.stage) ||
    !config.providers?.agent ||
    !config.providers?.vision ||
    !isDeepStrictEqual(config, urlScanConfiguration(config))
  )
    throw Error('frozen-configuration-mismatch')
}

export async function urlScanIdentity() {
  const build = await hashTree(resolve('dist'))
  const scorer = await hashTree(resolve('evaluation/private/url-scan'))
  const harness = await hashTree(resolve('scripts/validation'), {
    skip: (path) => !path.includes('url-scan') || path.endsWith('.test.ts'),
  })
  return {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    buildHash: build.hash,
    scorerHash: scorer.hash,
    fixtureHash: harness.hash,
  }
}
export async function checkCampaignFreeze(manifest: UrlScanManifest) {
  if (!verifyUrlScanManifest(manifest)) throw Error('manifest-hash-invalid')
  if (
    dirtyPathsAffectingRuns(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }))
      .length
  )
    throw Error('freeze-dirty-tree')
  const identity = await urlScanIdentity()
  for (const key of ['commit', 'buildHash', 'scorerHash', 'fixtureHash'] as const)
    if (identity[key] !== manifest[key]) throw Error(`freeze-mismatch:${key}`)
  const config = manifest.configuration as any
  assertFrozenConfiguration(config)
  if (
    config.model !== AGENT_MODEL ||
    config.visionModel !== VISION_MODEL ||
    config.urlScan !== true ||
    !config.providers?.agent ||
    !config.providers?.vision
  )
    throw Error('frozen-model-configuration-incomplete')
  for (const model of [AGENT_MODEL, VISION_MODEL]) {
    if (!(config.prices?.[model]?.prompt > 0) || !(config.prices?.[model]?.completion > 0))
      throw Error('frozen-price-unavailable')
  }
}
export function assertUrlCampaignApproval(
  manifest: UrlScanManifest,
  batch: string,
  mode: string,
  approval: any,
) {
  if (
    approval?.manifestHash !== manifest.hash ||
    approval.batch !== batch ||
    approval.mode !== mode ||
    approval.paid !== true ||
    approval.maxRuns !== manifest.plan.totalRuns ||
    approval.ceilingUsd !== manifest.costCeilingUsd ||
    !approval.campaignDirectory
  )
    throw Error('explicit-paid-approval-required')
  const expected = urlScanTruth().samples.map((sample) => sample.sampleId)
  if (mode === 'diagnostic') expected.push('boundary-diagnostic')
  const repetitions = mode === 'diagnostic' ? 1 : 3
  if (
    manifest.repetitions !== repetitions ||
    JSON.stringify(manifest.samples) !== JSON.stringify(expected)
  )
    throw Error('matrix-does-not-match-stage')
  if (!Number.isSafeInteger(approval.smokeRequests) || approval.smokeRequests !== 1)
    throw Error('one-frozen-smoke-required')
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
async function port() {
  const s = createServer()
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  const p = (s.address() as any).port
  await new Promise<void>((r) => s.close(() => r()))
  return p
}

/** Reuses the existing gateway and durable campaign ledger; no paid call before freeze + approval. */
export async function runUrlCampaign(
  manifest: UrlScanManifest,
  batch: string,
  mode: 'diagnostic' | 'formal',
  testOnly?: { upstreamFetch: typeof fetch; approval: unknown },
) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(batch)) throw Error('invalid-batch-id')
  const approvalPath = process.env.URL_SCAN_APPROVAL_FILE
  if (!approvalPath && !testOnly)
    throw Error('explicit-paid-approval-required: URL_SCAN_APPROVAL_FILE')
  const approval = testOnly?.approval ?? JSON.parse(await readFile(approvalPath!, 'utf8'))
  assertUrlCampaignApproval(manifest, batch, mode, approval)
  if (!testOnly) await checkCampaignFreeze(manifest)
  if (mode === 'formal') {
    const diagnostic = JSON.parse(
      await readFile(resolve(approval.diagnosticDirectory ?? '', 'summary.json'), 'utf8'),
    )
    const previous = JSON.parse(
      await readFile(resolve(approval.diagnosticDirectory ?? '', 'manifest.json'), 'utf8'),
    )
    if (
      !diagnostic.passed ||
      diagnostic.evidenceClass !== 'C' ||
      diagnostic.mode !== 'diagnostic' ||
      diagnostic.rows?.length !== 6 ||
      diagnostic.rows.some((row: any) => !row.passed) ||
      ['commit', 'buildHash', 'fixtureHash', 'scorerHash'].some(
        (key) => previous[key] !== (manifest as any)[key],
      ) ||
      !verifyUrlScanManifest(previous) ||
      !isDeepStrictEqual({ ...previous.configuration, stage: 'formal' }, manifest.configuration)
    )
      throw Error('same-build-diagnostic-required')
  }
  const key = testOnly ? 'free-gateway-fixture-only' : process.env.OPENROUTER_API_KEY
  if (!key) throw Error('configuration-missing: OPENROUTER_API_KEY')
  const directory = resolve('data/r0-url-campaign', batch)
  await mkdir(resolve('data/r0-url-campaign'), { recursive: true })
  await mkdir(directory, { recursive: false })
  const rows = manifest.plan.rows.map((row) => ({
    ...row,
    runId: null as string | null,
    status: 'not-run',
    passed: false,
    error: null as string | null,
  }))
  await writeJson(resolve(directory, 'manifest.json'), manifest)
  await writeJson(resolve(directory, 'rows.json'), rows)
  const session = await openCampaignSession(
    resolve(approval.campaignDirectory),
    String(manifest.costCeilingUsd),
  )
  let gateway: Awaited<ReturnType<typeof startGateway>> | undefined
  let passed = false
  try {
    await session.startStage(directory, `url-${mode}`)
    const configuration = manifest.configuration as any
    // A changed provider price invalidates the frozen estimate before any model request.
    const currentPrices = await readUrlScanPrices(
      configuration.providers,
      testOnly?.upstreamFetch ?? fetch,
    )
    if (!isDeepStrictEqual(currentPrices, configuration.prices))
      throw Error('price-changed-refreeze-required')
    await writeJson(resolve(directory, 'prices.json'), configuration.prices)
    gateway = await startGateway(key, directory, testOnly?.upstreamFetch ?? fetch, {
      ledger: session.ledger,
      limitUsd: manifest.costCeilingUsd,
      providers: configuration.providers,
      phase: `url-${mode}`,
      estimateCost: (body) => {
        const price = configuration.prices[String(body.model)]
        if (!price) throw Error('unpriced-model')
        return Buffer.byteLength(JSON.stringify(body)) * price.prompt + 4096 * price.completion
      },
    })
    gateway.begin('smoke', approval.smokeRequests, 30_000)
    try {
      const response = await fetch(gateway.url + '/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: AGENT_MODEL,
          messages: [{ role: 'user', content: 'Reply with OK.' }],
          stream: false,
        }),
      })
      await writeFile(resolve(directory, 'smoke.json'), await response.text())
      if (!response.ok) throw Error('smoke-failed')
    } finally {
      await gateway.end()
    }
    for (const [index, row] of rows.entries()) {
      if (!testOnly) await checkCampaignFreeze(manifest)
      const spend = await session.ledger.spending()
      if (spend.unknownCount || spend.exceeded || spend.accountedUsd >= manifest.costCeilingUsd)
        throw Error('campaign-spending-unverified-or-exhausted')
      const fixture = await startUrlScanFixture(configuration.fixtureLayout)
      const truth = urlScanTruth().samples.find((s) => s.sampleId === row.sampleId)
      fixture.setVariant(truth?.variant ?? 'healthy')
      const path = truth
        ? new URL(truth.entryUrl).pathname + new URL(truth.entryUrl).search
        : '/boundary'
      const entryUrl = fixture.origin + path
      const runDirectory = resolve(directory, `row-${index + 1}`)
      await mkdir(runDirectory)
      const databaseUrl = `file:${runDirectory}/runs.db`
      const servicePort = await port(),
        base = `http://127.0.0.1:${servicePort}`
      const env = {
        ...process.env,
        PORT: String(servicePort),
        DATABASE_URL: databaseUrl,
        AGENT_MODEL: `openai/${AGENT_MODEL}`,
        OPENAI_API_KEY: gateway.token,
        OPENAI_BASE_URL: gateway.url,
        VISION_MODEL,
        VISION_API_KEY: gateway.token,
        VISION_BASE_URL: gateway.url,
        VISION_MODEL_FAMILY: 'qwen3',
        OPENROUTER_API_KEY: '',
        COMPLETION_REVIEW_API_KEY: '',
        EXECUTION_URL_SCAN: '1',
        URL_SCAN_TRUSTED_ORIGINS: fixture.origin,
        EXECUTION_ATOMIC_INVESTIGATION: '1',
        EXECUTION_BLOCKER_REVIEW: '0',
        EXECUTION_OBSERVATION_REUSE: '1',
        EXECUTION_RULE_ROUTING: '1',
        EXECUTION_JOURNEYS: '0',
        EXECUTION_MODEL_STREAMING: '1',
        EXECUTION_SHORT_FINISH: '1',
        EXECUTION_VISUAL_DISCOVERY: '0',
        RUN_TOTAL_TIMEOUT_MS: '300000',
        RUN_MAX_ACTIONS: '20',
        RUN_MAX_MODEL_CALLS: '30',
        MODEL_REQUEST_MAX_RETRIES: '1',
        TOOL_TIMEOUT_MS: '15000',
        MODEL_REQUEST_TIMEOUT_MS: '60000',
        AGENT_LENGTH_RECOVERY_WITHOUT_REASONING: '0',
        OTEL_SDK_DISABLED: 'true',
      }
      const child = spawn(process.execPath, ['dist/server/index.js'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const logs: string[] = []
      child.stdout?.on('data', (b) => logs.push(String(b)))
      child.stderr?.on('data', (b) => logs.push(String(b)))
      let report: any, saved: Awaited<ReturnType<typeof downloadRunEvidence>> | undefined
      row.status = 'running'
      await writeJson(resolve(directory, 'rows.json'), rows)
      gateway.begin(`row-${index + 1}`, 60, 310_000)
      try {
        let ready = false
        for (let i = 0; i < 100; i++) {
          ready = await fetch(base + '/api/health')
            .then((r) => r.ok)
            .catch(() => false)
          if (ready) break
          await sleep(100)
        }
        if (!ready) throw Error('service-unavailable')
        const goal =
          'Inspect the catalog UI and its controls within the allowed scope. Report evidence-backed issues and anything left unverified.'
        if (index === 0 && mode === 'formal') {
          const browser = await chromium.launch({ headless: true })
          try {
            const page = await browser.newPage()
            await page.goto(base)
            await page.getByRole('radio', { name: /网址 UI 检查/ }).check()
            await page.getByRole('textbox', { name: '网址' }).fill(entryUrl)
            const goalInput = page.getByRole('textbox', { name: /目标/ })
            if ((await goalInput.count()) === 1) await goalInput.fill(goal)
            const created = page.waitForResponse(
              (r) => r.url() === base + '/api/runs' && r.request().method() === 'POST',
            )
            await page.getByRole('button', { name: '开始检查' }).click()
            row.runId = (await (await created).json()).runId
            await page.screenshot({ path: resolve(runDirectory, 'workbench.png') })
          } finally {
            await browser.close()
          }
        } else {
          const response = await fetch(base + '/api/runs', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              kind: 'ui-scan',
              entryUrl,
              goal,
              scope: { maxPages: 3, maxDepth: 1 },
            }),
          })
          if (response.status !== 202) throw Error('run-admission-failed')
          row.runId = ((await response.json()) as any).runId
        }
        await writeJson(resolve(directory, 'rows.json'), rows)
        for (let i = 0; i < 1600; i++) {
          const run = (await fetch(`${base}/api/runs/${row.runId}`).then((r) => r.json())) as any
          if (!['queued', 'running'].includes(run.status) && !run.active) break
          if (i === 1599) {
            await fetch(`${base}/api/runs/${row.runId}/cancel`, { method: 'POST' })
            throw Error('run-did-not-settle')
          }
          await sleep(200)
        }
        report = await fetch(`${base}/api/runs/${row.runId}/report`).then((r) => r.json())
        await writeJson(resolve(runDirectory, 'report.json'), report)
        saved = await downloadRunEvidence(base, report, resolve(runDirectory, 'artifacts'))
        await writeJson(
          resolve(runDirectory, 'artifact-index.json'),
          saved.index.map((entry) => ({
            ...entry,
            path: 'artifacts/' + encodeURIComponent(entry.artifactId),
          })),
        )
        const requests = [...fixture.requests]
        await writeJson(resolve(runDirectory, 'page-requests.json'), requests)
        if (!truth) {
          const verdict = scoreBoundary(report, requests, row.runId!)
          row.passed = verdict.passed
          await writeJson(resolve(runDirectory, 'boundary-verdict.json'), verdict)
        } else {
          const declaredSelectors = Object.values(saved.artifacts).flatMap((a) =>
            a.exists && a.type === 'measurement'
              ? ((a.data as any)?.program?.targets ?? []).map((t: any) => t.selector)
              : a.exists && a.type === 'interaction-measurement'
                ? [(a.data as any)?.input?.selector].filter(Boolean)
                : [],
          )
          const replay = await replayUrlSample(entryUrl, truth, declaredSelectors)
          let controlReplayPassed = true
          let controlResults: typeof replay.resultMeasurements | undefined
          if (truth.variant === 'defective') {
            fixture.setVariant('healthy')
            const control = await replayUrlSample(
              entryUrl,
              { ...truth, variant: 'healthy' },
              declaredSelectors,
            )
            controlReplayPassed = control.passed
            controlResults = control.resultMeasurements
            await writeFile(resolve(runDirectory, 'control-replay.png'), control.screenshot)
            await writeJson(resolve(runDirectory, 'control-replay.json'), {
              ...control,
              screenshot: undefined,
            })
            fixture.setVariant('defective')
          }
          await writeFile(resolve(runDirectory, 'replay.png'), replay.screenshot)
          await writeJson(resolve(runDirectory, 'replay.json'), {
            ...replay,
            screenshot: undefined,
          })
          const snapshots = Object.values(saved.artifacts)
            .filter((a) => a.exists && a.type === 'snapshot')
            .map((a) => a.data as any)
          const agentBehaviorVerified = verifyHealthyBehavior({
            entryUrl,
            overlay: truth.sampleId.startsWith('overlay-'),
            requests,
            snapshots,
          })
          const findingKeysById: Record<string, string> = {}
          for (const finding of report.findings) {
            const evidence = finding.evidenceRefs
              .map((id: string) => saved!.artifacts[id]?.data)
              .filter(Boolean) as any[]
            if (
              truth.expectedFindingKey === 'foreground-control-covered' &&
              finding.ruleId === 'overlay-blocking' &&
              evidence.some((snapshot) =>
                snapshot.elements?.some(
                  (e: any) =>
                    e.text === 'Filters' &&
                    e.enabled &&
                    e.hitSamples?.length >= 5 &&
                    e.hitSamples.every((s: any) => s.relation === 'unrelated'),
                ),
              )
            )
              findingKeysById[finding.id] = truth.expectedFindingKey
            // A DOM assertion must actually measure the rows and contradict the public price order.
            if (
              truth.expectedFindingKey === 'sort-ignores-selection' &&
              evidence.some((receipt) =>
                verifiesSortFinding(receipt, {
                  defective: replay.resultMeasurements,
                  healthy: controlResults,
                  requests,
                  measuredAt: report.events.find(
                    (event: any) =>
                      [
                        'program:measured',
                        'interaction:measured',
                        'interaction:recovered',
                      ].includes(event.type) &&
                      event.evidenceRefs.some(
                        (id: string) => saved!.artifacts[id]?.data === receipt,
                      ),
                  )?.timestamp,
                }),
              )
            )
              findingKeysById[finding.id] = truth.expectedFindingKey
          }
          const verdict = scoreUrlScan({
            run: {
              ...report,
              finishAccepted: report.events.some((e: any) => e.type === 'finish:accepted'),
              proofVerified: report.uiScan?.proofVerified,
              coverage: report.uiScan?.inspection?.coverage,
              items: report.uiScan?.inspection?.items ?? [],
            },
            truth,
            independent: {
              buildIdentity: manifest.buildHash,
              expectedBuildIdentity: manifest.buildHash,
              expectedRunId: row.runId!,
              serverRequestCount: requests.length,
              writeCount: requests.filter((r) => !['GET', 'HEAD', 'OPTIONS'].includes(r.method))
                .length,
              entryObserved: requests.some((r) => r.path === path),
              entryUrl,
              expectedEntryUrl: entryUrl,
              interactionsPerformed: requests.filter((r) => r.path.startsWith('/items?')).length,
              healthyReplayPassed: replay.passed,
              controlReplayPassed,
              agentBehaviorVerified,
              readableEvidenceRefs: Object.entries(saved.artifacts)
                .filter(([, a]) => a.exists)
                .map(([id]) => id),
              interventionCount: report.uiScan?.interventions?.length,
              leakedPrivateAnswers: (await readFile(resolve(directory, 'requests.jsonl'), 'utf8'))
                .split('\n')
                .filter(Boolean)
                .filter((line) => JSON.parse(line).run === `row-${index + 1}`)
                .flatMap(
                  (line) =>
                    line.match(
                      /foreground-control-covered|sort-ignores-selection|expectedFindingKey/g,
                    ) ?? [],
                ),
              reproducedFindingKeys: replay.reproducedFindingKeys,
              findingKeysById,
            },
          })
          row.passed = verdict.outcome !== 'not-verified'
          await writeJson(resolve(runDirectory, 'score.json'), verdict)
        }
        row.status = 'finished'
      } catch (error) {
        row.status = 'failed'
        row.error = String(error)
        row.passed = false
      } finally {
        await gateway.end()
        child.kill('SIGTERM')
        await Promise.race([new Promise((r) => child.once('exit', r)), sleep(3000)])
        if (child.exitCode === null) child.kill('SIGKILL')
        await writeFile(resolve(runDirectory, 'server.log'), gateway.redact(logs.join('')))
        await fixture.close()
        // Independent fresh SQLite read, after the writer exits; compare identities and the whole event prefix.
        if (report && row.runId) {
          const db = createClient({ url: databaseUrl })
          try {
            const rs = await db.execute({
              sql: 'SELECT status,business_result,stop_reason FROM runs WHERE id=?',
              args: [row.runId],
            })
            const es = await db.execute({
              sql: 'SELECT id,run_id,seq,type,payload,evidence_refs FROM run_events WHERE run_id=? ORDER BY seq',
              args: [row.runId],
            })
            const ok =
              rs.rows[0]?.status === report.status &&
              rs.rows[0]?.business_result === report.businessResult &&
              rs.rows[0]?.stop_reason === report.stopReason &&
              es.rows.length === report.events.length &&
              es.rows.every((r, i) => {
                const e = report.events[i]
                return (
                  r.id === e.id &&
                  r.run_id === e.runId &&
                  r.seq === e.seq &&
                  r.type === e.type &&
                  isDeepStrictEqual(JSON.parse(String(r.payload)), e.payload) &&
                  isDeepStrictEqual(JSON.parse(String(r.evidence_refs)), e.evidenceRefs)
                )
              })
            await writeJson(resolve(runDirectory, 'durability.json'), { passed: ok })
            row.passed &&= ok
          } finally {
            db.close()
          }
        }
        await writeJson(resolve(directory, 'rows.json'), rows)
      }
    }
    const finalSpending = await session.ledger.spending()
    passed =
      rows.every((row) => row.passed) && !finalSpending.exceeded && !finalSpending.unknownCount
  } finally {
    await gateway?.close()
    await writeJson(resolve(directory, 'summary.json'), {
      passed,
      mode,
      evidenceClass: testOnly ? 'B' : 'C',
      manifestHash: manifest.hash,
      rows,
      spending: await session.ledger.spending(),
      r0Accepted: false,
    })
    await session.finishStage(directory, passed).catch(() => {})
    await session.close()
  }
  if (!passed) throw Error(`url-campaign-not-passed:${directory}`)
  return directory
}
