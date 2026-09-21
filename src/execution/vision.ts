import { PlaywrightAgent } from '@midscene/web/playwright/agent'
import type { Page } from 'playwright'

/** Only locate; all actions remain under the executor's cancellation/permission boundary. */
export function createVisionLocator(page: Page, hooks: {
  signal: AbortSignal
  beforeModelCall: () => void
  onUsage?: (usage: unknown) => void
}) {
  return new PlaywrightAgent(page, {
    generateReport: false,
    modelConfig: {
      MIDSCENE_MODEL_NAME: process.env.VISION_MODEL ?? '',
      MIDSCENE_MODEL_API_KEY: process.env.VISION_API_KEY || process.env.MIDSCENE_MODEL_API_KEY || '',
      ...(process.env.VISION_BASE_URL ? { MIDSCENE_MODEL_BASE_URL: process.env.VISION_BASE_URL } : {}),
      ...(process.env.VISION_MODEL_FAMILY ? { MIDSCENE_MODEL_FAMILY: process.env.VISION_MODEL_FAMILY } : {}),
      MIDSCENE_MODEL_RETRY_COUNT: '0',
    },
    createOpenAIClient: (client) => {
      const create = client.chat.completions.create.bind(client.chat.completions)
      client.chat.completions.create = ((body: any, options: any) => {
        hooks.signal.throwIfAborted()
        hooks.beforeModelCall()
        return create(body, { ...options, signal: hooks.signal, maxRetries: 0 })
      }) as typeof client.chat.completions.create
      return client
    },
    onLLMUsage: hooks.onUsage,
  })
}
