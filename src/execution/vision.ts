import { PlaywrightAgent } from '@midscene/web/playwright/agent'
import type { Page } from 'playwright'
import { abortable } from './model-request.ts'
import { config } from '../shared/config.ts'

/** Only locate; all actions remain under the executor's cancellation/permission boundary. */
export function createVisionLocator(
  page: Page,
  hooks: {
    signal: AbortSignal
    beforeModelCall: (deadlineAt: number) => void
    onUsage?: (usage: unknown) => void
  },
) {
  return new PlaywrightAgent(page, {
    generateReport: false,
    modelConfig: {
      MIDSCENE_MODEL_NAME: process.env.VISION_MODEL ?? '',
      MIDSCENE_MODEL_API_KEY:
        process.env.VISION_API_KEY || process.env.MIDSCENE_MODEL_API_KEY || '',
      ...(process.env.VISION_BASE_URL
        ? { MIDSCENE_MODEL_BASE_URL: process.env.VISION_BASE_URL }
        : {}),
      MIDSCENE_MODEL_FAMILY:
        process.env.VISION_MODEL_FAMILY || process.env.MIDSCENE_MODEL_FAMILY || '',
      MIDSCENE_MODEL_RETRY_COUNT: '0',
    },
    createOpenAIClient: (client) => {
      const create = client.chat.completions.create.bind(client.chat.completions)
      client.chat.completions.create = (async (body: any, options: any) => {
        hooks.signal.throwIfAborted()
        const deadlineAt = Date.now() + config.budget.modelRequestTimeoutMs
        hooks.beforeModelCall(deadlineAt)
        const ac = new AbortController()
        const signal = AbortSignal.any([hooks.signal, ac.signal])
        const timer = setTimeout(
          () => ac.abort(new Error('model-request-timeout')),
          config.budget.modelRequestTimeoutMs,
        )
        try {
          return await abortable(signal, create(body, { ...options, signal, maxRetries: 0 }))
        } finally {
          clearTimeout(timer)
        }
      }) as typeof client.chat.completions.create
      return client
    },
    onLLMUsage: hooks.onUsage,
  })
}
