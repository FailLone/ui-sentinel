import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { POLICY } from './policy.ts'
import { rows, publicGoal, documentFor } from './fixtures.ts'
import { scoreRow } from './score.ts'
import { publishedQuotes } from './quote.ts'
import { createBatch } from './batch.ts'
import { openCampaignSession } from '../../evaluation/support/campaign-session.ts'
import { startGateway } from '../../evaluation/support/model-gateway.ts'
import { createValidatedUpstream } from '../r1-product/upstream.ts'
import { createPopupAccountOwner } from '../../src/agent/popup/account-owner.ts'
import { installPopupProviderResources } from '../../src/agent/popup/provider.ts'
import { hasInjectedPopupDecision } from '../../src/agent/popup/contract.ts'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const listen = async (server: ReturnType<typeof createServer>) => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}
export async function runBatch(output: string, free: boolean, manifest: unknown) {
  if (hasInjectedPopupDecision()) throw Error('decision-replacement-forbidden')
  if (free && process.env.PARALLEL_POPUP_API_KEY) throw Error('dry-run-refuses-real-credential')
  const key = free ? 'synthetic-not-a-credential' : process.env.PARALLEL_POPUP_API_KEY
  if (!key) throw Error('explicit-PARALLEL_POPUP_API_KEY-required')
  const retained = Object.fromEntries(['PATH', 'HOME', 'TMPDIR'].map((k) => [k, process.env[k]]))
  for (const k of Object.keys(process.env)) delete process.env[k]
  for (const [k, v] of Object.entries(retained)) if (v) process.env[k] = v
  process.env.DOTENV_CONFIG_PATH = '/dev/null'
  if (existsSync(output) || !output.startsWith(resolve('data/parallel-popup-real') + '/'))
    throw Error('fresh-isolated-output-required')
  const quote = free ? { mode: 'synthetic-only' } : await publishedQuotes()
  await mkdir(output, { recursive: true })
  const save = (name: string, data: unknown) =>
    writeFile(join(output, name), JSON.stringify(data, null, 2) + '\n')
  await save('manifest.json', manifest)
  await save('quotes-at-launch.json', quote)
  const session = await openCampaignSession(join(output, 'account'), String(POLICY.maxCostUsd))
  let api = '',
    parent = '',
    owner: ReturnType<typeof createPopupAccountOwner> | undefined
  let gateway: Awaited<ReturnType<typeof startGateway>> | undefined
  const batch = createBatch(session.ledger, output, async (child, expectedParent) => {
    const { getRunSnapshot } = await import('../../src/execution/run-manager.ts')
    const s = await getRunSnapshot(child)
    const e = s?.events.find((e) => e.type === 'run:delegated-from')
    return (
      !!e &&
      e.payload.parentRunId === expectedParent &&
      child === 'check-' + e.payload.childTaskId &&
      !!s &&
      s.run.spec.budget.maxModelCalls <= 3 &&
      s.run.spec.budget.maxActions <= 3 &&
      [320, 640].includes(s.run.spec.viewport.width) &&
      s.run.spec.viewport.height === 480
    )
  })
  const request = async (path: string, body?: unknown) => {
    const r = await fetch(api + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${controlToken}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    })
    const value = (await r.json()) as any
    if (!r.ok) throw Error('product-api-refused:' + r.status)
    return value
  }
  let cancelWork: Promise<unknown> | undefined
  const cancel = () => {
    if (api && parent) cancelWork ??= request(`/api/runs/${parent}/cancel`, {}).catch(() => {})
  }
  batch.signal.addEventListener('abort', cancel)
  const interrupted = () => batch.stop('operator-cancelled')
  process.once('SIGINT', interrupted)
  process.once('SIGTERM', interrupted)
  const fixture = createServer((req, res) => {
    const html = documentFor(req.url ?? '')
    if (req.method !== 'GET' || (!html && req.url !== '/favicon.ico')) {
      batch.stop('fixture-scope-or-write')
      res.writeHead(403).end()
      return
    }
    res.writeHead(html ? 200 : 204, { 'content-type': 'text/html' }).end(html)
  })
  const controlToken = randomUUID()
  let evaluationLease: string | undefined
  const records: unknown[] = [],
    timing: unknown[] = []
  let uninstall: (() => void) | undefined
  let problem: unknown
  let fakeCalls = 0
  try {
    const origin = await listen(fixture)
    const port = createServer()
    api = await listen(port)
    await new Promise<void>((r) => port.close(() => r()))
    const fakeMain: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      const input = body.messages.find((m: any) => m.role === 'user')?.content ?? '{}'
      const view = JSON.parse(typeof input === 'string' ? input : 'null')
      const tasks = view?.checkTasks?.tasks ?? []
      const i = tasks.length
      const action =
        i < 2
          ? {
              name: 'check_task_submit',
              args: {
                version: 1,
                key: `viewport-${i}`,
                kind: 'popup-viewport',
                purpose: '检查弹窗是否超出视口。',
                start: {
                  url: view.checkTasks.entryUrl,
                  viewport: { width: i ? 640 : 320, height: 480 },
                  prerequisites: [],
                },
                publicFacts: [],
                evidenceRefs: [],
                permissions: { session: 'anonymous', writes: 'none', actions: 'local-ui' },
                quota: { actions: 3, modelCalls: 3, reads: 2 },
                deadlineAt: view.checkTasks.deadlineAt,
              },
            }
          : tasks.some((t: any) => ['queued', 'running'].includes(t.status))
            ? { name: 'check_task_wait', args: { waitMs: 1000 } }
            : { name: 'run_finish', args: { reason: 'unverified-scope' } }
      const base = {
        id: `synthetic-main-${++fakeCalls}`,
        model: POLICY.main.model,
        provider: 'Wafer',
        object: 'chat.completion.chunk',
        created: 1,
      }
      return new Response(
        `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: `call-${fakeCalls}`, type: 'function', function: { name: action.name, arguments: JSON.stringify(action.args) } }] }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0.00001 } })}\n\ndata: [DONE]\n\n`,
        { headers: { 'content-type': 'text/event-stream' } },
      )
    }
    const validatedUpstream = createValidatedUpstream(free ? fakeMain : fetch, {
      context: () => ({ row: parent, sequence: timing.length + 1 }),
      auditWire: (url, body) => batch.auditWire(url, body),
      stop: batch.stop,
      record: (t) => {
        timing.push(t)
      },
    })
    const upstream: typeof fetch = async (url, init) => {
      const response = await validatedUpstream(url, init)
      if (!response.ok) return response
      const events = (await response.clone().text())
        .split('\n')
        .filter((l) => l.startsWith('data:') && l.slice(5).trim() !== '[DONE]')
        .map((l) => JSON.parse(l.slice(5)))
      if (
        !events.some((e) => e.provider === 'Wafer') ||
        !events.some((e) =>
          [POLICY.main.model, 'deepseek/deepseek-v4.1-flash-20260910'].includes(e.model),
        )
      ) {
        batch.stop('missing-main-provider-identity')
        throw Error('missing-main-provider-identity')
      }
      return response
    }
    gateway = await startGateway(key, output, upstream, {
      limitUsd: POLICY.maxCostUsd,
      estimateCost: batch.estimate,
      ledger: batch.ledger,
      providers: { agent: 'Wafer', vision: 'disabled' },
      phase: POLICY.version,
    })
    // The batch owns one original lease. Parent executors borrow it; only this owner closes it.
    owner = createPopupAccountOwner(async (directory, limit) => {
      if (resolve(directory) !== session.directory || Number(limit) !== POLICY.maxCostUsd)
        throw Error('batch-account-identity')
      return { ...session, ledger: batch.ledger, close: async () => {} }
    })
    const jevHttp: typeof fetch = async (url, init) => {
      batch.auditWire(String(url), String(init?.body))
      if (free) {
        const body = JSON.parse(String(init?.body)),
          packet = body.state
        await sleep(250)
        init?.signal?.throwIfAborted()
        const choice =
          packet.candidates.find((c: any) => /Details/.test(c.description))?.id ?? 'handoff'
        return Response.json({
          id: 'synthetic-jev-' + packet.binding,
          model: 'typesafe/jev-1.13-20260917',
          provider: 'TypeSafe',
          answers: {
            popup: {
              type: 'choice',
              choice,
              confidence: 1,
              probabilities: Object.fromEntries(
                Object.keys(body.questions.popup.choices).map((k) => [k, k === choice ? 1 : 0]),
              ),
            },
          },
          usage: { input_tokens: 10, output_tokens: 0, cost: 0.000001 },
        })
      }
      try {
        const response = await fetch(url, { ...init, redirect: 'error' })
        if (!response.ok) {
          batch.stop('jev-http-error')
          return response
        }
        return response
      } catch (error) {
        batch.stop('jev-transport-error')
        throw error
      }
    }
    uninstall = installPopupProviderResources({
      accountOwner: owner,
      http: jevHttp,
      ...(free ? { quote: async () => {} } : {}),
    })
    Object.assign(process.env, {
      ARENA_CONTROL_TOKEN: controlToken,
      PORT: new URL(api).port,
      DATABASE_URL: 'file:' + join(output, 'runs.db'),
      AGENT_MODEL: 'openai/' + POLICY.main.model,
      OPENAI_BASE_URL: gateway.url,
      OPENAI_API_KEY: gateway.token,
      VISION_MODEL: 'disabled',
      VISION_API_KEY: 'disabled',
      VISION_BASE_URL: 'http://127.0.0.1:1',
      EXECUTION_URL_SCAN: '1',
      EXECUTION_PARALLEL_CHECK_TASKS: '1',
      EXECUTION_POPUP_JEV: '1',
      POPUP_JEV_ACCOUNT_DIRECTORY: session.directory,
      POPUP_JEV_LIMIT_USD: String(POLICY.maxCostUsd),
      POPUP_JEV_API_KEY: key,
      EXECUTION_BLOCKER_REVIEW: '0',
      EXECUTION_VISUAL_DISCOVERY: '0',
      EXECUTION_JOURNEYS: '0',
      AGENT_LENGTH_RECOVERY_WITHOUT_REASONING: '0',
      MODEL_REQUEST_MAX_RETRIES: '0',
      MODEL_REQUEST_TIMEOUT_MS: String(POLICY.mainTimeoutMs),
      RUN_TOTAL_TIMEOUT_MS: String(POLICY.row.timeoutMs),
      RUN_MAX_ACTIONS: String(POLICY.row.maxActions),
      RUN_MAX_MODEL_CALLS: String(POLICY.row.maxModelCalls),
      URL_SCAN_TRUSTED_ORIGINS: origin,
      URL_SCAN_DNS_MODE: 'system',
      OTEL_SDK_DISABLED: 'true',
    })
    await import('../../src/server/index.ts')
    for (let i = 0; i < 100; i++) {
      if (await request('/api/health').catch(() => null)) break
      await sleep(100)
    }
    evaluationLease = (await request('/api/evaluation/lease', {})).lease
    for (const row of free ? rows.slice(0, 1) : rows) {
      batch.begin(row.id)
      gateway.begin(row.id, POLICY.row.mainRequests, POLICY.row.timeoutMs)
      const created = await request('/api/runs', {
        kind: 'ui-scan',
        entryUrl: origin + row.path,
        goal: publicGoal,
        popupCheck: { mode: 'popup-viewport' },
        budget: {
          totalTimeoutMs: POLICY.row.timeoutMs,
          maxActions: POLICY.row.maxActions,
          maxModelCalls: POLICY.row.maxModelCalls,
        },
      })
      parent = created.runId
      batch.bind(parent)
      cancelWork = undefined
      let report: any
      for (let i = 0; i < 800; i++) {
        const current = await request(`/api/runs/${parent}`)
        if (!['queued', 'running'].includes(current.status) && !current.active) {
          report = await request(`/api/runs/${parent}/report`)
          break
        }
        if (i % 4 === 0) {
          const snapshot = await request(`/api/runs/${parent}/report`)
          const tasks = snapshot.uiScan?.checkTasks?.tasks ?? []
          if (
            snapshot.persistence?.status === 'inconsistent' ||
            tasks.some((t: any) =>
              /evidence|owner-mismatch|stale-or-swapped|bytes-mismatch/.test(t.error ?? ''),
            )
          )
            batch.stop('live-evidence-mismatch')
          if (
            snapshot.events.some(
              (e: any) =>
                e.type === 'network:channel-denied' ||
                (e.type === 'network:decision' && e.payload.allow === false),
            )
          )
            batch.stop('network-permission')
        }
        if (i * 250 >= POLICY.row.timeoutMs) batch.stop('row-deadline')
        await sleep(250)
      }
      if (!report) {
        batch.stop('cleanup-timeout')
        throw Error('cleanup-timeout')
      }
      await save(`${row.id}-parent.json`, report)
      const children: any[] = []
      for (const t of report.uiScan?.checkTasks?.tasks ?? []) {
        if (!t.execution) continue
        const child = await request(t.execution.reportUrl)
        const inputs = []
        for (const e of child.events.filter((e: any) => e.type === 'popup:decision')) {
          const r = await fetch(api + `/api/runs/${child.runId}/artifacts/${e.payload.packetRef}`)
          if (!r.ok) {
            batch.stop('missing-decision-input')
            break
          }
          inputs.push({ packet: await r.json(), proposal: e.payload.proposal })
        }
        child.decisionInputs = inputs
        children.push(child)
        await save(`${row.id}-${child.runId}.json`, child)
      }
      const scored = scoreRow(row.id, report, children)
      records.push(scored)
      await save(`${row.id}-score.json`, scored)
      if (scored.safetyStop) batch.stop('evidence-or-persistence-mismatch')
      if (
        children.some((c) =>
          c.events.some((e: any) => e.type === 'action:completed' && e.payload.networkWrites > 0),
        )
      )
        batch.stop('unexpected-write')
      await gateway.end()
      const spending = await session.ledger.spending()
      if (spending.unknownCount || spending.exceeded || spending.heldReservedUsd > 0)
        batch.stop('unsettled-row')
      if (free && (!scored.goalPassed || batch.status().stopped))
        throw Error('free-connection-check-failed')
      parent = ''
      batch.end()
      if (batch.signal.aborted) break
    }
  } catch (error) {
    problem = String(error)
    batch.stop('runner-error')
    cancel()
  } finally {
    await cancelWork
    // Wait for ordinary cancellation to drain original child tools/fees before closing the lease.
    if (parent)
      for (let i = 0; i < 120; i++) {
        const run = await request(`/api/runs/${parent}`).catch(() => null)
        if (run && !run.active && !['queued', 'running'].includes(run.status)) break
        await sleep(250)
      }
    if (evaluationLease)
      await request('/api/evaluation/release', { lease: evaluationLease }).catch(() => {})
    await gateway?.close()
    await owner?.close()
    uninstall?.()
    batch.close()
    batch.signal.removeEventListener('abort', cancel)
    process.removeListener('SIGINT', interrupted)
    process.removeListener('SIGTERM', interrupted)
    await save('upstream-timing.json', timing)
    await save('result.json', {
      free,
      realCalls: free ? 0 : undefined,
      problem,
      records,
      batch: batch.status(),
      spending: await session.ledger.spending(),
      requests: await session.ledger.entries(),
    })
    await session.close()
    fixture.closeAllConnections()
    await new Promise<void>((r) => fixture.close(() => r()))
  }
  if (problem) throw Error(String(problem))
  return { output, free, rows: records.length, stopped: batch.status().stopped }
}
