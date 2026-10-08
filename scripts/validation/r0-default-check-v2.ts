/** Free deterministic SDK tools -> real service/executor/Chromium. No direct fixture clicks. */
import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { downloadRunEvidence } from '../../evaluation/support/campaign-evidence.ts'
const phase = process.argv[2] ?? 'dev',
  only = process.argv[3]
const root = resolve(
  'data/r0-default-check-v2',
  phase + '-' + new Date().toISOString().replace(/[:.]/g, '-'),
)
await mkdir(root, { recursive: true })
const save = (name: string, body: unknown) =>
  writeFile(resolve(root, name), JSON.stringify(body, null, 2) + '\n')
const listen = async (s: ReturnType<typeof createServer>) => {
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  return 'http://127.0.0.1:' + (s.address() as any).port
}
let mode = '',
  turn = 0,
  runId = '',
  savedInput: any,
  controlCSS = '',
  stableCSS = '',
  cancelRequested = false
let child: ReturnType<typeof spawn>
const logs: string[] = [],
  packets: any[] = [],
  requests: any[] = [],
  results: any[] = []
const fixture = createServer((req, res) => {
  requests.push({ mode, method: req.method, path: req.url })
  const numeric = mode.startsWith('numeric'),
    advanced = mode === 'advanced',
    native = mode === 'native',
    late = mode === 'late-source'
  const name = numeric ? 'Sort' : 'Reveal',
    text =
      'Synchronously after clicking this button, numbers in its controlled list must be ascending.'
  const statement = numeric ? `<p id="spec">${text}</p>` : ''
  const list = numeric ? '<ul id="list"><li>8</li><li>3</li><li>5</li></ul>' : ''
  const href = ['repeat', 'native', 'advanced', 'more-than-three', 'other-action'].includes(mode)
    ? '<a href="/next">Next</a>'
    : ''
  const others =
    mode === 'other-action'
      ? '<button type="button">Other</button>'
      : mode === 'more-than-three'
        ? '<button type="button">Second</button><button type="button">Third</button><button type="button">Fourth</button>'
        : ''
  const handler = numeric
    ? mode === 'numeric-fail'
      ? "document.querySelector('#list').innerHTML='<li>8</li><li>3</li><li>5</li>'"
      : "document.querySelector('#list').innerHTML='<li>3</li><li>5</li><li>8</li>'"
    : ['neutral-no-change', 'incidental-clock'].includes(mode)
      ? ''
      : mode === 'post-denied'
        ? "fetch('/mutate',{method:'POST',body:'write'}).catch(()=>{})"
        : mode === 'explicit-unfinished'
          ? "setTimeout(()=>{const r=document.createElement('section');r.setAttribute('role','region');r.textContent='Ready';document.body.append(r)},1800)"
          : "const r=document.createElement('section');r.setAttribute('role','region');r.textContent=" +
            JSON.stringify(
              ['explicit-fail', 'workbench-defect'].includes(mode) ? 'Wrong' : 'Ready',
            ) +
            ';document.body.append(r)' +
            (late
              ? ';const p=document.createElement(\'p\');p.textContent=\'Synchronously after clicking "Reveal", show text "Late".\';document.body.append(p)'
              : '')
  const clock =
    mode === 'incidental-clock'
      ? '<time role="timer" id="clock">0</time><script>setTimeout(()=>document.querySelector("#clock").textContent=String(Date.now()),700)</script>'
      : ''
  const form = native
    ? '<label>Choice<select aria-label="Choice"><option value="a">Alpha</option><option value="b">Beta</option></select></label>'
    : ''
  if (req.url === '/next') {
    res
      .writeHead(200, { 'content-type': 'text/html' })
      .end('<!doctype html><h1>Next page</h1><p>Public static content.</p>')
    return
  }
  res
    .writeHead(200, { 'content-type': 'text/html' })
    .end(
      `<!doctype html><html><head><style>body{padding:30px;font:18px sans-serif}button{padding:12px;margin:10px}</style></head><body><h1>Public bounded inspection</h1>${mode === 'intercepted' ? '<div style="position:fixed;z-index:9;inset:0;background:rgba(255,255,255,.2)">Public blocking layer</div>' : ''}${statement}<button id="control" type="button" ${numeric ? 'aria-describedby="spec" aria-controls="list"' : ''}>${name}</button>${list}${form}${clock}${others}${href}<p id="stable">Unrelated stable text</p><script>document.querySelector('#control').addEventListener('click',()=>{${handler}})</script></body></html>`,
    )
})
const origin = await listen(fixture)
const model = createServer(async (req, res) => {
  try {
    let raw = ''
    for await (const b of req) raw += b
    const body = JSON.parse(raw),
      message = body.messages.filter((m: any) => m.role === 'user').at(-1)
    const input = JSON.parse(message.content)
    savedInput = input
    packets.push({ mode, turn, input })
    const candidates = input.inspectionScope?.candidates ?? [],
      local = candidates.filter((c: any) => c.category === 'local-interaction'),
      nav = candidates.find((c: any) => c.category === 'navigation')
    let calls: { name: string; args: any }[] = []
    const click = (c: any) => ({ name: 'page_act', args: { type: 'click', ref: c.ref } })
    if (turn === 0) {
      if (mode === 'execution-fault') {
        const armed = new Promise<void>((r, j) => {
          const timer = setTimeout(() => j(Error('fault arm timeout')), 5000)
          const listen = (m: any) => {
            if (m.event === 'execution-failure-armed') {
              clearTimeout(timer)
              child.off('message', listen)
              r()
            }
          }
          child.on('message', listen)
        })
        child.send!({ command: 'arm-execution-failure' })
        await armed
      }
      if (mode === 'more-than-three')
        calls = [
          {
            name: 'exploration_update',
            args: {
              state: 'fixed public sample',
              unexploredBranches: [],
              selectItems: local.slice(0, 3).map((c: any) => ({
                itemId: c.itemId,
                basis: 'first three observed local controls',
              })),
            },
          },
        ]
      else if (mode === 'missing-operation')
        calls = [{ name: 'run_finish', args: { reason: 'scope-covered' } }]
      else if (mode === 'positive-probe' || mode === 'intercepted')
        calls = [{ name: 'page_act', args: { type: 'probe', ref: local[0].ref } }]
      else if (mode === 'unrelated-program')
        calls = [{ name: 'element_details', args: { refs: [local[0].ref] } }]
      else calls = [click(local[0])]
    } else if (mode === 'changed-evidence' && turn === 1) {
      const original = input.inspectionScope.checkInteractions[0]
      const receipt = JSON.parse(
        execFileSync(
          'python3',
          [
            '-c',
            `import sqlite3,json,sys
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True);r=c.execute('select file_path from artifacts where id=? and run_id=?',(sys.argv[2],sys.argv[3])).fetchone();print(json.dumps(r[0]))`,
            resolve(root, 'runs.db'),
            input.inspectionScope.checks[0].checks.sourceReview.refs[1],
            runId,
          ],
          { encoding: 'utf8' },
        ),
      )
      await writeFile(receipt, '{"tampered":true}')
      calls = [
        {
          name: 'interaction_verify',
          args: {
            checkRef: original.checkRef,
            purpose: 'verify-effect',
            requirementId: original.requirements[0].requirementId,
          },
        },
      ]
    } else if (mode === 'recovery-budget' && turn >= 1 && turn <= 3) {
      const original = input.inspectionScope.checkInteractions[0]
      calls = [
        {
          name: 'interaction_verify',
          args:
            turn === 1
              ? { checkRef: original.checkRef, purpose: 'collect-interaction', selector: 'body' }
              : {
                  checkRef: original.checkRef,
                  purpose: 'verify-effect',
                  requirementId:
                    turn === 2 ? 'requirement:foreign' : original.requirements[0].requirementId,
                },
        },
      ]
    } else if (mode === 'replaced-result' && turn === 1) {
      await new Promise((r) => setTimeout(r, 450))
      calls = [{ name: 'page_inspect', args: { selector: '[role=region]', offset: 0 } }]
    } else if (mode === 'replaced-result' && turn === 2) {
      const original = input.inspectionScope.checkInteractions[0]
      const actual = input.latestToolResults.tools.find((t: any) => t.tool === 'page_inspect')
        .elements[0]
      calls = [
        {
          name: 'interaction_verify',
          args: {
            checkRef: original.checkRef,
            purpose: 'verify-effect',
            requirementId: original.requirements[0].requirementId,
            selector: actual.selector,
          },
        },
      ]
    } else if (mode === 'other-action' && turn === 1) {
      calls = [click(local[1])]
    } else if (mode === 'other-action' && turn === 2) {
      const original = input.inspectionScope.checkInteractions[0]
      calls = [
        {
          name: 'interaction_verify',
          args: {
            checkRef: original.checkRef,
            purpose: 'verify-effect',
            requirementId: original.requirements[0].requirementId,
          },
        },
      ]
    } else if (mode === 'unrelated-program' && turn === 1) {
      controlCSS = input.latestToolResults.tools.find((t: any) => t.tool === 'element_details')
        .results[0].selector
      calls = [{ name: 'page_inspect', args: { selector: 'p', offset: 0 } }]
    } else if (mode === 'unrelated-program' && turn === 2) {
      stableCSS = input.latestToolResults.tools
        .find((t: any) => t.tool === 'page_inspect')
        .elements.find((e: any) => e.text === 'Unrelated stable text').selector
      calls = [
        {
          name: 'investigation_run',
          args: {
            version: 1,
            phenomenon: 'Public observations only',
            basis: 'Unrelated text is not an effect specification',
            targets: [
              { name: 'control', selector: controlCSS },
              { name: 'stable', selector: stableCSS, binding: 'post-action' },
            ],
            steps: [
              { op: 'act', type: 'click', target: 'control' },
              { op: 'bind_results' },
              { op: 'measure', name: 'after' },
            ],
            assertions: [
              {
                left: { sample: 'after', target: 'stable', metric: 'text' },
                operator: 'eq',
                right: { value: 'Unrelated stable text' },
                expectation: 'Only records unrelated stable content',
              },
            ],
          },
        },
      ]
    } else if (mode === 'repeat' && turn === 1) calls = [click(local[0])]
    else if (mode === 'native' && turn === 1) {
      const c = local.find((c: any) => c.description.startsWith('select'))
      calls = [{ name: 'page_act', args: { type: 'fill', ref: c.ref, value: 'b' } }]
    } else if (mode === 'more-than-three' && turn >= 1 && turn <= 3)
      calls = [click(local[turn - 1])]
    else if (
      nav &&
      !['explicit-unfinished', 'missing-operation', 'positive-probe', 'late-source'].includes(mode)
    )
      calls = [
        {
          name: 'exploration_update',
          args: {
            state: 'one in-scope link',
            unexploredBranches: [],
            selectItems: [{ itemId: nav.itemId, basis: 'observed same-origin link' }],
          },
        },
        click(nav),
      ]
    else
      calls = [
        {
          name: 'run_finish',
          args: {
            reason: [
              'workbench-partial',
              'explicit-unfinished',
              'unsupported-goal',
              'late-source',
              'missing-operation',
              'positive-probe',
              'unrelated-program',
              'cancel',
              'execution-fault',
              'recovery-budget',
              'replaced-result',
              'other-action',
              'changed-evidence',
            ].includes(mode)
              ? 'unverified-scope'
              : 'scope-covered',
          },
        },
      ]
    turn++
    const chunk = {
      id: 'local-' + turn,
      object: 'chat.completion.chunk',
      created: 1,
      model: body.model,
    }
    res
      .writeHead(200, { 'content-type': 'text/event-stream' })
      .end(
        `data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: calls.map((c, i) => ({ index: i, id: 'call-' + turn + '-' + i, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0 } })}\n\ndata: [DONE]\n\n`,
      )
  } catch (error) {
    res.writeHead(500).end(String(error))
  }
})
const endpoint = await listen(model),
  portServer = createServer(),
  base = await listen(portServer)
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
    ...(process.env.R0_PERSISTENCE_TRACE_DIR
      ? ['--import', resolve('scripts/validation/support/persistence-trace-hook.mjs')]
      : []),
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
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  },
)
child.stdout!.on('data', (b) => logs.push(String(b)))
child.stderr!.on('data', (b) => logs.push(String(b)))
const cases = [
  'workbench',
  'workbench-partial',
  'workbench-defect',
  'neutral-change',
  'neutral-no-change',
  'explicit-pass',
  'explicit-fail',
  'explicit-unfinished',
  'numeric-pass',
  'numeric-fail',
  'unsupported-goal',
  'late-source',
  'missing-operation',
  'positive-probe',
  'unrelated-program',
  'repeat',
  'native',
  'advanced',
  'more-than-three',
  'post-denied',
  'cancel',
  'execution-fault',
  'intercepted',
  'recovery-budget',
  'replaced-result',
  'other-action',
  'incidental-clock',
  'changed-evidence',
]
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
  for (mode of cases) {
    if (only && mode !== only) continue
    turn = 0
    cancelRequested = false
    controlCSS = ''
    stableCSS = ''
    console.log(JSON.stringify({ starting: mode }))
    const goal =
      mode === 'workbench-partial'
        ? 'Make every mobile layout accessible.'
        : mode === 'workbench-defect'
          ? 'Synchronously after clicking "Reveal", show text "Ready".'
          : ['recovery-budget', 'changed-evidence', 'replaced-result', 'other-action'].includes(
                mode,
              )
            ? 'After clicking "Reveal", show text "Never".'
            : mode === 'unrelated-program'
              ? 'After clicking "Reveal", show text "Never".'
              : mode.startsWith('explicit')
                ? `${mode === 'explicit-unfinished' ? '' : 'Synchronously '}after clicking "Reveal", show text "Ready".`
                : mode === 'unsupported-goal'
                  ? 'Make every mobile layout accessible.'
                  : undefined
    const requiredChecks =
      mode === 'advanced'
        ? [
            {
              id: 'reveal-result',
              description: 'Caller public result',
              selector: '#control',
              action: 'click',
              verify: {
                selector: 'section[role="region"]',
                condition: 'text-equals',
                expected: 'Ready',
                basis: 'Independent caller specification',
              },
            },
          ]
        : undefined
    let uiBrowser: any,
      uiPage: any,
      uiRequests: any[] = [],
      uiErrors: string[] = []
    let created: any
    if (mode.startsWith('workbench')) {
      const { chromium } = await import('playwright')
      uiBrowser = await chromium.launch({ headless: true })
      uiPage = await uiBrowser.newPage({ viewport: { width: 1280, height: 900 } })
      uiPage.on('pageerror', (e: any) => uiErrors.push(String(e)))
      uiPage.on('request', (r: any) => {
        if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/runs')
          uiRequests.push(r.postDataJSON())
      })
      await uiPage.goto(base)
      await uiPage
        .getByRole('radio', { name: '网址 UI 检查（匿名、有界，不需要业务适配器）', exact: true })
        .check()
      await uiPage.getByRole('textbox', { name: '网址', exact: true }).fill(origin + '/')
      await uiPage.getByRole('textbox', { name: /^检查目标/ }).fill(goal ?? '')
      await uiPage.screenshot({ path: resolve(root, mode + '-before.png'), fullPage: true })
      const response = uiPage.waitForResponse(
        (r: any) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/runs',
      )
      await uiPage.getByRole('button', { name: '开始检查', exact: true }).click()
      created = await (await response).json()
    } else
      created = await fetch(base + '/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'ui-scan',
          entryUrl: origin + '/',
          ...(goal ? { goal } : {}),
          ...(requiredChecks ? { requiredChecks } : {}),
        }),
      }).then((r) => r.json())
    if (!created.runId) throw Error(JSON.stringify(created))
    runId = created.runId
    let report: any
    for (let i = 0; i < 550; i++) {
      if (mode === 'cancel' && !cancelRequested) {
        const events: any[] = await fetch(base + '/api/runs/' + runId + '/events').then((r) =>
          r.json(),
        )
        if (events.some((e) => e.type === 'action:completed')) {
          cancelRequested = true
          await save(
            'cancel-receipt.json',
            await fetch(base + '/api/runs/' + runId + '/cancel', { method: 'POST' }).then((r) =>
              r.json(),
            ),
          )
        }
      }
      const r: any = await fetch(base + '/api/runs/' + runId).then((r) => r.json())
      if (!['queued', 'running'].includes(r.status) && !r.active) {
        report = await fetch(base + '/api/runs/' + runId + '/report').then((r) => r.json())
        break
      }
      await new Promise((r) => setTimeout(r, 100))
    }
    await save(mode + '-report.json', report ?? { error: 'did not terminate' })
    if (!report?.uiScan) throw Error('missing report ' + mode)
    if (uiPage) {
      await uiPage.waitForFunction(
        (status: string) =>
          document.body.innerText.includes('执行：' + status) ||
          document.body.innerText.includes('执行： ' + status),
        report.status,
        { timeout: 15000 },
      )
      await uiPage.getByText('功能要求：', { exact: false }).waitFor({ timeout: 10000 })
      await uiPage.screenshot({ path: resolve(root, mode + '-report.png'), fullPage: true })
      await uiPage.locator('.ui-scan').screenshot({ path: resolve(root, mode + '-summary.png') })
      await uiPage.reload()
      await uiPage.getByRole('textbox', { name: '恢复历史运行', exact: true }).fill(runId)
      await uiPage.getByRole('button', { name: '打开运行', exact: true }).click()
      await uiPage.waitForFunction(
        (status: string) =>
          document.body.innerText.includes('执行：' + status) ||
          document.body.innerText.includes('执行： ' + status),
        report.status,
        { timeout: 15000 },
      )
      await uiPage.getByText('功能要求：', { exact: false }).waitFor({ timeout: 10000 })
      await uiPage.screenshot({ path: resolve(root, mode + '-restored.png'), fullPage: true })
      const text = await uiPage.locator('body').innerText()
      await save(mode + '-ui.json', {
        runId,
        requests: uiRequests,
        errors: uiErrors,
        historyRestored: true,
        text,
      })
      if (
        uiErrors.length ||
        uiRequests.length !== 1 ||
        uiRequests[0].requiredChecks !== undefined ||
        (mode === 'workbench' && uiRequests[0].goal !== undefined)
      )
        throw Error('ordinary form contract mismatch')
      if (!text.includes('功能语义未验证')) throw Error('UI hid functional unknown')
      await uiBrowser.close()
    }
    const download = await downloadRunEvidence(base, report, resolve(root, mode, 'artifacts'))
    await save(mode + '-artifacts.json', download.index)
    const partial = [
      'workbench-partial',
      'explicit-unfinished',
      'unsupported-goal',
      'late-source',
      'missing-operation',
      'positive-probe',
      'unrelated-program',
      'cancel',
      'execution-fault',
      'recovery-budget',
      'replaced-result',
      'other-action',
      'changed-evidence',
    ].includes(mode)
    const row = {
      mode,
      runId,
      status: report.status,
      coverage: report.uiScan.inspection.coverage,
      proof: report.uiScan.proof?.version,
      proofVerified: report.uiScan.proofVerified,
      counts: report.uiScan.checkCounts,
      actions: report.usage.actions,
      findings: report.findings.filter((f: any) => f.validationStatus === 'supported').length,
      items: report.uiScan.inspection.items.filter((i: any) => i.selected && i.checks),
    }
    results.push(row)
    console.log(
      JSON.stringify({
        mode,
        runId,
        status: row.status,
        coverage: row.coverage,
        proofVerified: row.proofVerified,
        counts: row.counts,
        actions: row.actions,
        findings: row.findings,
      }),
    )
    if (
      !['post-denied', 'cancel', 'execution-fault', 'changed-evidence'].includes(mode) &&
      (partial ? row.coverage === 'covered' : row.coverage !== 'covered' || !row.proofVerified)
    )
      throw Error('unexpected coverage ' + mode)
    if (['workbench-defect', 'explicit-fail', 'numeric-fail'].includes(mode) && row.findings < 1)
      throw Error('missing valid public-effect finding')
    if (mode === 'cancel' && row.status !== 'cancelled') throw Error('cancel lost')
    if (mode === 'execution-fault' && row.status !== 'execution-error') throw Error('fault masked')
    if (
      !['workbench-defect', 'explicit-fail', 'numeric-fail', 'post-denied', 'intercepted'].includes(
        mode,
      ) &&
      row.findings !== 0
    )
      throw Error('false positive')
  }
} finally {
  child.kill('SIGTERM')
  await new Promise<void>((r) => child.once('exit', () => r()))
  await new Promise<void>((r) => model.close(() => r()))
  await new Promise<void>((r) => fixture.close(() => r()))
  await save('results.json', results)
  await save('packets.json', packets)
  await save('fixture-requests.json', requests)
  await writeFile(resolve(root, 'server.log'), logs.join(''))
  await save('manifest.json', {
    phase,
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    cases,
    only: only ?? null,
    newRealModelCalls: 0,
    newPaidCostUsd: 0,
    directFixtureClicks: 0,
  })
  console.log(JSON.stringify({ evidenceRoot: root, paidCostUsd: 0 }))
}
