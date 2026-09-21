import 'dotenv/config'

export const config = Object.freeze({
  port: Number(process.env.PORT ?? 4111),
  arenaPort: Number(process.env.ARENA_PORT ?? 4173),
  databaseUrl: process.env.DATABASE_URL ?? 'file:./data/ui-sentinel.db',

  agentModel: process.env.AGENT_MODEL ?? '',
  visionModel: process.env.VISION_MODEL ?? '',

  budget: {
    totalTimeoutMs: Number(process.env.RUN_TOTAL_TIMEOUT_MS ?? 300_000),
    maxActions: Number(process.env.RUN_MAX_ACTIONS ?? 40),
    maxModelCalls: Number(process.env.RUN_MAX_MODEL_CALLS ?? 30),
    toolTimeoutMs: Number(process.env.TOOL_TIMEOUT_MS ?? 15_000),
  },
})

export function checkModelConfig(): { ready: boolean; missing: string[] } {
  const missing: string[] = []
  if (!config.agentModel) missing.push('AGENT_MODEL')
  if (!config.visionModel) missing.push('VISION_MODEL')

  const provider = config.agentModel.split('/')[0]
  const keyMap: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_API_KEY',
  }
  const keyVar = keyMap[provider]
  if (keyVar && !process.env[keyVar]) {
    missing.push(keyVar)
  }

  return { ready: missing.length === 0, missing }
}
