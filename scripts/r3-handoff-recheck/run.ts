import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdir, writeFile, appendFile, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { startGateway } from '../../evaluation/support/model-gateway.ts'
import { openCampaignSession } from '../../evaluation/support/campaign-session.ts'
import { createBatch } from '../r1-online-pilot/batch.ts'
import { createValidatedUpstream } from '../r1-product/upstream.ts'
import { bindRunCancellation } from '../r1-online-pilot/lifecycle.ts'
import {
  policy,
  rows,
  freeRows,
  publicInput,
  htmlFor,
  assess,
  manifest,
  seed,
  verifySeed,
  executionFailure,
} from './policy.ts'
import { digest } from '../../src/agent/exploration/integration/host.ts'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function listen(server: ReturnType<typeof createServer>) {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return `http://127.0.0.1:${(server.address() as any).port}`
}
export async function run(
  output: string,
  free: boolean,
  frozen: any,
  key: string,
  quote: unknown,
  approval?: unknown,
) {
  const prior = verifySeed()
  const selectedRows = free ? freeRows : rows
  await mkdir(output, { recursive: false })
  await copyFile(join(seed, 'runs.db'), join(output, 'runs.db'))
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
    mainReserveUsd: policy.reserveUsd,
  })
  let api = '',
    runId = '',
    rowId = '',
    scenario = 'healthy',
    sequence = 0,
    programId = prior.program.id,
    author = prior.author
  const unbind = bindRunCancellation(batch.signal, () => ({ api, runId }))
  const onSignal = () => batch.stop('operator-interrupted')
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)
  const local = free ? await import('./free-model.ts') : undefined
  const upstream = createValidatedUpstream(
    free
      ? async (_url, init) => local!.freeResponse(JSON.parse(String(init?.body)), rowId, sequence)
      : fetch,
    {
      context: () => ({ row: rowId, sequence: ++sequence }),
      auditWire: batch.auditWire,
      stop: batch.stop,
      record: (v) => appendFile(join(output, 'upstream-timing.jsonl'), JSON.stringify(v) + '\n'),
    },
  )
  const gateway = await startGateway(key, output, upstream, {
    limitUsd: policy.maxCostUsd,
    estimateCost: batch.estimate,
    ledger: batch.ledger,
    providers: { agent: policy.provider, vision: 'disabled' },
    phase: policy.revision,
  })
  const network: any[] = []
  const fixture = createServer((req, res) => {
    network.push({ row: rowId, method: req.method, url: req.url })
    if (req.method !== 'GET' && req.method !== 'HEAD') batch.stop('fixture-write')
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(htmlFor(scenario))
  })
  // Rebind the exact historical fixture origin. Busy port is a hard stop, never substituted.
  try {
    await new Promise<void>((resolve, reject) => {
      fixture.once('error', reject)
      fixture.listen(Number(new URL(prior.program.origin).port), '127.0.0.1', resolve)
    })
  } catch {
    await save('failure.json', { error: 'exact-historical-origin-unavailable', noRetry: true })
    await gateway.close()
    batch.dispose()
    unbind()
    process.removeListener('SIGINT', onSignal)
    process.removeListener('SIGTERM', onSignal)
    await session.close()
    throw Error('exact-historical-origin-unavailable')
  }

  const origin = prior.program.origin,
    port = createServer()
  api = await listen(port)
  await new Promise<void>((r) => port.close(() => r()))
  const results: any[] = [],
    logs: string[] = []
  let child: ReturnType<typeof spawn> | undefined
  async function stopChild() {
    if (!child) return
    const c = child
    child = undefined
    if (c.exitCode !== null || c.signalCode !== null) return
    const done = new Promise<void>((r) => c.once('exit', () => r()))
    c.kill('SIGTERM')
    const timer = setTimeout(() => c.kill('SIGKILL'), 5000)
    await done
    clearTimeout(timer)
  }
  async function request(path: string, body?: unknown) {
    const response = await fetch(api + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await response.json()
    if (!response.ok) throw Error(`api-${response.status}:${path}:${JSON.stringify(data)}`)
    return data as any
  }
  async function start() {
    child = spawn(process.execPath, ['dist/server/index.js'], {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        DOTENV_CONFIG_PATH: '/dev/null',
        PORT: new URL(api).port,
        DATABASE_URL: 'file:' + join(output, 'runs.db'),
        AGENT_MODEL: 'openai/' + policy.model,
        OPENAI_BASE_URL: gateway.url,
        OPENAI_API_KEY: gateway.token,
        VISION_MODEL: 'qwen/disabled',
        VISION_API_KEY: gateway.token,
        VISION_BASE_URL: gateway.url,
        VISION_MODEL_FAMILY: 'qwen3',
        EXECUTION_URL_SCAN: '1',
        EXECUTION_PRODUCT_SOURCES: '1',
        URL_SCAN_TRUSTED_ORIGINS: origin,
        URL_SCAN_DNS_MODE: 'system',
        EXECUTION_BLOCKER_REVIEW: '0',
        EXECUTION_VISUAL_DISCOVERY: '0',
        EXECUTION_POPUP_JEV: '0',
        EXECUTION_JOURNEYS: '0',
        MODEL_REQUEST_MAX_RETRIES: '0',
        MODEL_REQUEST_TIMEOUT_MS: String(policy.modelTimeoutMs),
        RUN_TOTAL_TIMEOUT_MS: String(policy.totalTimeoutMs),
        RUN_MAX_MODEL_CALLS: '12',
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
    const restoredAuthor = await request(`/api/runs/${author.runId}/report`)
    const restoredProgram = await request(`/api/path-programs/${programId}`)
    const resaved = await request(`/api/runs/${author.runId}/path-program`, {})
    if (
      digest(restoredAuthor) !== digest(author) ||
      digest(restoredProgram.program) !== digest(prior.program) ||
      digest(resaved) !== digest(prior.saved)
    )
      throw Error('historical-provenance-revalidation-failed')
    await save('historical-provenance-check.json', {
      authorRunId: author.runId,
      programId,
      reportEqual: true,
      candidateEqual: true,
      originalSaveGatePassed: true,
    })
    for (const row of selectedRows) {
      batch.guard()
      rowId = row.id
      scenario = row.scenario
      sequence = 0
      runId = ''
      if (row.id !== 'author' && !programId) throw Error('qualified-real-author-required')
      const dir = join(output, row.id)
      await mkdir(dir)
      batch.activate(row, 'r3-row:' + row.id, origin)
      gateway.begin('r3-row:' + row.id, row.maxAgentRequests, policy.totalTimeoutMs)
      const started = Date.now(),
        input = {
          ...publicInput(origin),
          pathProgramId: programId,
          ...(row.id === 'source-mismatch'
            ? {
                productSource: {
                  ...publicInput(origin).productSource,
                  version: 'changed-free-only',
                },
              }
            : {}),
          budget: {
            totalTimeoutMs: policy.totalTimeoutMs,
            maxActions: policy.maxActions,
            maxModelCalls: row.maxAgentRequests || 1,
          },
        }
      await save(row.id + '/request.json', input)
      const created = await request('/api/runs', input)
      runId = created.runId
      await save(row.id + '/binding.json', { runId, accountRun: 'r3-row:' + row.id })
      for (;;) {
        const current = await request('/api/runs/' + runId)
        if (!['running', 'queued'].includes(current.status) && !current.active) break
        const events = await request(`/api/runs/${runId}/events`)
        if (events.some((e: any) => e.type === 'execution:intervention'))
          batch.stop('safety-intervention')
        const failure = !free && executionFailure(events)
        if (failure) batch.stop(failure)
        if (Date.now() - started > policy.totalTimeoutMs + 20000) {
          batch.stop('terminal-timeout')
          throw Error('terminal-timeout')
        }
        await sleep(200)
      }
      const report = await request(`/api/runs/${runId}/report`),
        events = await request(`/api/runs/${runId}/events`)
      await save(row.id + '/report.json', report)
      await save(row.id + '/events.json', events)
      const artifacts: any[] = []
      await mkdir(join(dir, 'evidence'))
      for (const a of report.artifacts ?? []) {
        const r = await fetch(api + `/api/runs/${runId}/artifacts/${encodeURIComponent(a.id)}`, {
          signal: AbortSignal.timeout(10000),
        })
        if (!r.ok) throw Error('missing-artifact')
        const bytes = Buffer.from(await r.arrayBuffer()),
          file = join(dir, 'evidence', encodeURIComponent(a.id))
        await writeFile(file, bytes)
        artifacts.push({
          id: a.id,
          file,
          originalPath: a.path,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        })
      }
      await save(row.id + '/artifact-index.json', artifacts)
      const requests = await gateway.end()
      batch.end()
      const verdict =
        row.id === 'source-mismatch'
          ? {
              ok:
                report.uiScan?.pathReuse?.result?.readOnly === false &&
                report.usage.actions === 0 &&
                report.status === 'blocked',
            }
          : assess(row.id.startsWith('handoff') ? 'handoff' : row.id, report, author)
      if (!free && executionFailure(events)) verdict.ok = false
      const handoff = events.find((e: any) => e.type === 'path-reuse:finished')
      if (
        row.id.startsWith('handoff') &&
        events.some(
          (e: any) =>
            [
              'action:executing',
              'product:planned',
              'product:bound',
              'scope:candidate-bound',
            ].includes(e.type) && e.seq > handoff?.seq,
        )
      )
        verdict.ok = false
      const result = {
        row: row.id,
        runId,
        realModels: !free,
        requests: requests.length,
        actions: report.usage.actions,
        elapsedMs: Date.now() - started,
        requestUsage: requests.map((r: any) => ({
          requestId: r.requestId,
          status: r.status,
          usage: r.usage,
        })),
        accountEntries: (await session.ledger.entries()).filter(
          (e) => e.runId === 'r3-row:' + row.id,
        ),
        spending: await session.ledger.spending(),
        verdict,
        readOnlyToolsAfterHandoff: events
          .filter((e: any) => e.type === 'tool:started' && e.seq > handoff?.seq)
          .map((e: any) => e.payload.tool),
      }
      results.push(result)
      await save('results.json', results)
      console.log(JSON.stringify(result))
      if (!verdict.ok) {
        batch.stop('acceptance-row-failed')
        break
      }
      if (requests.some((r: any) => r.status !== 'success' || r.provider !== policy.provider)) {
        batch.stop('provider-request-failed')
        break
      }
      batch.guard()
    }
    // Read-only recovery for completed rows; never resumes a stopped model campaign.
    await stopChild()
    await start()
    for (const row of results) {
      const restored = await request(`/api/runs/${row.runId}/report`)
      await save(row.row + '/restored-report.json', restored)
      const original = JSON.parse(
        await (await import('node:fs/promises')).readFile(
          join(output, row.row, 'report.json'),
          'utf8',
        ),
      )
      if (digest(restored) !== digest(original)) throw Error('report-recovery-mismatch')
    }
    if (digest(await manifest()) !== digest(frozen))
      throw Error('frozen-input-or-build-changed-after-run')
    if (results.length !== selectedRows.length || results.some((r) => !r.verdict.ok))
      process.exitCode = 1
  } catch (error) {
    batch.stop('runner-failed')
    await save('failure.json', { error: gateway.redact(String(error)), noRetry: true })
    process.exitCode = 1
  } finally {
    await gateway.end()
    batch.end()
    await stopChild()
    fixture.close()
    await gateway.close()
    await batch.drain()
    batch.dispose()
    unbind()
    process.removeListener('SIGINT', onSignal)
    process.removeListener('SIGTERM', onSignal)
    for (const e of await session.ledger.entries())
      if (e.status === 'held')
        await session.ledger.markUnknown(e.requestId, 'runner-ended-with-unsettled-request')
    await save('accounting.json', {
      spending: await session.ledger.spending(),
      entries: await session.ledger.entries(),
      batch: batch.status(),
      realModels: !free,
    })
    await save('summary.json', {
      plannedRuns: selectedRows.length,
      completedRuns: results.length,
      realModels: !free,
      noAutomaticReruns: true,
      acceptance: 'pending-transcript-review',
      stopped: batch.status().stopped,
    })
    await save('fixture-requests.json', network)
    await writeFile(join(output, 'server.log'), gateway.redact(logs.join('')))
    await session.close()
  }
}
