import { Stagehand } from '@browserbasehq/stagehand'
import { readFile, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { nativeFinalSchema } from './native-inspection.ts'

const catalog = JSON.parse(await readFile(process.env.NATIVE_CATALOG!, 'utf8'))
async function rpc(path: string, data: unknown) {
  const response = await fetch(process.env.NATIVE_RPC! + path, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.NATIVE_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(17000),
  })
  const result: any = await response.json()
  if (!response.ok) throw Error(result.error ?? `RPC ${response.status}`)
  return result
}
const model = {
  modelName: 'openai/deepseek/deepseek-v4.1-flash',
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: process.env.OPENAI_BASE_URL!,
  openaiEndpointFormat: 'chat' as const,
}
const stagehand = new Stagehand({
  env: 'LOCAL',
  model,
  disableAPI: true,
  disablePino: true,
  serverCache: false,
  experimental: true,
  verbose: 0,
  logger: () => {},
  actTimeoutMs: 15000,
  localBrowserLaunchOptions: { cdpUrl: process.env.NATIVE_CDP! },
})
const record: any = { completed: false, steps: 0 }
try {
  await stagehand.init()
  const tools = Object.fromEntries(
    catalog.tools.map((tool: any) => [
      tool.name,
      {
        description: tool.description,
        inputSchema: z.fromJSONSchema(tool.schema),
        execute: (args: unknown) => rpc('/tool', { name: tool.name, args }),
      },
    ]),
  )
  record.result = await stagehand
    .agent({ mode: 'dom', model, executionModel: model, tools, systemPrompt: catalog.instructions })
    .execute({
      instruction: catalog.goal,
      maxSteps: 40,
      signal: AbortSignal.timeout(300000),
      excludeTools: ['screenshot'],
      output: nativeFinalSchema,
      callbacks: {
        onStepFinish: async () => {
          record.steps++
          await rpc('/step', {})
        },
      },
    })
  record.completed = record.result.completed === true
  record.output = record.result.output
  if (record.completed) record.acceptedFinish = await rpc('/finish', record.output)
} catch (error) {
  record.error = String(error)
} finally {
  await writeFile(process.env.NATIVE_DRIVER_OUTPUT!, JSON.stringify(record, null, 2) + '\n')
  await stagehand.close().catch(() => {})
}
