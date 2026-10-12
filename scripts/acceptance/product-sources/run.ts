import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdir, writeFile, appendFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { startGateway } from '../../../evaluation/support/model-gateway.ts'
import { openCampaignSession } from '../../../evaluation/support/campaign-session.ts'
import { createBatch } from '../../../evaluation/support/model-batch.ts'
import { createValidatedUpstream } from '../../../evaluation/support/validated-upstream.ts'
import { bindRunCancellation } from '../../../evaluation/support/run-cancellation.ts'
import { startArena } from '../../../evaluation/fixtures/counterexample-arena/server.ts'
import { documentFor } from '../../../evaluation/fixtures/product-sources/page.ts'
import { rows } from '../../../evaluation/private/product-sources/truth.ts'
import { policy, publicInput } from './policy.ts'
import { triage } from './evaluate.ts'
import { detailVerdict } from './detail-verdict.ts'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function listen(s: ReturnType<typeof createServer>) {
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  return `http://127.0.0.1:${(s.address() as any).port}`
}
export async function run(
  output: string,
  free: boolean,
  frozen: any,
  key: string,
  quote: unknown,
  approval?: unknown,
) {
  await mkdir(output, { recursive: false })
  const save = (name: string, value: unknown) =>
    writeFile(join(output, name), JSON.stringify(value, null, 2) + '\n')
  await save('manifest.json', frozen)
  await save('quote-at-launch.json', quote)
  if (approval) await save('approval.json', approval)
  const session = await openCampaignSession(join(output, 'account'), String(policy.maxCostUsd))
  const batch = createBatch(session.ledger, frozen, output, undefined, undefined, {
    mainRequests: policy.maxRequests,
    jevRequests: 0,
    windowMs: policy.batchMs,
  })
  let api = '',
    runId = '',
    timingRow = '',
    sequence = 0
  const unbind = bindRunCancellation(batch.signal, () => ({ api, runId }))
  const onSignal = () => batch.stop('operator-interrupted')
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)
  const fake: typeof fetch = async () => {
    const common = {
      id: 'free-only',
      model: policy.model,
      provider: policy.provider,
      object: 'chat.completion.chunk',
      created: 1,
    }
    return new Response(
      `data: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'free-finish', type: 'function', function: { name: 'run_finish', arguments: JSON.stringify({ reason: 'unverified-scope' }) } }] }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0 } })}\n\ndata: [DONE]\n\n`,
      { headers: { 'content-type': 'text/event-stream' } },
    )
  }
  const upstream = createValidatedUpstream(free ? fake : fetch, {
    context: () => ({ row: timingRow, sequence: ++sequence }),
    auditWire: batch.auditWire,
    stop: batch.stop,
    record: (v) => appendFile(join(output, 'upstream-timing.jsonl'), JSON.stringify(v) + '\n'),
  })
  const gateway = await startGateway(key, output, upstream, {
    limitUsd: policy.maxCostUsd,
    estimateCost: batch.estimate,
    ledger: {
      ...batch.ledger,
      async reserve(input) {
        // Check recorded safety interventions before every subsequent model request.
        // Cost admission and dispatch linearization still belong to the shared ledger.
        if (runId) {
          const events = await request(`/api/runs/${runId}/events`)
          if (events.some((event: any) => event.type === 'execution:intervention'))
            batch.stop('safety-intervention')
        }
        return batch.ledger.reserve(input)
      },
    },
    providers: { agent: policy.provider, vision: 'disabled' },
    phase: policy.version,
  })
  const results: unknown[] = []
  let child: ReturnType<typeof spawn> | undefined
  const stopChild = async () => {
    if (!child) return
    const current = child
    child = undefined
    if (current.exitCode !== null || current.signalCode !== null) return
    const exited = new Promise<void>((r) => current.once('exit', () => r()))
    current.kill('SIGTERM')
    const timer = setTimeout(() => current.kill('SIGKILL'), 5000)
    await exited
    clearTimeout(timer)
  }
  const request = async (path: string, body?: unknown) => {
    const res = await fetch(api + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw Error(`api-${res.status}:${path}`)
    return res.json() as Promise<any>
  }
  try {
    for (const row of rows) {
      batch.guard()
      timingRow = row.id
      sequence = 0
      runId = ''
      const dir = join(output, row.id)
      await mkdir(dir)
      const fixture = await startArena(documentFor(row.variant))
      const port = createServer()
      api = await listen(port)
      await new Promise<void>((r) => port.close(() => r()))
      const logs: string[] = []
      const start = async () => {
        child = spawn(process.execPath, ['dist/server/index.js'], {
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            TMPDIR: process.env.TMPDIR,
            DOTENV_CONFIG_PATH: '/dev/null',
            PORT: new URL(api).port,
            DATABASE_URL: 'file:' + join(dir, 'runs.db'),
            AGENT_MODEL: 'openai/' + policy.model,
            OPENAI_BASE_URL: gateway.url,
            OPENAI_API_KEY: gateway.token,
            VISION_MODEL: 'qwen/disabled',
            VISION_API_KEY: gateway.token,
            VISION_BASE_URL: gateway.url,
            VISION_MODEL_FAMILY: 'qwen3',
            EXECUTION_URL_SCAN: '1',
            EXECUTION_PRODUCT_SOURCES: '1',
            URL_SCAN_TRUSTED_ORIGINS: fixture.origin,
            URL_SCAN_DNS_MODE: 'system',
            EXECUTION_BLOCKER_REVIEW: '0',
            EXECUTION_VISUAL_DISCOVERY: '0',
            EXECUTION_POPUP_JEV: '0',
            EXECUTION_JOURNEYS: '0',
            MODEL_REQUEST_MAX_RETRIES: '0',
            MODEL_REQUEST_TIMEOUT_MS: String(policy.modelTimeoutMs),
            RUN_TOTAL_TIMEOUT_MS: String(policy.totalTimeoutMs),
            RUN_MAX_MODEL_CALLS: String(policy.requestsPerRun),
            RUN_MAX_ACTIONS: String(policy.maxActions),
            TOOL_TIMEOUT_MS: String(policy.toolTimeoutMs),
            OTEL_SDK_DISABLED: 'true',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        child.stdout!.on('data', (b) => logs.push(String(b)))
        child.stderr!.on('data', (b) => logs.push(String(b)))
        for (let i = 0; i < 100; i++) {
          if (
            await fetch(api + '/api/health')
              .then((r) => r.ok)
              .catch(() => false)
          )
            return
          if (child.exitCode !== null) throw Error('server-exited')
          await sleep(100)
        }
        throw Error('server-not-ready')
      }
      try {
        await start()
        const accountRun = 'r2-row:' + row.id
        batch.activate(row, accountRun, fixture.origin)
        gateway.begin(accountRun, policy.requestsPerRun, policy.totalTimeoutMs)
        const input = publicInput(fixture.origin)
        await save(row.id + '/request.json', input)
        const created = await request('/api/runs', input)
        runId = created.runId
        if (!runId) throw Error('run-id-missing')
        await save(row.id + '/binding.json', { runId, accountRun, row: row.id })
        const deadline = Date.now() + policy.totalTimeoutMs + 20000
        while (true) {
          const current = await request(`/api/runs/${runId}`)
          if (!['running', 'queued'].includes(current.status) && !current.active) break
          const events = await request(`/api/runs/${runId}/events`)
          if (events.some((event: any) => event.type === 'execution:intervention'))
            batch.stop('safety-intervention')
          if (Date.now() > deadline) {
            batch.stop('task-terminal-timeout')
            throw Error('task-terminal-timeout')
          }
          await sleep(200)
        }
        const report = await request(`/api/runs/${runId}/report`)
        await save(row.id + '/report.json', report)
        await save(row.id + '/snapshot.json', await request(`/api/runs/${runId}`))
        const events = await request(`/api/runs/${runId}/events`)
        await save(row.id + '/events.json', events)
        const artifactBytes = new Map<string, Buffer>()
        const evidence: any[] = []
        await mkdir(join(dir, 'evidence'))
        for (const a of report.artifacts ?? []) {
          const res = await fetch(
            api + `/api/runs/${runId}/artifacts/${encodeURIComponent(a.id)}`,
            { signal: AbortSignal.timeout(10000) },
          )
          if (!res.ok) throw Error('missing-artifact')
          const bytes = Buffer.from(await res.arrayBuffer()),
            file = join(dir, 'evidence', encodeURIComponent(a.id))
          await writeFile(file, bytes)
          artifactBytes.set(a.id, bytes)
          evidence.push({
            id: a.id,
            originalPath: a.path ?? null,
            file,
            bytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          })
        }
        await save(row.id + '/artifact-index.json', evidence)
        const requests = await gateway.end()
        batch.end()
        await stopChild()
        await fixture.close()
        await start()
        const restored = await request(`/api/runs/${runId}/report`)
        await save(row.id + '/restored-report.json', restored)
        const evaluation = {
          ...triage(report, restored, row.expected),
          ...(row.variant === 'defect'
            ? { detailVerdict: detailVerdict(report, events, artifactBytes) }
            : {}),
        }
        if (report.uiScan?.productSource?.source?.markdown !== input.productSource.markdown)
          throw Error('source-not-persisted')
        results.push({
          row: row.id,
          caseId: row.caseId,
          runId,
          realModels: !free,
          requests: requests.length,
          evaluation,
        })
        await save('results.json', results)
        console.log(
          JSON.stringify({
            row: row.id,
            status: report.status,
            requests: requests.length,
            integrity: evaluation.integrity,
            recovered: evaluation.recovered,
            semanticAcceptance: 'pending-human-review',
          }),
        )
        if (!evaluation.integrity || !evaluation.recovered)
          batch.stop('persistence-or-recovery-failure')
        if (['execution-error', 'interrupted'].includes(report.status))
          batch.stop('execution-error')
        if (requests.some((r) => r.status !== 'success' || r.provider !== policy.provider))
          batch.stop('provider-request-failed')
        // A concrete false covered result is a trust failure, not an ordinary incomplete plan.
        if (row.variant === 'unavailable' && report.uiScan?.inspection?.coverage === 'covered')
          batch.stop('false-covered-prerequisite')
        if (report.inspectionIntegrity?.status === 'intervened') batch.stop('safety-intervention')
        if (evaluation.detailVerdict?.hardStop) batch.stop('false-verified-detail')
      } finally {
        await gateway.end()
        batch.end()
        await stopChild()
        await fixture.close().catch(() => {})
        await writeFile(join(dir, 'server.log'), gateway.redact(logs.join('')))
      }
    }
    batch.guard()
  } catch (error) {
    batch.stop('runner-failed')
    await save('failure.json', { error: gateway.redact(String(error)), noRetry: true })
    process.exitCode = 1
  } finally {
    await stopChild()
    await gateway.close()
    await batch.drain()
    batch.dispose()
    unbind()
    process.removeListener('SIGINT', onSignal)
    process.removeListener('SIGTERM', onSignal)
    for (const entry of await session.ledger.entries())
      if (entry.status === 'held')
        await session.ledger.markUnknown(entry.requestId, 'runner-ended-with-unsettled-request')
    await save('accounting.json', {
      spending: await session.ledger.spending(),
      entries: await session.ledger.entries(),
      batch: batch.status(),
      realModels: !free,
    })
    await save('summary.json', {
      completedRows: results.length,
      plannedRows: 6,
      realModels: !free,
      acceptance: 'pending-human-review',
      noAutomaticReruns: true,
    })
    await session.close()
  }
}
