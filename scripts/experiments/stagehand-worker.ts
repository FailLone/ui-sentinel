import { Stagehand } from '@browserbasehq/stagehand'
import { chromium } from 'playwright'
import { z } from 'zod'
import { createServer } from 'node:net'
import { mkdtemp, rm, writeFile, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createVisionLocator } from '../../src/execution/vision.ts'
import { isAllowedPageUrl, isAllowedNavigationUrl } from '../../src/execution/browser.ts'

const output = process.env.EXPERIMENT_OUTPUT!,
  dir = process.env.EXPERIMENT_DIR!,
  id = process.env.EXPERIMENT_ID!
const arena = process.env.ARENA_URL!,
  goal = process.env.EXPERIMENT_GOAL!
const server = createServer()
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
const port = (server.address() as any).port
await new Promise<void>((r) => server.close(() => r()))
const profile = await mkdtemp(join(tmpdir(), 'sentinel-stagehand-'))
const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  viewport: { width: 1280, height: 720 },
  serviceWorkers: 'block',
  args: [`--remote-debugging-port=${port}`],
})
const page = context.pages()[0] ?? (await context.newPage())
const abort = new AbortController()
const timer = setTimeout(() => {
  abort.abort()
  void context.close()
}, 300000)
const record: any = { completed: false, steps: [], interactions: [], denied: [], visionCalls: 0 }
let stagehand: Stagehand | undefined
try {
  await context.addInitScript(
    'if(typeof __name==="undefined")window.__name=function(fn){return fn}',
  )
  await context.route('**/*', async (route) => {
    const request = route.request()
    if (
      isAllowedPageUrl(request.url(), arena) &&
      (!request.isNavigationRequest() || isAllowedNavigationUrl(request.url(), arena))
    )
      await route.continue()
    else {
      record.denied.push(request.url())
      await route.abort()
    }
  })
  context.on('page', (p) => {
    if (p !== page) void p.close()
  })
  await context.exposeBinding('__recordExperimentInput', (_, data) => {
    record.interactions.push(data)
    if (record.interactions.length > 40) {
      abort.abort()
      void context.close()
    }
  })
  await context.addInitScript(
    `document.addEventListener('pointerdown',function(e){window.__recordExperimentInput({type:'pointerdown',x:e.clientX,y:e.clientY,at:Date.now()})},true)`,
  )
  await page.goto(arena, { waitUntil: 'domcontentloaded' })
  const model = {
    openaiEndpointFormat: 'chat' as const,
    modelName: process.env.AGENT_MODEL!,
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: process.env.OPENAI_BASE_URL!,
  }
  const cdp = (await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json())) as {
    webSocketDebuggerUrl: string
  }
  stagehand = new Stagehand({
    env: 'LOCAL',
    model,
    localBrowserLaunchOptions: { cdpUrl: cdp.webSocketDebuggerUrl },
    disableAPI: true,
    disablePino: true,
    serverCache: false,
    experimental: true,
    verbose: 0,
    logger: () => {},
    actTimeoutMs: 15000,
  })
  await stagehand.init()
  const vision = createVisionLocator(page, {
    signal: abort.signal,
    beforeModelCall: () => {
      record.visionCalls++
    },
  })
  const agent = stagehand.agent({
    mode: 'dom',
    model,
    executionModel: model,
    tools: {
      vision_click: {
        description:
          'Use Qwen visual localization to click one described visible control only if DOM-based targeting is inadequate. Do not force or remove overlays.',
        inputSchema: z.object({ description: z.string() }),
        execute: async (input: { description: string }) => {
          abort.signal.throwIfAborted()
          const target = await vision.aiLocate(input.description)
          abort.signal.throwIfAborted()
          await page.mouse.click(target.center[0], target.center[1])
          return { clicked: true, point: target.center }
        },
      },
    },
  })
  const result = await agent.execute({
    instruction: goal,
    maxSteps: 40,
    signal: abort.signal,
    excludeTools: ['screenshot'],
    callbacks: {
      onStepFinish: async (step: any) => {
        const compact = {
          text: step.text,
          toolCalls: step.toolCalls,
          toolResults: step.toolResults,
          usage: step.usage,
          finishReason: step.finishReason,
        }
        record.steps.push(compact)
        await appendFile(join(dir, `${id}-steps.jsonl`), JSON.stringify(compact) + '\n')
      },
    },
  })
  record.result = result
  record.completed = result.completed === true
} catch (error) {
  record.error = String(error)
  process.exitCode = 1
} finally {
  clearTimeout(timer)
  try {
    record.visibleText = await page.locator('body').innerText({ timeout: 3000 })
    record.url = page.url()
    await page.screenshot({ path: join(dir, `${id}-final.png`) })
    record.a11y = await page.locator('body').ariaSnapshot()
  } catch {
    record.finalObservationUnavailable = true
  }
  await writeFile(output, JSON.stringify(record, null, 2) + '\n')
  await stagehand?.close().catch(() => {})
  await context.close().catch(() => {})
  await rm(profile, { recursive: true, force: true })
}
