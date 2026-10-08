/** Real service tools + real Chromium; scripted local model, never direct test-driver clicks. */
import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { downloadRunEvidence } from '../../evaluation/support/campaign-evidence.ts'
const phase = process.argv[2] ?? 'baseline'
const root = resolve(
  'data/r0-effect-exploration',
  phase + '-' + new Date().toISOString().replace(/[:.]/g, '-'),
)
await mkdir(root, { recursive: true })
const save = (name: string, v: unknown) =>
  writeFile(resolve(root, name), JSON.stringify(v, null, 2) + '\n')
const listen = async (s: ReturnType<typeof createServer>) => {
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  return `http://127.0.0.1:${(s.address() as any).port}`
}
const repaired = !phase.startsWith('baseline')
const unknownSpec = 'The operation collects evidence only. No functional expectation is supplied.'
const spec =
  'Independent public specification: Filters must reveal Availability options. No result-region selector is declared.'
const fixture = createServer((req, res) => {
  fixtureRequests.push({ mode, method: req.method, path: req.url })
  const known = mode === 'legacy-related'
  const resultText = ['unrelated-postcondition', 'linked-fail'].includes(mode)
    ? 'Unexpected unrelated change'
    : 'Availability options'
  res
    .writeHead(200, { 'content-type': 'text/html' })
    .end(
      `<!doctype html><html><head><style>body{padding:40px;font:18px sans-serif}button{padding:12px}</style></head><body><h1>Inspection example</h1><p id="spec">${['no-expectation', 'posthoc-denied', 'unknown-write'].includes(mode) ? unknownSpec : spec}</p><button id="filters" type="button" ${known ? 'aria-controls="known-result" aria-expanded="false"' : ''}>Filters</button>${mode === 'other-action' ? '<button id="other" type="button">Other</button>' : ''}<p id="count">operations:0</p><p id="sentinel">Unrelated stable text</p>${known ? '<section id="known-result" role="region" hidden>Availability options</section>' : ''}<script>let n=0;document.querySelector('#filters').addEventListener('click',()=>{document.querySelector('#count').textContent='operations:'+(++n);${known ? "document.querySelector('#known-result').hidden=false;document.querySelector('#filters').setAttribute('aria-expanded','true');return;" : ''}const section=document.createElement('section');section.setAttribute('role','region');section.textContent=${JSON.stringify(resultText)};document.body.append(section);${mode === 'unknown-write' ? "fetch('/mutate',{method:'POST',body:'write'}).catch(()=>{})" : ''}});document.querySelector('#other')?.addEventListener('click',()=>{const s=document.createElement('section');s.setAttribute('role','region');s.textContent='Other content';document.body.append(s)})</script></body></html>`,
    )
})
const origin = await listen(fixture)
const fixtureRequests: any[] = []
let savedCheckRef = '',
  controlCSS = '',
  otherCSS = '',
  child: ReturnType<typeof spawn>
const barrier = async () => {
  const done = new Promise<void>((r, j) => {
    const timer = setTimeout(() => j(Error('fault-hook-timeout')), 5000)
    const on = (m: any) => {
      if (m.event === 'execution-failure-armed') {
        clearTimeout(timer)
        child.off('message', on)
        r()
      }
    }
    child.on('message', on)
  })
  child.send!({ command: 'arm-execution-failure' })
  await done
}
let mode = '',
  turn = 0,
  currentRun = ''
const packets: any[] = [],
  results: any[] = [],
  logs: string[] = []
