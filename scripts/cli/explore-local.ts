/** Operator entry point for isolated local HTML; ordinary URL scans remain a separate mode. */
import 'dotenv/config'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'
import { launchBrowser } from '../../src/execution/browser.ts'
import { explore } from '../../src/execution/exploration/run.ts'
import { createExplorationDecider, recognitionPrompt } from '../../src/agent/exploration.ts'
import { config } from '../../src/shared/config.ts'
import { agentModel } from '../../src/shared/model.ts'

const [htmlPath, contractPath, flag] = process.argv.slice(2)
if (!htmlPath || !contractPath || flag !== '--real' || process.argv.length !== 5)
  throw Error('Usage: pnpm explore:local <page.html> <scope.json> --real')
if (!config.agentModel)
  throw Error('AGENT_MODEL is required; use the normal project model configuration')
const scope = z
  .object({
    version: z.literal(1),
    /** An explicit operator assertion, not something inferred from a screenshot. */
    stateContract: z.enum(['dom-complete-resettable', 'unknown']),
    inputValues: z.record(z.string(), z.array(z.string()).min(1).max(20)).default({}),
    excludedControls: z
      .array(z.object({ name: z.string().min(1), reason: z.string().min(1) }).strict())
      .default([]),
    maxDecisions: z.number().int().min(1).max(200).default(80),
    maxModelCalls: z.number().int().min(1).max(300).default(100),
    maxClicks: z.number().int().min(1).max(1000).default(400),
  })
  .strict()
  .parse(JSON.parse(await readFile(resolve(contractPath), 'utf8')))
const html = await readFile(resolve(htmlPath), 'utf8')
const directory = resolve('data/exploration', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(directory, { recursive: true })
const save = (name: string, value: unknown) =>
  writeFile(resolve(directory, name), JSON.stringify(value, null, 2) + '\n')
const htmlHash = createHash('sha256').update(html).digest('hex')
await save('manifest.json', {
  scope,
  htmlPath: resolve(htmlPath),
  htmlHash,
  model: config.agentModel,
  prompt: recognitionPrompt,
  network: 'all-browser-requests-denied',
  purpose: 'bounded local HTML exploration; no visual or arbitrary URL coverage',
})
const worker = await launchBrowser()
try {
  await worker.context.route('**/*', (route) => route.abort())
  await worker.context.routeWebSocket('**/*', (socket) => socket.close())
  worker.context.on('page', (page) => {
    if (page !== worker.page) void page.close()
  })
  let modelCalls = 0
  const decide = createExplorationDecider({
    model: agentModel,
    mode: 'recognition',
    onCall: async (input) => {
      if (++modelCalls > scope.maxModelCalls) throw Error('model-call-budget')
      await save(`model-${modelCalls}-input.json`, input)
    },
    onResult: (result) => save(`model-${modelCalls}-result.json`, result),
  })
  const report = await explore({
    page: worker.page,
    mode: 'recognition',
    reset: () => worker.page.setContent(html),
    decide,
    replaySafe: scope.stateContract === 'dom-complete-resettable',
    context: async () => (scope.stateContract === 'dom-complete-resettable' ? htmlHash : null),
    observation: { inputValues: scope.inputValues },
    exclude: (control) =>
      scope.excludedControls.find((entry) => entry.name === control.name)?.reason,
    maxDecisions: scope.maxDecisions,
    maxClicks: scope.maxClicks,
    evidence: async (index, before, decision, after) => {
      await worker.page.screenshot({ path: resolve(directory, `step-${index}.png`) })
      await save(`step-${index}.json`, { before, decision, after, screenshot: `step-${index}.png` })
      return `step-${index}.json`
    },
  })
  await save('report.json', { ...report, modelCalls })
  console.log(
    JSON.stringify({
      directory,
      status: report.status,
      edges: report.checkedEdges,
      failures: report.failedEdges,
      remaining: report.remaining,
      error: report.error,
    }),
  )
  if (report.status !== 'bounded-scope-exhausted' || report.failedEdges) process.exitCode = 1
} finally {
  await worker.close()
}
