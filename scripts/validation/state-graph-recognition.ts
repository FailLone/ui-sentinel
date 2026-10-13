/** Independent complex diagnostic using the reusable runtime and a real Mastra Agent. */
import 'dotenv/config'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createOpenAI } from '@ai-sdk/openai'
import type { MastraModelConfig } from '@mastra/core/llm'
import { launchBrowser } from '../../src/execution/browser.ts'
import { explore, type Decide } from '../../src/execution/exploration/run.ts'
import { createExplorationDecider, recognitionPrompt } from '../../src/agent/exploration.ts'
import { historyFixtureHtml } from '../../evaluation/state-graph/complex-fixture.ts'
import { recognitionFixtureHtml } from '../../evaluation/state-graph/recognition-fixture.ts'
import { recognitionScore } from '../../evaluation/state-graph/recognition-score.ts'
import { recognitionProbes } from '../../evaluation/state-graph/recognition-probes.ts'

import { startGateway, AGENT_MODEL } from '../../evaluation/support/model-gateway.ts'
import { selectEndpoint, type Endpoint } from '../../evaluation/state-graph/provider.ts'

const args = process.argv.slice(2)
if (args.length !== 1 || !['--preflight', '--real'].includes(args[0]!))
  throw Error('Use --preflight or --real (maximum $1, 120 calls, pinned provider, no fallback)')
const real = args[0] === '--real'
const providerTag = process.env.STATE_GRAPH_AGENT_PROVIDER ?? 'wafer'
const directory = resolve(
  'data/state-graph-recognition',
  new Date().toISOString().replace(/[:.]/g, '-'),
)
await mkdir(directory, { recursive: true })
const save = (name: string, value: unknown) =>
  writeFile(resolve(directory, name), JSON.stringify(value, null, 2) + '\n')
