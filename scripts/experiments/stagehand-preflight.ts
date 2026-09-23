import { Stagehand } from '@browserbasehq/stagehand'
import { writeFile } from 'node:fs/promises'
import { z } from 'zod'

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
  localBrowserLaunchOptions: { cdpUrl: process.env.EXPERIMENT_CDP! },
})
const record: any = { completed: false, kind: 'native-loop-preflight' }
try {
  await stagehand.init()
  record.result = await stagehand.agent({ mode: 'dom', model, executionModel: model }).execute({
    instruction:
      'Read the heading on the already open page, return it as observed_heading and finish. No navigation or modification is needed.',
    maxSteps: 3,
    signal: AbortSignal.timeout(90000),
    excludeTools: ['screenshot'],
    output: z.object({ observed_heading: z.string() }),
  })
  record.completed = record.result.completed === true
} catch (error) {
  record.error = String(error)
} finally {
  await writeFile(process.env.EXPERIMENT_OUTPUT!, JSON.stringify(record, null, 2) + '\n')
  await stagehand.close().catch(() => {})
}
