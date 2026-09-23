import 'dotenv/config'

function bounded(name: string, fallback: number, max: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value <= 0 || value > max)
    throw new Error(`Invalid ${name}: expected integer in 1..${max}`)
  return value
}

function retries(): number {
  const value = Number(process.env.MODEL_REQUEST_MAX_RETRIES ?? 1)
  if (!Number.isInteger(value) || value < 0 || value > 1)
    throw new Error('Invalid MODEL_REQUEST_MAX_RETRIES: expected 0 or 1')
  return value
}

export const config = Object.freeze({
  port: bounded('PORT', 4111, 65535),
  arenaPort: bounded('ARENA_PORT', 4173, 65535),
  databaseUrl: process.env.DATABASE_URL ?? 'file:./data/ui-sentinel.db',

  agentModel: process.env.AGENT_MODEL ?? '',
  visionModel: process.env.VISION_MODEL ?? '',

  optimizations: {
    observation: process.env.EXECUTION_OBSERVATION_REUSE !== '0',
    ruleRouting: process.env.EXECUTION_RULE_ROUTING !== '0',
    journeys: process.env.EXECUTION_JOURNEYS !== '0',
    modelStreaming: process.env.EXECUTION_MODEL_STREAMING !== '0',
    shortFinish: process.env.EXECUTION_SHORT_FINISH !== '0',
    evidenceAnalysis: process.env.EXECUTION_EVIDENCE_ANALYSIS === '1',
    analysisMode: process.env.EXECUTION_ANALYSIS_MODE === 'serial' ? 'serial' : 'parallel',
  },

  budget: {
    totalTimeoutMs: bounded('RUN_TOTAL_TIMEOUT_MS', 300_000, 300_000),
    maxActions: bounded('RUN_MAX_ACTIONS', 40, 40),
    maxModelCalls: bounded('RUN_MAX_MODEL_CALLS', 40, 60),
    toolTimeoutMs: bounded('TOOL_TIMEOUT_MS', 15_000, 60_000),
    modelRequestTimeoutMs: bounded('MODEL_REQUEST_TIMEOUT_MS', 60_000, 120_000),
    modelRequestMaxRetries: retries(),
  },
})

export function checkModelConfig(): { ready: boolean; missing: string[] } {
  const missing: string[] = []
  if (!config.agentModel) missing.push('AGENT_MODEL')
  if (!config.visionModel) missing.push('VISION_MODEL')

  if (!process.env.VISION_API_KEY && !process.env.MIDSCENE_MODEL_API_KEY)
    missing.push('VISION_API_KEY')
  if (!process.env.VISION_MODEL_FAMILY && !process.env.MIDSCENE_MODEL_FAMILY)
    missing.push('VISION_MODEL_FAMILY')
  const provider = config.agentModel.split('/')[0]
  const keyMap: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_API_KEY',
  }
  const keyVar = keyMap[provider]
  if (!keyVar && config.agentModel)
    missing.push('supported AGENT_MODEL provider (openai/anthropic/google)')
  if (keyVar && !process.env[keyVar]) {
    missing.push(keyVar)
  }

  return { ready: missing.length === 0, missing }
}
