import 'dotenv/config'
import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { config, checkModelConfig } from '../../src/shared/config.ts'
import { agentModel } from '../../src/shared/model.ts'
import { launchBrowser } from '../../src/execution/browser.ts'
import { createVisionLocator } from '../../src/execution/vision.ts'
import { mkdir, writeFile } from 'node:fs/promises'
async function main() {
  const ready = checkModelConfig()
  if (!ready.ready) throw new Error('configuration-missing: ' + ready.missing.join(', '))
  const signal = AbortSignal.timeout(60000)
  let toolCalls = 0,
    visionRequests = 0
  const agent = new Agent({
    id: 'smoke-model',
    name: 'Model tool smoke',
    model: agentModel,
    maxRetries: 0,
    instructions: 'Call echo_check once with value smoke-ok.',
    tools: {
      echo_check: createTool({
        id: 'echo_check',
        description: 'Confirm schema tool invocation',
        inputSchema: z.object({ value: z.literal('smoke-ok') }),
        execute: async () => {
          toolCalls++
          return { ok: true }
        },
      }),
    },
  })
  const result = await agent.generate('Run the echo_check tool.', {
    maxSteps: 1,
    toolChoice: 'required',
    abortSignal: signal,
  })
  if (toolCalls !== 1) throw new Error('Model failed real schema-tool invocation')
  const worker = await launchBrowser()
  try {
    await worker.page.setContent(
      '<html><body><h1>Visual smoke</h1><button style="margin:70px;padding:25px;background:#164ed6;color:white">Confirm purchase</button></body></html>',
    )
    const vision = createVisionLocator(worker.page, {
      signal,
      beforeModelCall: () => {
        if (++visionRequests > 3) throw new Error('smoke vision request budget exhausted')
      },
    })
    const located = await vision.aiLocate('the blue Confirm purchase button')
    const hit = await worker.page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.textContent,
      { x: located.center[0], y: located.center[1] },
    )
    if (hit !== 'Confirm purchase')
      throw new Error('Vision coordinate did not hit the requested control')
    await mkdir('data/smoke', { recursive: true })
    await worker.page.screenshot({ path: 'data/smoke/model.png' })
    await writeFile(
      'data/smoke/model.json',
      JSON.stringify(
        {
          realModel: true,
          agentModel: config.agentModel,
          visionModel: config.visionModel,
          toolCalls,
          visionRequests,
          usage: result.usage ?? 'unavailable',
          hit,
          at: new Date().toISOString(),
        },
        null,
        2,
      ),
    )
    console.log('Real tool calling and visual localization passed; data/smoke/model.json')
  } finally {
    await worker.close()
  }
}
main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