const actionsCount = (r: any) => r.events.filter((e: any) => e.type === 'action:executing').length
const beforeProgram = (selector: string) => ({
  version: 1,
  phenomenon:
    'Collect the unknown public result of the selected control without claiming its effect',
  basis:
    'User authorized this bounded UI inspection. Preserve the independent requirement before operating; identity/specification checks are not effect verification.',
  targets: [
    { name: 'control', selector },
    { name: 'spec', selector: '#spec' },
  ],
  steps: [
    { op: 'measure', name: 'before' },
    { op: 'act', type: 'click', target: 'control' },
    { op: 'measure', name: 'after' },
  ],
  assertions: [
    {
      expectation:
        'The independent public specification is the frozen specification supplied for this run, not an observed result',
      left: { sample: 'before', target: 'spec', metric: 'text' },
      operator: 'eq',
      right: { value: spec },
    },
  ],
})
const model = createServer(async (req, res) => {
  try {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw)
    if (body.model !== 'local-fixed') throw Error('only local-fixed model allowed')
    const packet = JSON.parse(body.messages.find((m: any) => m.role === 'user').content)
    packets.push({ mode, turn, packet })
    const c = packet.inspectionScope.candidates.find((c: any) => c.description.includes('Filters'))
    let calls: any[] = []
    if (repaired && mode === 'invalid-program-reset') {
      if (turn === 0) calls = [{ name: 'element_details', args: { refs: [c.ref] } }]
      else if (turn === 1) {
        const selector = packet.latestToolResults.tools[0].results[0].selector
        calls = [
          {
            name: 'investigation_run',
            args: {
              version: 1,
              phenomenon: 'Invalid selector cannot leak action permission',
              basis: spec,
              targets: [
                { name: 'control', selector },
                { name: 'bad', selector: '???', binding: 'post-action' },
              ],
              steps: [
                { op: 'act', type: 'click', target: 'control' },
                { op: 'bind_results' },
                { op: 'measure', name: 'after' },
              ],
              assertions: [
                {
                  expectation: 'Independent goal',
                  left: { sample: 'after', target: 'bad', metric: 'text' },
                  operator: 'eq',
                  right: { value: 'Availability options' },
                },
              ],
            },
          },
        ]
      } else if (turn === 2) calls = [{ name: 'page_act', args: { type: 'click', ref: c.ref } }]
      else
        calls = [
          {
            name: 'run_finish',
            args: { reason: turn === 3 ? 'scope-covered' : 'unverified-scope' },
          },
        ]
    } else if (repaired && !['unrelated-postcondition', 'legacy-related'].includes(mode)) {
      const collect = (selector: string, effect = true) => ({
        version: 1,
        phenomenon: 'One evidence-only operation with unknown result location',
        basis:
          'Bounded anonymous UI inspection authorized by the run; availability is not permission. No effect assertion is made.',
        exploration: effect
          ? {
              expectedEffect: {
                condition: 'text-equals',
                expected: 'Availability options',
                basis: 'The independent original user goal requires this literal text',
              },
            }
          : {},
        targets: [{ name: 'control', selector }],
        steps: [
          { op: 'act', type: 'click', target: 'control' },
          { op: 'measure', name: 'after' },
        ],
        assertions: [],
      })
      const caps = packet.exploratoryInteractions ?? []
      if (turn === 0)
        calls = [
          {
            name: 'element_details',
            args: { refs: packet.inspectionScope.candidates.map((c: any) => c.ref) },
          },
        ]
      else if (turn === 1) {
        const details = packet.latestToolResults.tools[0].results
        controlCSS = details.find((x: any) => x.text === 'Filters').selector
        otherCSS = details.find((x: any) => x.text === 'Other')?.selector
        if (mode === 'execution-fault') await barrier()
        calls = [
          {
            name: 'investigation_run',
            args: collect(
              controlCSS,
              !['no-expectation', 'posthoc-denied', 'unknown-write'].includes(mode),
            ),
          },
        ]
      } else {
        if (!savedCheckRef)
          savedCheckRef =
            caps.find((x: any) => x.itemId === c.itemId)?.checkRef ?? caps[0]?.checkRef ?? ''
        if (mode === 'cancel' && turn === 2) {
          await fetch(base + `/api/runs/${currentRun}/cancel`, { method: 'POST' })
          calls = [{ name: 'run_finish', args: { reason: 'scope-covered' } }]
        } else if (mode === 'explore-only')
          calls = [
            {
              name: 'run_finish',
              args: { reason: turn === 2 ? 'scope-covered' : 'unverified-scope' },
            },
          ]
        else if (mode === 'repeat-denied' && turn === 2)
          calls = [{ name: 'investigation_run', args: collect(controlCSS) }]
        else if (mode === 'other-action' && turn === 2)
          calls = [{ name: 'investigation_run', args: collect(otherCSS, false) }]
        else {
          const readTurn = ['repeat-denied', 'other-action'].includes(mode) ? 3 : 2
          if (turn === readTurn)
            calls = [
              {
                name: 'page_inspect',
                args: {
                  selector:
                    mode === 'wrong-target' ? 'section,#sentinel' : 'section,[role="region"]',
                  offset: 0,
                },
              },
            ]
          else if (turn === readTurn + 1) {
            const elements = packet.latestToolResults.tools[0].elements
            const observed =
              mode === 'wrong-target'
                ? elements.find((e: any) => e.text === 'Unrelated stable text')
                : elements.find((e: any) => e.tag === 'section')
            const args: any = { checkRef: savedCheckRef, selector: observed.selector }
            if (mode === 'posthoc-denied') args.expected = observed.text
            calls = [{ name: 'interaction_verify', args }]
          } else
            calls = [
              {
                name: 'run_finish',
                args: { reason: turn === readTurn + 2 ? 'scope-covered' : 'unverified-scope' },
              },
            ]
        }
      }
    } else {
      if (turn === 0) {
        const p = beforeProgram('#filters')
        if (mode === 'empty-assertions') p.assertions = []
        if (mode === 'legacy-related') {
          p.targets.push({
            name: 'result',
            selector: '#known-result',
            binding: 'post-action',
          } as any)
          p.steps = [
            { op: 'act', type: 'click', target: 'control' },
            { op: 'bind_results' },
            { op: 'measure', name: 'after' },
          ] as any
          p.assertions = [
            {
              expectation:
                'Public control aria-controls names the hidden result slot and user goal requires its disclosure',
              left: { sample: 'after', target: 'result', metric: 'displayed' },
              operator: 'eq',
              right: { value: true },
            },
          ] as any
        }
        if (mode === 'unrelated-postcondition') {
          p.targets.push({ name: 'sentinel', selector: '#sentinel', binding: 'post-action' } as any)
          p.steps = [
            { op: 'act', type: 'click', target: 'control' },
            { op: 'bind_results' },
            { op: 'measure', name: 'after' },
          ] as any
          p.assertions = [
            {
              expectation: 'Adversarial unrelated assertion must not verify Filters',
              left: { sample: 'after', target: 'sentinel', metric: 'text' },
              operator: 'eq',
              right: { value: 'Unrelated stable text' },
            },
          ]
        }
        calls = [{ name: 'investigation_run', args: p }]
      } else if (mode === 'later-measurement' && turn === 1) {
        calls = [{ name: 'page_inspect', args: { selector: 'section,[role="region"]', offset: 0 } }]
      } else if (mode === 'later-measurement' && turn === 2) {
        const observed = packet.latestToolResults.tools[0].elements[0]
        calls = [
          {
            name: 'investigation_run',
            args: {
              version: 1,
              phenomenon: 'Measure actual result against the independently supplied specification',
              basis: spec,
              targets: [{ name: 'result', selector: observed.selector }],
              steps: [{ op: 'measure', name: 'current' }],
              assertions: [
                {
                  expectation: 'The independent specification requires Availability options',
                  left: { sample: 'current', target: 'result', metric: 'text' },
                  operator: 'eq',
                  right: { value: 'Availability options' },
                },
              ],
            },
          },
        ]
      } else if (turn === (mode === 'later-measurement' ? 3 : 1))
        calls = [{ name: 'run_finish', args: { reason: 'scope-covered' } }]
      else calls = [{ name: 'run_finish', args: { reason: 'unverified-scope' } }]
    }
    turn++
    const event = {
      id: `fixed-${turn}`,
      object: 'chat.completion.chunk',
      created: 1,
      model: body.model,
    }
    res
      .writeHead(200, { 'content-type': 'text/event-stream' })
      .end(
        `data: ${JSON.stringify({ ...event, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: calls.map((c, i) => ({ index: i, id: `call-${turn}-${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...event, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0 } })}\n\ndata: [DONE]\n\n`,
      )
  } catch (e) {
    res.writeHead(500).end(String(e))
  }
})
const endpoint = await listen(model)
const portServer = createServer()
const base = await listen(portServer)
await new Promise<void>((r) => portServer.close(() => r()))
await build({
  entryPoints: ['src/server/index.ts'],
  outfile: resolve(root, 'server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  sourcemap: true,
})
child = spawn(
  process.execPath,
  [
    '--import',
    resolve('scripts/validation/support/action-input-hook.mjs'),
    resolve(root, 'server.mjs'),
  ],
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
      URL_SCAN_TRUSTED_ORIGINS: origin,
      EXECUTION_MODEL_STREAMING: '1',
      EXECUTION_SHORT_FINISH: '1',
      EXECUTION_BLOCKER_REVIEW: '0',
      EXECUTION_VISUAL_DISCOVERY: '0',
      RUN_TOTAL_TIMEOUT_MS: '300000',
      RUN_MAX_MODEL_CALLS: '30',
      RUN_MAX_ACTIONS: '20',
      OTEL_SDK_DISABLED: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  },
)
child.stdout!.on('data', (b) => logs.push(String(b)))
child.stderr!.on('data', (b) => logs.push(String(b)))
try {
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(base + '/api/health')
        .then((r) => r.ok)
        .catch(() => false)
    )
      break
    if (i === 99) throw Error('service unavailable')
    await new Promise((r) => setTimeout(r, 100))
  }
  for (mode of repaired
    ? [
        'linked-pass',
        'linked-fail',
        'explore-only',
        'no-expectation',
        'repeat-denied',
        'wrong-target',
        'posthoc-denied',
        'other-action',
        'cancel',
        'execution-fault',
        'unknown-write',
        'unrelated-postcondition',
        'legacy-related',
        'invalid-program-reset',
      ]
    : [
        'empty-assertions',
        'precondition-exploration',
        'later-measurement',
        'unrelated-postcondition',
        'legacy-related',
      ]) {
    if (process.argv[3] && mode !== process.argv[3]) continue
    turn = 0
    savedCheckRef = ''
    controlCSS = ''
    otherCSS = ''
    console.log(JSON.stringify({ starting: mode }))
    const created: any = await fetch(base + '/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'ui-scan',
        entryUrl: origin + '/',
        goal: ['no-expectation', 'posthoc-denied', 'unknown-write'].includes(mode)
          ? unknownSpec
          : spec,
      }),
    }).then((r) => r.json())
    if (!created.runId) throw Error('creation failed ' + JSON.stringify(created))
    currentRun = created.runId
    let report: any
    for (let i = 0; i < 500; i++) {
      const run: any = await fetch(base + `/api/runs/${currentRun}`).then((r) => r.json())
      if (!['queued', 'running'].includes(run.status) && !run.active) {
        report = await fetch(base + `/api/runs/${currentRun}/report`).then((r) => r.json())
        break
      }
      await new Promise((r) => setTimeout(r, 100))
    }
    if (!report) throw Error('run did not stop')
    await save(mode + '-report.json', report)
    const evidence = await downloadRunEvidence(base, report, resolve(root, mode, 'artifacts'))
    await save(mode + '-artifacts.json', evidence.index)
    const items = report.uiScan.inspection.items.filter(
      (i: any) => i.category === 'local-interaction' && i.selected,
    )
    const row = {
      passed: false,
      mode,
      runId: currentRun,
      status: report.status,
      coverage: report.uiScan.coverage,
      proofVerified: report.uiScan.proofVerified,
      items,
      actions: report.events.filter((e: any) => e.type === 'action:executing').length,
      programs: report.events
        .filter((e: any) => e.type === 'program:completed')
        .map((e: any) => e.payload.verdict),
      modelCalls: report.usage.modelCalls,
    }
    if (repaired) {
      const filter = items.find((i: any) => i.basis.includes('Filters'))
      const shouldComplete = [
        'linked-pass',
        'linked-fail',
        'repeat-denied',
        'legacy-related',
      ].includes(mode)
      if (shouldComplete && report.status !== 'completed')
        throw Error(mode + ': complete effect path failed')
      if (!shouldComplete && report.status === 'completed')
        throw Error(mode + ': unfinished or unrelated evidence completed the scope')
      if (mode === 'cancel' && report.status !== 'cancelled') throw Error('cancellation masked')
      if (mode === 'execution-fault' && report.status !== 'execution-error')
        throw Error('execution fault masked')
      if (
        ![
          'other-action',
          'cancel',
          'execution-fault',
          'unknown-write',
          'invalid-program-reset',
        ].includes(mode) &&
        actionsCount(report) !== 1
      )
        throw Error(mode + ': operation repeated or missing')
      if (
        [
          'explore-only',
          'no-expectation',
          'wrong-target',
          'posthoc-denied',
          'other-action',
        ].includes(mode) &&
        filter?.status !== 'pending'
      )
        throw Error(mode + ': original pending item lost')
      if (mode === 'linked-fail' && filter?.status !== 'failed')
        throw Error('grounded failure hidden')
      if (mode === 'linked-pass' && filter?.status !== 'verified')
        throw Error('linked pass missing')
      const explored = report.events.filter((e: any) => e.type === 'interaction:explored')
      if (
        ![
          'execution-fault',
          'unknown-write',
          'unrelated-postcondition',
          'legacy-related',
          'invalid-program-reset',
        ].includes(mode)
      ) {
        if (!explored.length || explored[0].payload.itemId !== filter.itemId)
          throw Error('original exploration association missing')
        if (explored[0].evidenceRefs.length < 4) throw Error('before/after evidence missing')
      }
      const measured = report.events.filter(
        (e: any) => e.type === 'interaction:exploration-measured',
      )
      if (
        ['linked-pass', 'linked-fail', 'repeat-denied'].includes(mode) &&
        (!measured.length ||
          measured[0].payload.actionId !== explored[0].payload.actionId ||
          measured[0].payload.itemId !== filter.itemId)
      )
        throw Error('follow-up associated another action or item')
      const denied = report.events.filter((e: any) => e.type === 'finish:rejected')
      if (
        [
          'explore-only',
          'no-expectation',
          'wrong-target',
          'posthoc-denied',
          'other-action',
          'unrelated-postcondition',
        ].includes(mode) &&
        !denied.length
      )
        throw Error('unfinished scope was not rejected')
      if (mode === 'invalid-program-reset' && actionsCount(report) !== 0)
        throw Error('invalid-program state leaked action permission')
      row.passed = true
    }
    results.push(row)
    await save('results.json', results)
    console.log(JSON.stringify(row))
  }
  await save('identity.json', {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    phase,
    paidModelCalls: 0,
    directDriverClicks: 0,
    productToolEntry: true,
    fixturePublicSpecification: spec,
    budget: { totalTimeoutMs: 300000, maxModelCalls: 30, maxActions: 20 },
  })
} finally {
  child.kill('SIGTERM')
  await new Promise<void>((r) => child.once('exit', () => r()))
  await new Promise<void>((r) => model.close(() => r()))
  await new Promise<void>((r) => fixture.close(() => r()))
  await save('packets.json', packets)
  await save('fixture-requests.json', fixtureRequests)
  await writeFile(resolve(root, 'server.log'), logs.join(''))
  console.log(JSON.stringify({ evidenceRoot: root, paidModelCalls: 0 }))
}
