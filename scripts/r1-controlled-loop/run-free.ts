/** Local API + original executor + actual Chromium. Models are explicit fixed substitutes. */
import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { build } from 'esbuild'
import { createControlledHost } from '../../src/agent/exploration/integration/host.ts'
import { cases, html } from './fixtures.ts'
const output = resolve(process.argv[2] ?? 'artifacts/r1-controlled-loop-v1/free')
await mkdir(output, { recursive: false })
const save = (path: string, value: unknown) =>
  writeFile(join(output, path), JSON.stringify(value, null, 2) + '\n')
const listen = async (s: ReturnType<typeof createServer>) => {
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  return 'http://127.0.0.1:' + (s.address() as any).port
}
let scenario = 'healthy',
  arm = '',
  runId = '',
  turn = 0
let agentHost = createControlledHost()
const packets: any[] = [],
  rows: any[] = [],
  fixtureRequests: any[] = []
const fixture = createServer((req, res) => {
  fixtureRequests.push({ arm, scenario, url: req.url, method: req.method })
  res.writeHead(200, { 'content-type': 'text/html' }).end(html(scenario))
})
const origin = await listen(fixture)
const model = createServer(async (req, res) => {
  try {
    let raw = ''
    for await (const b of req) raw += b
    const body = JSON.parse(raw),
      input = JSON.parse(body.messages.filter((m: any) => m.role === 'user').at(-1).content)
    packets.push({ arm, scenario, runId, turn, input })
    let call: any
    if (input.explorationHandoff)
      call = { name: 'run_finish', args: { reason: 'unverified-scope' } }
    else {
      // The full Agent transport path has a fixed decision substitute; no real intelligence claim.
      const d = await agentHost.decide(input, {
        signal: new AbortController().signal,
        version: { key: 'fixed-agent-' + turn, reusable: true, reason: 'stub' },
      })
      call =
        d.kind === 'tool'
          ? { name: d.tool, args: d.args }
          : { name: 'run_finish', args: { reason: 'unverified-scope' } }
    }
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
        `data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call-' + turn, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } }] }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0 } })}\n\ndata: [DONE]\n\n`,
      )
  } catch (e) {
    res.writeHead(500).end(String(e))
  }
})
const endpoint = await listen(model)
let child: ReturnType<typeof spawn> | undefined
try {
  for (arm of process.argv[3] ? [process.argv[3]] : ['agent-fixed', 'program', 'jev-fixed']) {
    const dir = join(output, arm)
    await mkdir(dir)
    const portServer = createServer(),
      base = await listen(portServer)
    await new Promise<void>((r) => portServer.close(() => r()))
    const entry = join(dir, 'server.mjs')
    await build({
      entryPoints: ['scripts/r1-controlled-loop/server-entry.ts'],
      outfile: entry,
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      sourcemap: true,
    })
    // Separate cwd isolates data/artifacts; repository packages remain resolvable from bundle path.
    const logs: string[] = []
    child = spawn(process.execPath, [entry], {
      cwd: dir,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        PORT: new URL(base).port,
        DATABASE_URL: 'file:' + join(dir, 'runs.db'),
        R1_LOOP_MODE: arm,
        R1_LOOP_OUTPUT: dir,
        AGENT_MODEL: 'openai/local-fixed',
        OPENAI_BASE_URL: endpoint + '/v1',
        OPENAI_API_KEY: 'local-only',
        VISION_MODEL: 'qwen/local-fixed',
        VISION_MODEL_FAMILY: 'qwen3',
        VISION_BASE_URL: endpoint + '/v1',
        VISION_API_KEY: 'local-only',
        EXECUTION_URL_SCAN: '1',
        URL_SCAN_TRUSTED_ORIGINS: origin,
        EXECUTION_MODEL_STREAMING: '1',
        EXECUTION_SHORT_FINISH: '1',
        EXECUTION_BLOCKER_REVIEW: '0',
        EXECUTION_VISUAL_DISCOVERY: '0',
        RUN_TOTAL_TIMEOUT_MS: '60000',
        RUN_MAX_MODEL_CALLS: '12',
        RUN_MAX_ACTIONS: '6',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout!.on('data', (b) => logs.push(String(b)))
    child.stderr!.on('data', (b) => logs.push(String(b)))
    try {
      for (let n = 0; n < 100; n++) {
        if (
          await fetch(base + '/api/health')
            .then((r) => r.ok)
            .catch(() => false)
        )
          break
        if (n === 99) throw Error('service-start')
        await new Promise((r) => setTimeout(r, 100))
      }
      for (const c of cases) {
        if (process.argv[4] && c.id !== process.argv[4]) continue
        scenario = c.id
        turn = 0
        agentHost = createControlledHost()
        console.log(JSON.stringify({ arm, scenario, stage: 'start' }))
        const start = Date.now()
        const created: any = await fetch(base + '/api/runs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: 'ui-scan',
            entryUrl: origin + '/',
            goal: c.goal,
            budget: { maxActions: c.actions, maxModelCalls: 12, totalTimeoutMs: 60000 },
          }),
        }).then((r) => r.json())
        if (!created.runId) throw Error(JSON.stringify(created))
        runId = created.runId
        let report: any
        for (let n = 0; n < 650; n++) {
          const status: any = await fetch(base + '/api/runs/' + runId).then((r) => r.json())
          if (!['queued', 'running'].includes(status.status) && !status.active) {
            report = await fetch(base + '/api/runs/' + runId + '/report').then((r) => r.json())
            break
          }
          await new Promise((r) => setTimeout(r, 100))
        }
        if (!report?.uiScan) throw Error('missing-report:' + runId)
        await writeFile(join(dir, c.id + '-report.json'), JSON.stringify(report, null, 2) + '\n')
        // Retain only artifacts referenced in report; never assume developer-local absolute paths suffice.
        const evidence = join(dir, c.id + '-evidence')
        await mkdir(evidence)
        const index: any[] = []
        for (const a of report.artifacts ?? []) {
          const response = await fetch(
            base + `/api/runs/${runId}/artifacts/${encodeURIComponent(a.id)}`,
          )
          if (response.ok) {
            const bytes = Buffer.from(await response.arrayBuffer())
            await writeFile(join(evidence, encodeURIComponent(a.id)), bytes)
            index.push({
              id: a.id,
              path: `${arm}/${c.id}-evidence/${encodeURIComponent(a.id)}`,
              bytes: bytes.length,
            })
          }
        }
        await writeFile(join(evidence, 'index.json'), JSON.stringify(index, null, 2) + '\n')
        rows.push({
          arm,
          scenario,
          runId,
          status: report.status,
          stopReason: report.stopReason,
          elapsedMs: Date.now() - start,
          usage: report.usage,
          uiScan: report.uiScan,
          artifacts: index.length,
        })
        console.log(JSON.stringify(rows.at(-1)))
        if (['interrupted', 'execution-error'].includes(report.status))
          throw Error('affected-run-stopped:' + report.status)
      }
    } finally {
      child.kill('SIGTERM')
      await new Promise((r) => child!.once('exit', r))
      await writeFile(join(dir, 'server.log'), logs.join(''))
      child = undefined
    }
  }
} finally {
  child?.kill('SIGTERM')
  fixture.close()
  model.close()
  await save('packets.json', packets)
  await save('results.json', rows)
  await save('fixture-requests.json', fixtureRequests)
  await save('identity.json', {
    sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    node: process.version,
    fixtureOrigin: origin,
    realModelCalls: 0,
    mode: 'fixed-substitutes-only',
    scenarioCount: cases.length,
    arms: ['agent-fixed', 'program', 'jev-fixed'],
  })
}