async function identity() {
  const names = [
    ...(await readdir('evaluation/state-graph')).map((name) => 'evaluation/state-graph/' + name),
    ...(await readdir('src/execution/exploration')).map(
      (name) => 'src/execution/exploration/' + name,
    ),
    'src/inspection/exploration-graph.ts',
    'src/agent/exploration.ts',
    'src/execution/browser.ts',
    'scripts/cli/explore-local.ts',
    'scripts/validation/state-graph-recognition.ts',
    'evaluation/support/model-gateway.ts',
    'package.json',
    'pnpm-lock.yaml',
  ].sort()
  const files: Record<string, string> = {}
  for (const name of names)
    files[name] = createHash('sha256')
      .update(await readFile(name))
      .digest('hex')
  return { files, hash: createHash('sha256').update(JSON.stringify(files)).digest('hex') }
}
const frozen = await identity()
await save('manifest.json', {
  mode: real ? 'real-model' : 'scripted-browser',
  identity: frozen,
  model: real ? AGENT_MODEL : null,
  provider: real ? providerTag : null,
  prompt: recognitionPrompt,
  budget: { usd: real ? 1 : 0, modelCalls: 120, decisionsPerCase: 80, clicksPerCase: 400 },
  cases: ['recognition', 'history'],
  limitations: [
    'local resettable HTML, browser network denied',
    'explicit finite Query input classes',
    'caller-supplied history state adapter',
    'recognition only: actual outcomes, no defect verdicts; six separate comprehension probes',
    '190-control full traversal is a free mechanism test; real full traversal uses 28 shelves',
    'not default URL-scan acceptance or visual assessment',
  ],
})
console.log('Artifacts: ' + directory)
let gateway: Awaited<ReturnType<typeof startGateway>> | undefined
let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined
let failure: string | null = null
let calls = 0
let probes: Awaited<ReturnType<typeof recognitionProbes>> = []
const results: {
  label: string
  report: Awaited<ReturnType<typeof explore>>
  score: unknown
  passed: boolean
}[] = []
try {
  let decide: Decide = async (input) => {
    const c = input.candidates[0]!
    return { ref: c.ref, understanding: { purpose: `Explore ${c.name}`, quote: c.name } }
  }
  if (real) {
    if (!process.env.OPENROUTER_API_KEY) throw Error('OPENROUTER_API_KEY missing')
    const response = await fetch(`https://openrouter.ai/api/v1/models/${AGENT_MODEL}/endpoints`, {
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw Error('model-pricing-unavailable')
    const list = (await response.json()) as { data: { endpoints: Endpoint[] } }
    const selected = selectEndpoint(list.data.endpoints, providerTag)
    await save('pricing.json', {
      fetchedAt: new Date().toISOString(),
      selected,
      catalog: list.data,
    })
    gateway = await startGateway(process.env.OPENROUTER_API_KEY, directory, fetch, {
      limitUsd: 1,
      providers: { agent: providerTag, vision: providerTag },
      estimateCost: (body) =>
        Buffer.byteLength(JSON.stringify(body)) * selected.prompt + 4096 * selected.completion,
    })
    gateway.begin('complex-state-graph', 120, 900000)
    decide = createExplorationDecider({
      mode: 'recognition',
      model: createOpenAI({ apiKey: gateway.token, baseURL: gateway.url }).chat(
        AGENT_MODEL,
      ) as unknown as MastraModelConfig,
      onCall: async (input) => {
        if (++calls > 120) throw Error('model-call-budget')
        await save(`model-${calls}-input.json`, input)
      },
      onResult: async (result) => {
        await save(`model-${calls}-result.json`, result)
        console.log(
          `Model ${calls}: ${result.read ? 'read ' + JSON.stringify(result.read) : JSON.stringify(result.action)}`,
        )
      },
    })
    const probe = await decide(
      {
        heading: 'Connection check',
        text: 'A public tool handshake.',
        candidates: [
          {
            ref: 'probe',
            name: 'Confirm',
            description: 'Displays the heading Connected.',
            enabled: true,
          },
        ],
        checkedHere: 0,
        pendingElsewhere: 0,
      },
      () => {
        throw Error('probe-no-more-pages')
      },
    )
    await save('connectivity.json', {
      passed: probe.ref === 'probe' && !!probe.understanding?.quote,
      decision: probe,
    })
    if (probe.ref !== 'probe' || !probe.understanding?.quote) throw Error('connectivity-failed')
  }
  browser = await launchBrowser()
  await browser.context.route('**/*', (route) => route.abort())
  await browser.context.routeWebSocket('**/*', (socket) => socket.close())
  await save('browser.json', { version: browser.browser.version() })
  if (real) {
    probes = await recognitionProbes(browser.page, decide, save)
    console.log(
      JSON.stringify({ comprehension: probes.map((p) => ({ name: p.name, passed: p.passed })) }),
    )
  }
  for (const label of ['recognition', 'history']) {
    const history = label === 'history'
    const started = Date.now()
    const report = await explore({
      page: browser.page,
      mode: 'recognition',
      reset: () =>
        browser!.page.setContent(history ? historyFixtureHtml() : recognitionFixtureHtml()),
      replaySafe: true,
      context: history
        ? () =>
            browser!.page.evaluate(() =>
              (window as unknown as { explorationContext: () => string }).explorationContext(),
            )
        : async () => 'resettable-complex-v1',
      observation: { inputValues: { Query: ['', 'alpha'] } },
      decide,
      exclude: (control) =>
        control.name === 'Delete workspace' ? 'outside-read-only-scope' : undefined,
      maxDecisions: 80,
      maxClicks: 400,
      evidence: async (index, before, decision, after) => {
        const name = `${label}-${index}`
        await browser!.page.screenshot({ path: resolve(directory, name + '.png') })
        await save(name + '.json', { before, decision, after, screenshot: name + '.png' })
        return name + '.json'
      },
    })
    const score = history
      ? {
          states: report.stateCount,
          edges: report.checkedEdges,
          sessionStates: report.states.filter((s) => s.observation.heading === 'Session').length,
          failed: report.failedEdges,
        }
      : recognitionScore(report)
    const passed =
      report.status === 'bounded-scope-exhausted' &&
      (history
        ? report.stateCount === 4 &&
          report.checkedEdges === 6 &&
          report.edges.every((e) => e.verdict === 'observed')
        : recognitionScore(report).passed)
    results.push({ label, report, score, passed })
    await save(label + '-report.json', {
      label,
      durationMs: Date.now() - started,
      report,
      score,
      passed,
    })
    console.log(
      JSON.stringify({
        label,
        passed,
        status: report.status,
        states: report.stateCount,
        edges: report.checkedEdges,
        reads: report.reads,
        error: report.error,
      }),
    )
    if (report.error) failure ??= report.error
    if (gateway?.spending().unknownCosts || calls >= 120) {
      failure ??= gateway?.spending().unknownCosts ? 'cost-unknown' : 'model-call-budget'
      break
    }
    // A local tool/expectation gap does not erase independent cases. Transport failures still stop.
    if (
      report.error &&
      !/^(agent-gap:|invalid-decision|invalid-agent-tool-execution|agent-read-budget|decision-budget|depth-budget|state-budget|time-budget|unexpected-state-change|restore-)/.test(
        report.error,
      )
    )
      break
  }
} catch (error) {
  failure = error instanceof Error ? error.message : 'experiment-error'
} finally {
  if (gateway) await save('model-records.json', await gateway.end())
  const sourceUnchanged = frozen.hash === (await identity()).hash
  const summary = {
    mode: real ? 'real-model' : 'scripted-browser',
    failure,
    sourceUnchanged,
    calls,
    spending: gateway?.spending() ?? { knownCostUsd: 0, unknownCosts: 0 },
    probes,
    results,
  }
  await save('summary.json', summary)
  await browser?.close()
  await gateway?.close()
  console.log(
    JSON.stringify({ directory, failure, sourceUnchanged, calls, spending: summary.spending }),
  )
  if (
    failure ||
    !sourceUnchanged ||
    results.length !== 2 ||
    results.some((result) => !result.passed) ||
    (real && (probes.length !== 6 || probes.some((p) => !p.passed)))
  )
    process.exitCode = 1
}
