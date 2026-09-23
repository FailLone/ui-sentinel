import { createOpenAI } from '@ai-sdk/openai'
import type { MastraModelConfig } from '@mastra/core/llm'
import { config } from './config.ts'
import { withModelTransportTiming } from '../execution/model-timing.ts'

const [provider, ...rest] = config.agentModel.split('/')
const modelId = rest.join('/')

// Mastra's bundled LanguageModelV4 has a widened doGenerate signature that
// doesn't structurally match @ai-sdk/openai's LanguageModelV4 at compile time,
// even though they are fully compatible at runtime.
function resolveAgentModel(): MastraModelConfig {
  if (provider === 'openai' && process.env.OPENAI_BASE_URL) {
    return createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
      fetch: withModelTransportTiming(fetch),
    }).chat(modelId) as unknown as MastraModelConfig
  }
  return config.agentModel as `${string}/${string}`
}

export const agentModel = resolveAgentModel()
