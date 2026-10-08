/** Free default-entry proof. Local scripted model; no real model or paid acceptance claim. */
import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, writeFile, readFile, access, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@libsql/client'
import {
  startUrlScanFixture,
  URL_SCAN_HOLDOUT_LAYOUT,
} from '../../evaluation/private/url-scan/fixture.ts'
import { downloadRunEvidence } from '../../evaluation/support/campaign-evidence.ts'
import { hashTree } from './url-scan-freeze.ts'
import { verifyDefaultHealthyBehavior } from '../../evaluation/private/url-scan/healthy-behavior.ts'
await rm('data/r0-default-entry-delivery/workbench-continue', { force: true })
const root = resolve('data/r0-default-entry', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(root, { recursive: true })
const save = (name: string, value: unknown) =>
  writeFile(resolve(root, name), JSON.stringify(value, null, 2) + '\n')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  assert = (v: unknown, m: string) => {
    if (!v) throw Error(m)
  }
const listen = async (s: ReturnType<typeof createServer>) => {
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  return `http://127.0.0.1:${(s.address() as { port: number }).port}`
}
const fixture = await startUrlScanFixture(URL_SCAN_HOLDOUT_LAYOUT)
const extra = createServer((req, res) => {
  res.setHeader('content-type', 'text/html')
  if (req.url === '/info' || req.url === '/empty') {
    res.end('<h1>Public information</h1>')
    return
  }
  res.end(
    '<h1>Disclosure controls</h1><p>Each control shows its corresponding public details.</p>' +
      [0, 1, 2, 3]
        .map(
          (i) =>
            `<button type=button id=b${i} onclick="${i === 0 ? '' : `document.getElementById('out${i}').hidden=false`}">Control ${i}</button><section id=out${i} hidden>Public details ${i}</section>`,
        )
        .join('') +
      '<a href=/info>Information</a>',
  )
})
const extraOrigin = await listen(extra),
  reservation = createServer(),
  base = await listen(reservation)
await new Promise<void>((r) => reservation.close(() => r()))
let mode = 'workbench',
  turn = 0,
  currentRun = '',
  entry = '',
  child: ReturnType<typeof spawn>
let uiDriver: ReturnType<typeof spawn> | undefined
const rows: any[] = [],
  reports: any[] = [],
  packets: any[] = [],
  logs: string[] = [],
  hook: any[] = []
const selection = {
  selector: '#sort',
  condition: 'value-equals',
  expected: 'price',
  basis: 'Public Price option has value price',
}
const sorting = {
  selector: '#rows .price',
  condition: 'numeric-ascending',
  basis:
    'Public instruction says prices are numeric and Apply sort applies the selected Price order',
}
const filtering = {
  selector: '#panel',
  condition: 'visible',
  basis: 'Public Filters disclosure opens its associated panel',
}
const barrier = async (command: string, event: string) => {
  const p = new Promise<void>((r, j) => {
    const t = setTimeout(() => j(Error('hook-timeout')), 5000)
    const on = (m: any) => {
      if (m.event === event) {
        clearTimeout(t)
        child.off('message', on)
        r()
      }
    }
    child.on('message', on)
  })
  child.send!({ command })
  await p
}
const model = createServer(async (req, res) => {
  try {
    let raw = ''
    for await (const b of req) raw += b
    const body = JSON.parse(raw),
      packet = JSON.parse(body.messages.find((m: any) => m.role === 'user').content)
    packets.push({ mode, turn, packet })
    const c = (text: string) =>
      packet.inspectionScope.candidates.find((c: any) => c.description.includes(text))
    const act = (text: string, extra: any = {}) => ({
      name: 'page_act',
      args: { type: 'click', ref: c(text)?.ref, ...extra },
    })
    const finish = (reason: string) => ({ name: 'run_finish', args: { reason } })
    let calls: any[] = []
    if (mode === 'many' || mode === 'incomplete') {
      const locals = packet.inspectionScope.candidates.filter(
        (c: any) => c.category === 'local-interaction',
      )
      if (turn === 0)
        calls =
          mode === 'many'
            ? [
                {
                  name: 'exploration_update',
                  args: {
                    state: 'Choose public sample before execution',
                    unexploredBranches: [],
                    selectItems: locals.slice(0, 3).map((c: any) => ({
                      itemId: c.itemId,
                      basis: 'Public disclosure effect; fixed before execution',
                    })),
                  },
                },
              ]
            : [
                act('"Control 0"', {
                  verify: {
                    selector: '#out0',
                    condition: 'visible',
                    basis: 'Control 0 publicly shows detail 0',
                  },
                }),
              ]
      else if (mode === 'incomplete' && turn === 1)
        calls = [
          {
            name: 'exploration_update',
            args: {
              state: 'Only two selected',
              unexploredBranches: [],
              selectItems: locals
                .slice(0, 2)
                .map((c: any) => ({ itemId: c.itemId, basis: 'public' })),
            },
          },
        ]
      else if (mode === 'incomplete')
        calls = [finish(turn === 2 ? 'scope-covered' : 'unverified-scope')]
      else if (turn === 1 || turn === 3 || turn === 4) {
        const i = turn === 1 ? 0 : turn === 3 ? 1 : 2
        calls = [
          act(`"Control ${i}"`, {
            verify: {
              selector: `#out${i}`,
              condition: 'visible',
              basis: `Control ${i} publicly shows detail ${i}`,
            },
          }),
        ]
      } else if (turn === 2)
        calls = [
          {
            name: 'exploration_update',
            args: {
              state: 'Attempt to replace failed target',
              unexploredBranches: [],
              selectItems: [
                { itemId: c('"Control 3"')?.itemId, basis: 'replacement after failure' },
              ],
            },
          },
        ]
      else
        calls = [act('"Information"'), { name: 'page_act', args: { type: 'navigate', url: entry } }]
    } else if (turn === 0)
      calls = [
        {
          name: 'page_act',
          args: { type: 'fill', ref: c('select')?.ref, value: 'price', verify: selection },
        },
      ]
    else if (turn === 1) calls = [act('"Apply sort"', { verify: sorting })]
    else if (mode === 'overlay-healthy' && turn === 2) calls = [finish('scope-covered')]
    else if (mode === 'overlay-healthy' && turn === 3)
      calls = [act('"Filters"', { verify: filtering })]
    else if (mode === 'overlay-defect' && turn === 2)
      calls = [{ name: 'page_act', args: { type: 'probe', ref: c('"Filters"')?.ref } }]
    else if (mode === 'revisit' && turn === 3)
      calls = [{ name: 'page_act', args: { type: 'navigate', url: entry } }]
    else if (mode === 'revisit' && turn === 4)
      calls = [
        {
          name: 'exploration_update',
          args: {
            state: 'Try resampling after revisit',
            unexploredBranches: [],
            selectItems: packet.inspectionScope.candidates
              .filter((c: any) => c.category === 'local-interaction')
              .map((c: any) => ({ itemId: c.itemId, basis: 'new check after revisit' })),
          },
        },
      ]
    else if (mode === 'revisit' && turn >= 5)
      calls = [finish(turn === 5 ? 'scope-covered' : 'unverified-scope')]
    else {
      if (mode === 'cancel')
        await fetch(base + `/api/runs/${currentRun}/cancel`, { method: 'POST' })
      if (mode === 'fault') await barrier('arm-execution-failure', 'execution-failure-armed')
      calls = [act('"About this catalog"')]
      if (mode === 'dom-healthy' || mode === 'workbench')
        calls.push({ name: 'page_act', args: { type: 'navigate', url: entry } })
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
        `data: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: calls.map((c, i) => ({ index: i, id: `call-${turn}-${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\ndata: [DONE]\n\n`,
      )
  } catch (e) {
    res.writeHead(500).end(String(e))
  }
})
const endpoint = await listen(model)
await save('identity.json', {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  source: await hashTree('src'),
  scripts: await hashTree('scripts'),
  dist: await hashTree('dist'),
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
      URL_SCAN_TRUSTED_ORIGINS: fixture.origin + ',' + extraOrigin,
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
child.on('message', (m) => hook.push(m))
async function terminal(id: string) {
  for (let i = 0; i < 600; i++) {
    const r = (await fetch(base + `/api/runs/${id}`).then((r) => r.json())) as any
    if (!['queued', 'running'].includes(r.status) && !r.active)
      return fetch(base + `/api/runs/${id}/report`).then((r) => r.json())
    await sleep(100)
  }
  throw Error('did-not-stop')
}
try {
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(base + '/api/health')
        .then((r) => r.ok)
        .catch(() => false)
    )
      break
    await sleep(100)
    if (i === 99) throw Error('service-unavailable')
  }
  for (mode of [
    'workbench',
    'dom-healthy',
    'overlay-healthy',
    'dom-defect',
    'overlay-defect',
    'many',
    'incomplete',
    'revisit',
    'empty',
    'cancel',
    'fault',
    'blocker',
  ]) {
    turn = 0
    fixture.setVariant(mode === 'dom-defect' || mode === 'overlay-defect' ? 'defective' : 'healthy')
    entry = ['many', 'incomplete'].includes(mode)
      ? extraOrigin + '/controls'
      : mode === 'empty'
        ? extraOrigin + '/empty'
        : fixture.origin +
          (mode === 'blocker'
            ? '/boundary'
            : mode.startsWith('overlay')
              ? '/overlay?category=books'
              : mode === 'workbench'
                ? '/catalog?category=books&sort=price'
                : '/detail?id=1')
    if (mode === 'workbench') {
      await writeFile(
        'data/r0-default-entry-delivery/live.json',
        JSON.stringify({ base, entry, root, mode }, null, 2),
      )
      console.log('READY FOR WORKBENCH ' + root)
      uiDriver = spawn(
        process.execPath,
        ['--import', 'tsx', 'scripts/validation/support/default-entry-workbench.ts'],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
      uiDriver.stdout!.on('data', (b) => logs.push('workbench-driver:' + b))
      uiDriver.stderr!.on('data', (b) => logs.push('workbench-driver:' + b))
      for (let i = 0; i < 3000; i++) {
        const r = (await fetch(base + '/api/runs').then((r) => r.json())) as any
        if (r.runs.length) {
          currentRun = r.runs[0].id
          break
        }
        await sleep(100)
        if (i === 2999) throw Error('workbench-not-submitted')
      }
    } else {
      const r = (await fetch(base + '/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'ui-scan',
          entryUrl: entry,
          ...(mode === 'revisit'
            ? {
                requiredChecks: [
                  {
                    id: 'extra',
                    description: 'Additional public requested control',
                    selector: '#missing-public-control',
                    action: 'click',
                    verify: {
                      selector: '#extra-result',
                      condition: 'visible',
                      basis: 'Caller public additional requirement',
                    },
                  },
                ],
              }
            : {}),
        }),
      }).then((r) => r.json())) as any
      assert(r.runId, 'creation failed ' + JSON.stringify(r))
      currentRun = r.runId
    }
    const report = await terminal(currentRun)
    reports.push(report)
    await save(mode + '-report.json', report)
    const artifacts = await downloadRunEvidence(base, report, resolve(root, mode, 'artifacts'))
    await save(mode + '-artifact-index.json', artifacts.index)
    const events = report.events as any[],
      execute = events.filter((e) => e.type === 'action:executing'),
      frozen = events.filter((e) => e.type === 'scope:sampling-frozen'),
      closed = events.filter((e) => e.type === 'scope:closing')
    const expected =
      mode === 'cancel'
        ? 'cancelled'
        : mode === 'fault'
          ? 'execution-error'
          : ['incomplete', 'revisit', 'blocker'].includes(mode)
            ? 'blocked'
            : 'completed'
    assert(report.status === expected, mode + ': ' + report.status + ' != ' + expected)
    assert(
      report.uiScan.contract.samplingPolicy.revision === 'bounded-ui-sampling-1',
      mode + ': missing default policy',
    )
    if (mode !== 'revisit')
      assert(
        report.uiScan.contract.requiredChecks === undefined,
        mode + ': fake default empty checks',
      )
    if (['completed', 'blocked'].includes(expected))
      assert(
        report.uiScan.proofVerified && report.persistence.status === 'verified',
        mode + ': proof ' + JSON.stringify(report.persistence),
      )
    if (
      ['workbench', 'dom-healthy', 'overlay-healthy', 'dom-defect', 'overlay-defect'].includes(mode)
    ) {
      const first = frozen.find((e) => e.payload.url === entry)
      assert(
        first.payload.count === (mode.startsWith('overlay') ? 3 : 2),
        'sample/public promise mismatch',
      )
      assert(
        first.payload.pool.every((id: string) =>
          report.uiScan.inspection.items.some(
            (i: any) => i.itemId === id && i.selected && ['verified', 'failed'].includes(i.status),
          ),
        ),
        'not all <=3 checked',
      )
      if (!mode.includes('defect')) {
        assert(report.findings.length === 0, 'healthy false finding')
        const snapshots = Object.values(artifacts.artifacts)
          .filter((a: any) => a.exists && a.type === 'snapshot')
          .map((a: any) => a.data)
        assert(
          verifyDefaultHealthyBehavior({
            entryUrl: entry,
            overlay: mode.startsWith('overlay'),
            requests: fixture.requests,
            snapshots,
            report,
          }),
          'independent public effect truth',
        )
      } else
        assert(
          report.findings.some((f: any) => f.validationStatus === 'supported'),
          'defect discovery removed',
        )
    }
    if (mode === 'dom-healthy' || mode === 'workbench') {
      assert(
        execute.length === 3 && report.usage.modelCalls === 3,
        'late return/model after completion',
      )
      assert(
        closed.length === 1 &&
          !events.some((e) => e.type === 'action:executing' && e.seq > closed[0].seq),
        'post closing action',
      )
    }
    if (mode === 'overlay-healthy' || mode === 'incomplete' || mode === 'revisit')
      assert(
        events.some((e) => e.type === 'finish:rejected' && e.payload.missingItems.length),
        'early finish accepted',
      )
    if (mode === 'many') {
      assert(report.uiScan.inspection.sampling[0].selected.length === 3, 'sample replaced')
      assert(
        events.some((e) => e.type === 'scope:admission-refused'),
        'replacement admitted',
      )
      assert(
        report.uiScan.inspection.sampling[0].notChecked.length === 1,
        'unselected scope not recorded',
      )
      assert(
        report.findings.some((f: any) => f.validationStatus === 'supported'),
        'failed selected target lost',
      )
    }
    if (mode === 'incomplete')
      assert(execute.length === 0 && report.usage.actions === 0, 'before full selection dispatched')
    if (mode === 'revisit') {
      assert(frozen.filter((e) => e.payload.url === entry).length === 1, 'revisit resampled')
      assert(
        events.some((e) => e.type === 'scope:admission-refused'),
        'new revisit target admitted',
      )
      assert(
        report.uiScan.inspection.items.some(
          (i: any) =>
            i.basis.startsWith('public-required:extra:') && i.selected && i.status === 'pending',
        ),
        'additional requirement lost',
      )
    }
    if (mode === 'empty')
      assert(
        report.usage.modelCalls === 0 &&
          report.usage.actions === 0 &&
          frozen[0].payload.count === 0,
        'empty source fabricated',
      )
    if (['cancel', 'fault', 'blocker'].includes(mode))
      assert(closed.length === 0, 'priority stop hidden')
    if (mode === 'fault')
      assert(
        events.some((e) => e.type === 'action:failed'),
        'true execution fault masked',
      )
    if (mode === 'blocker')
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
      frames: frozen.length,
      proofVerified: report.uiScan.proofVerified,
      findings: report.findings.length,
    })
    if (mode === 'workbench') {
      await writeFile(
        'data/r0-default-entry-delivery/workbench-result.json',
        JSON.stringify({ runId: currentRun, root, base }, null, 2),
      )
      console.log('WORKBENCH COMPLETE ' + currentRun)
      for (let i = 0; i < 3000; i++) {
        if (
          await access('data/r0-default-entry-delivery/workbench-continue')
            .then(() => true)
            .catch(() => false)
        )
          break
        await sleep(100)
        if (i === 2999) throw Error('workbench-evidence-not-captured')
      }
    }
  }
} finally {
  if (uiDriver?.exitCode === null) uiDriver.kill('SIGTERM')
  child.kill('SIGTERM')
  await Promise.race([new Promise((r) => child.once('exit', r)), sleep(3000)])
  if (child.exitCode === null) child.kill('SIGKILL')
  model.closeAllConnections()
  extra.closeAllConnections()
  await Promise.all([
    fixture.close(),
    new Promise<void>((r) => model.close(() => r())),
    new Promise<void>((r) => extra.close(() => r())),
  ])
  await save('rows.json', rows)
  await save('model-packets.json', packets)
  await save('page-requests.json', fixture.requests)
  await save('hook-events.json', hook)
  await writeFile(resolve(root, 'server.log'), logs.join(''))
}
const db = createClient({ url: 'file:' + resolve(root, 'runs.db') })
try {
  for (const report of reports) {
    const records = await db.execute({
      sql: 'SELECT id,seq,type,payload,evidence_refs FROM run_events WHERE run_id=? ORDER BY seq',
      args: [report.runId],
    })
    assert(records.rows.length === report.events.length, 'raw history count')
    for (const [i, e] of report.events.entries()) {
      const d = records.rows[i]!
      assert(
        d.id === e.id &&
          d.seq === e.seq &&
          d.type === e.type &&
          JSON.stringify(JSON.parse(String(d.payload))) === JSON.stringify(e.payload) &&
          JSON.stringify(JSON.parse(String(d.evidence_refs))) === JSON.stringify(e.evidenceRefs),
        'raw event mismatch',
      )
    }
    const r = await db.execute({
      sql: 'SELECT status,stop_reason,business_result FROM runs WHERE id=?',
      args: [report.runId],
    })
    assert(
      r.rows[0]?.status === report.status &&
        r.rows[0]?.stop_reason === report.stopReason &&
        r.rows[0]?.business_result === report.businessResult,
      'raw terminal mismatch',
    )
  }
} finally {
  db.close()
}
const summary = {
  root,
  passed: rows.length === 12 && rows.every((r) => r.passed),
  rows,
  paidRequests: 0,
  realModel: false,
  rawDatabaseCompared: true,
}
await save('summary.json', summary)
console.log(JSON.stringify(summary, null, 2))
assert(summary.passed, 'free-batch-failed')
