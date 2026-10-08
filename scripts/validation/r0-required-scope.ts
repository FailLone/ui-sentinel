/** Free public-contract wiring tests using existing seen fixtures and a local scripted model.
 * Requirements are explicit test requests grounded in public controls, never imported from scorer.
 * Historical paid rows are replayed separately and are not relabelled as passing. */
import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@libsql/client'
import {
  startUrlScanFixture,
  URL_SCAN_HOLDOUT_LAYOUT,
} from '../../evaluation/private/url-scan/fixture.ts'
import { downloadRunEvidence } from '../../evaluation/support/campaign-evidence.ts'
import { hashTree } from './url-scan-freeze.ts'
const root = resolve('data/r0-required-scope', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(root, { recursive: true })
const save = (name: string, value: unknown) =>
  writeFile(resolve(root, name), JSON.stringify(value, null, 2) + '\n')
const assert = (condition: unknown, message: string) => {
  if (!condition) throw Error(message)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const listen = async (s: ReturnType<typeof createServer>) => {
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  return `http://127.0.0.1:${(s.address() as { port: number }).port}`
}
const fixture = await startUrlScanFixture(URL_SCAN_HOLDOUT_LAYOUT)
fixture.setVariant('healthy')
const reservation = createServer(),
  base = await listen(reservation)
await new Promise<void>((r) => reservation.close(() => r()))
const selected = {
  selector: '#sort',
  condition: 'value-equals',
  expected: 'name',
  basis: 'Public Name sort option has value name',
}
const sorted = {
  selector: '#rows li:first-child .name',
  condition: 'text-equals',
  expected: 'Amber gadget',
  basis: 'Public product names and Name sort imply Amber comes first',
}
const filtered = {
  selector: '#panel',
  condition: 'visible',
  basis: 'Public Filters disclosure exposes its associated panel',
}
const publicChecks = [
  {
    id: 'choose-name',
    description: 'Choose the public Name option',
    selector: '#sort',
    action: 'fill',
    value: 'name',
    verify: selected,
  },
  {
    id: 'apply-name',
    description: 'Apply the selected public sort',
    selector: '#apply',
    action: 'click',
    verify: sorted,
  },
  {
    id: 'catalog-info',
    description: 'Check the public catalog link',
    selector: 'a[href="/info"]',
    action: 'link',
  },
]
let mode = '',
  turn = 0,
  currentRun = '',
  requestGoalUrl = ''
const packets: any[] = [],
  rows: any[] = [],
  reports: any[] = [],
  logs: string[] = [],
  ipc: any[] = []
let child: ReturnType<typeof spawn>
const barrier = async (command: string, event: string) => {
  const response = new Promise<void>((r, j) => {
    const timeout = setTimeout(() => j(Error('hook-timeout')), 5000)
    const on = (m: any) => {
      if (m.event === event) {
        clearTimeout(timeout)
        child.off('message', on)
        r()
      }
    }
    child.on('message', on)
  })
  child.send!({ command })
  await response
}
const model = createServer(async (req, res) => {
  try {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw),
      packet = JSON.parse(body.messages.find((m: any) => m.role === 'user').content)
    packets.push({ mode, turn, packet })
    const reqs = packet.inspectionScope.requiredChecks
    const candidate = (id: string) =>
      packet.inspectionScope.candidates.find(
        (c: any) => c.itemId === reqs.find((r: any) => r.id === id)?.boundItemId,
      )
    const act = (id: string, extra: any = {}) => ({
      name: 'page_act',
      args: { type: id === 'choose-name' ? 'fill' : 'click', ref: candidate(id)?.ref, ...extra },
    })
    let calls: any[] = []
    if (mode === 'bulk-default-denied') {
      calls =
        turn === 0
          ? [
              {
                name: 'exploration_update',
                args: {
                  state: 'Default sampling with extra control',
                  unexploredBranches: [],
                  selectItems: packet.inspectionScope.candidates
                    .filter((c: any) => c.category === 'local-interaction')
                    .slice(0, 2)
                    .map((c: any) => ({ itemId: c.itemId, basis: 'public affordance' })),
                },
              },
            ]
          : turn === 1
            ? [
                {
                  name: 'page_act',
                  args: { type: 'fill', selector: '#sort', value: 'name', verify: selected },
                },
              ]
            : [act('catalog-info')]
    } else if (turn === 0) calls = [act('choose-name', { value: 'name', verify: selected })]
    else if (turn === 1 && mode === 'optional-denied') {
      calls = [
        {
          name: 'page_act',
          args: { type: 'click', role: 'button', name: 'Filters', verify: filtered },
        },
      ]
      await sleep(100) // admission must read live time after prompt construction
    } else if (turn === (mode === 'optional-denied' ? 2 : 1))
      calls = [act('apply-name', { verify: sorted })]
    else if (mode === 'filter-pending' && turn === 2)
      calls = [{ name: 'run_finish', args: { reason: 'scope-covered' } }]
    else if (mode === 'filter-pending' && turn === 3) calls = [act('filter', { verify: filtered })]
    else if (mode === 'unmapped' && turn === 3)
      calls = [{ name: 'run_finish', args: { reason: 'scope-covered' } }]
    else if (mode === 'unmapped' && turn >= 4)
      calls = [{ name: 'run_finish', args: { reason: 'unverified-scope' } }]
    else {
      if (mode === 'cancel-closing')
        await fetch(base + `/api/runs/${currentRun}/cancel`, { method: 'POST' })
      if (mode === 'execution-fault')
        await barrier('arm-execution-failure', 'execution-failure-armed')
      calls = [act('catalog-info')]
      if (mode === 'row4-closing')
        calls.push(
          { name: 'page_act', args: { type: 'navigate', url: requestGoalUrl } },
          {
            name: 'exploration_update',
            args: {
              state: 'Extend scope after completion',
              unexploredBranches: [],
              selectItems: packet.inspectionScope.candidates
                .filter((c: any) => c.category === 'local-interaction')
                .map((c: any) => ({ itemId: c.itemId, basis: 'extra Price check' })),
            },
          },
        )
    }
    turn++
    const common = {
      id: `fixed-${turn}`,
      object: 'chat.completion.chunk',
      created: 1,
      model: body.model,
    }
    res
      .writeHead(200, { 'content-type': 'text/event-stream' })
      .end(
        `data: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: calls.map((call, i) => ({ index: i, id: `call-${turn}-${i}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } })) }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\ndata: [DONE]\n\n`,
      )
  } catch (e) {
    res.writeHead(500).end(String(e))
  }
})
const endpoint = await listen(model)
await save('identity.json', {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dist: await hashTree('dist'),
  source: await hashTree('src'),
  scripts: await hashTree('scripts'),
  paidRequests: 0,
  realModel: false,
})
child = spawn(
  process.execPath,
  ['--import', resolve('scripts/validation/support/action-input-hook.mjs'), 'dist/server/index.js'],
  {
    env: {
      ...process.env,
      PORT: new URL(base).port,
      DATABASE_URL: 'file:' + resolve(root, 'runs.db'),
      AGENT_MODEL: 'openai/local-fixed',
      OPENAI_BASE_URL: endpoint + '/v1',
      OPENAI_API_KEY: 'local-only',
      OPENROUTER_API_KEY: '',
      VISION_MODEL: 'qwen/local-fixed',
      VISION_MODEL_FAMILY: 'qwen3',
      VISION_BASE_URL: endpoint + '/v1',
      VISION_API_KEY: 'local-only',
      COMPLETION_REVIEW_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      GOOGLE_API_KEY: '',
      EXECUTION_URL_SCAN: '1',
      URL_SCAN_TRUSTED_ORIGINS: fixture.origin,
      EXECUTION_MODEL_STREAMING: '1',
      EXECUTION_SHORT_FINISH: '1',
      EXECUTION_BLOCKER_REVIEW: '0',
      EXECUTION_VISUAL_DISCOVERY: '0',
      RUN_TOTAL_TIMEOUT_MS: '60000',
      RUN_MAX_MODEL_CALLS: '20',
      RUN_MAX_ACTIONS: '10',
      OTEL_SDK_DISABLED: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  },
)
child.stdout!.on('data', (b) => logs.push(String(b)))
child.stderr!.on('data', (b) => logs.push(String(b)))
child.on('message', (m) => ipc.push(m))
try {
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(base + '/api/health')
        .then((r) => r.ok)
        .catch(() => false)
    )
      break
    await sleep(100)
    if (i === 99) throw Error('server-unavailable')
  }
  // Strict API validation before any run/Chromium is allocated.
  const invalid = await fetch(base + '/api/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'ui-scan',
      entryUrl: fixture.origin + '/detail?id=1',
      requiredChecks: [{ ...publicChecks[0], verify: undefined }],
    }),
  })
  assert(invalid.status === 400, 'incomplete public source accepted')
  const before = (await fetch(base + '/api/runs').then((r) => r.json())) as any
  assert(before.runs.length === 0, 'invalid source queued a run')
  rows.push({ mode: 'invalid-public-source', passed: true, allocatedRuns: 0 })
  for (mode of [
    'row4-closing',
    'bulk-default-denied',
    'filter-pending',
    'unmapped',
    'optional-denied',
    'cancel-closing',
    'execution-fault',
    'real-blocker',
  ]) {
    turn = 0
    requestGoalUrl =
      fixture.origin +
      (mode === 'real-blocker'
        ? '/boundary'
        : mode === 'row4-closing'
          ? '/detail?id=1'
          : '/overlay?category=books')
    const requiredChecks =
      mode === 'bulk-default-denied'
        ? [publicChecks[2]]
        : mode === 'real-blocker'
          ? []
          : [
              ...publicChecks,
              ...(mode === 'filter-pending' || mode === 'unmapped'
                ? [
                    {
                      id: 'filter',
                      description: 'Check the public Filters disclosure',
                      selector: mode === 'unmapped' ? '#missing-public-target' : '#filters',
                      action: 'click',
                      verify: filtered,
                    },
                  ]
                : []),
            ]
    const created = (await fetch(base + '/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'ui-scan',
        entryUrl: requestGoalUrl,
        goal: 'Check declared public controls and report the bounded evidence',
        requiredChecks,
      }),
    }).then((r) => r.json())) as any
    assert(created.runId, `creation failed: ${JSON.stringify(created)}`)
    currentRun = created.runId
    let report: any
    for (let i = 0; i < 600; i++) {
      const run = (await fetch(base + `/api/runs/${currentRun}`).then((r) => r.json())) as any
      if (!['queued', 'running'].includes(run.status) && !run.active) {
        report = await fetch(base + `/api/runs/${currentRun}/report`).then((r) => r.json())
        break
      }
      await sleep(100)
    }
    assert(report, 'run-did-not-stop')
    reports.push(report)
    await save(mode + '-report.json', report)
    const evidence = await downloadRunEvidence(base, report, resolve(root, mode, 'artifacts'))
    await save(mode + '-artifact-index.json', evidence.index)
    const expected =
      mode === 'unmapped' || mode === 'real-blocker'
        ? 'blocked'
        : mode === 'cancel-closing'
          ? 'cancelled'
          : mode === 'execution-fault'
            ? 'execution-error'
            : 'completed'
    assert(report.status === expected, `${mode}: ${report.status} != ${expected}`)
    const events = report.events as any[],
      actions = events.filter((e) => e.type === 'action:executing'),
      closing = events.filter((e) => e.type === 'scope:closing')
    if (['completed', 'blocked'].includes(expected))
      assert(
        report.uiScan.proofVerified && report.persistence.status === 'verified',
        `${mode}: durable proof failed ${JSON.stringify(report.persistence)}`,
      )
    if (mode === 'row4-closing') {
      assert(
        actions.length === 3 && report.usage.modelCalls === 3,
        'row4: return or extra model request happened',
      )
      assert(closing.length === 1 && closing[0].seq > actions.at(-1).seq, 'row4: closing boundary')
      assert(
        !events.some((e) => e.type === 'action:executing' && e.seq > closing[0].seq),
        'queued extension dispatched',
      )
      assert(
        fixture.requests.filter((r) => r.path === '/detail?id=1').length === 1,
        'returned to entry',
      )
      assert(
        !events.some(
          (e) =>
            e.type === 'execution:remaining-obligation-guidance' ||
            e.type === 'execution:contract-repair',
        ),
        'closing used extra allowance',
      )
    }
    if (mode === 'bulk-default-denied') {
      assert(
        events.filter((e) => e.type === 'scope:admission-refused').length === 1 &&
          actions.length === 2,
        'bulk selection bypassed optional admission or waived default work',
      )
      assert(
        !events.some(
          (e) =>
            e.type === 'scope:item-updated' && e.payload.selectionBasis === 'public affordance',
        ),
        'partly applied a refused batch',
      )
    }
    if (mode === 'filter-pending' || mode === 'unmapped') {
      const rejected = events.find((e) => e.type === 'finish:rejected')
      assert(
        rejected && rejected.payload.missingItems.length > 0,
        'missing required check did not reject finish',
      )
      assert(
        rejected.payload.inspection.items.some(
          (i: any) =>
            i.basis.startsWith('public-required:filter:') && i.selected && i.status === 'pending',
        ),
        'filter obligation missing',
      )
      if (mode === 'unmapped')
        assert(
          closing.length === 0 && report.uiScan.inspection.coverage === 'partial',
          'unmapped requirement silently optional',
        )
    }
    if (mode === 'optional-denied') {
      const refusal = events.find((e) => e.type === 'scope:admission-refused')
      assert(
        refusal && refusal.payload.reason === 'cost-upper-bound-unknown',
        'optional unknown bound accepted',
      )
      assert(
        actions.length === 3 && !actions.some((e) => e.payload.target.includes('Filters')),
        'optional control dispatched',
      )
      const cached = packets.find((p) => p.mode === mode && p.turn === 1).packet.budgetRemaining
        .timeMs
      assert(refusal.payload.remaining.timeMs < cached - 50, 'admission reused prompt time')
      assert(
        report.uiScan.inspection.unsupported.some((u: any) =>
          u.dimension.startsWith('optional-not-checked:'),
        ),
        'not checked scope absent from report',
      )
    }
    if (mode === 'cancel-closing' || mode === 'execution-fault' || mode === 'real-blocker')
      assert(closing.length === 0, 'priority stop swallowed by closing')
    if (mode === 'execution-fault')
      assert(
        events.some((e) => e.type === 'action:failed'),
        'true execution failure hidden',
      )
    if (mode === 'real-blocker')
      assert(
        report.uiScan.proof.claim === 'observed-blocker' && report.usage.modelCalls === 0,
        'real blocker ignored',
      )
    rows.push({
      mode,
      runId: currentRun,
      passed: true,
      status: report.status,
      actions: report.usage.actions,
      modelCalls: report.usage.modelCalls,
      proofVerified: report.uiScan?.proofVerified,
      persistence: report.persistence?.status,
    })
  }
} finally {
  child.kill('SIGTERM')
  await Promise.race([new Promise((r) => child.once('exit', r)), sleep(3000)])
  if (child.exitCode === null) child.kill('SIGKILL')
  model.closeAllConnections()
  await Promise.all([fixture.close(), new Promise<void>((r) => model.close(() => r()))])
  await save('rows.json', rows)
  await save('model-packets.json', packets)
  await save('page-requests.json', fixture.requests)
  await save('browser-hook-events.json', ipc)
  await writeFile(resolve(root, 'server.log'), logs.join(''))
}
const db = createClient({ url: 'file:' + resolve(root, 'runs.db') })
try {
  for (const report of reports) {
    const raw = await db.execute({
      sql: 'SELECT id,run_id,seq,type,payload,evidence_refs FROM run_events WHERE run_id=? ORDER BY seq',
      args: [report.runId],
    })
    assert(raw.rows.length === report.events.length, 'history count mismatch')
    for (const [i, e] of report.events.entries()) {
      const r = raw.rows[i]!
      assert(
        r.id === e.id &&
          r.run_id === e.runId &&
          r.seq === e.seq &&
          r.type === e.type &&
          JSON.stringify(JSON.parse(String(r.payload))) === JSON.stringify(e.payload) &&
          JSON.stringify(JSON.parse(String(r.evidence_refs))) === JSON.stringify(e.evidenceRefs),
        'raw event mismatch',
      )
    }
    const terminal = await db.execute({
      sql: 'SELECT status,stop_reason,business_result FROM runs WHERE id=?',
      args: [report.runId],
    })
    assert(
      terminal.rows[0]?.status === report.status &&
        terminal.rows[0]?.stop_reason === report.stopReason &&
        terminal.rows[0]?.business_result === report.businessResult,
      'raw terminal mismatch',
    )
  }
} finally {
  db.close()
}
const summary = {
  directory: root,
  rows,
  passed: rows.length === 9 && rows.every((r) => r.passed),
  databaseHistoryVerified: true,
  paidRequests: 0,
  realModel: false,
  claim: 'Explicit public required scope, budget admission and durable closing; not R0 acceptance',
}
await save('summary.json', summary)
console.log(JSON.stringify(summary, null, 2))
assert(summary.passed, 'free-batch-failed')
