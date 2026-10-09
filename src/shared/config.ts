import 'dotenv/config'
import { readDnsConfig } from './dns-config.ts'

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

/**
 * Server-configured exact origins a `ui-scan` run may treat as local fixtures.
 *
 * This is deliberately *server* configuration and never request body content: a caller cannot widen
 * the address boundary by asking for it (plan 4.1). Values must be exact origins, so a whole
 * `127.0.0.0/8` range or a `*.local` suffix cannot be expressed even by a misconfiguration.
 */
function trustedOrigins(): readonly string[] {
  const raw = process.env.URL_SCAN_TRUSTED_ORIGINS ?? ''
  if (!raw.trim()) return []
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        const url = new URL(value)
        if (value.includes('*') || !/^https?:$/.test(url.protocol) || url.origin !== value)
          throw new Error('not an exact origin')
        return url.origin
      } catch {
        throw new Error(
          `Invalid URL_SCAN_TRUSTED_ORIGINS entry: ${value} (expected an exact origin such as http://127.0.0.1:5055)`,
        )
      }
    })
}

export const config = Object.freeze({
  port: bounded('PORT', 4111, 65535),
  arenaPort: bounded('ARENA_PORT', 4173, 65535),
  exportArenaPort: bounded('EXPORT_ARENA_PORT', 4183, 65535),
  exportApiPort: bounded('EXPORT_API_PORT', 4184, 65535),
  exportControlPort: bounded('EXPORT_CONTROL_PORT', 4185, 65535),
  databaseUrl: process.env.DATABASE_URL ?? 'file:./data/ui-sentinel.db',

  agentModel: process.env.AGENT_MODEL ?? '',
  visionModel: process.env.VISION_MODEL ?? '',
  // Opt in only for an OpenAI-compatible model whose thinking mode can be disabled.
  lengthRecoveryWithoutReasoning: process.env.AGENT_LENGTH_RECOVERY_WITHOUT_REASONING === '1',

  features: {
    atomicInvestigation: process.env.EXECUTION_ATOMIC_INVESTIGATION !== '0',
    blockerReview: process.env.EXECUTION_BLOCKER_REVIEW === '1',
    observation: process.env.EXECUTION_OBSERVATION_REUSE !== '0',
    ruleRouting: process.env.EXECUTION_RULE_ROUTING !== '0',
    journeys: process.env.EXECUTION_JOURNEYS !== '0',
    modelStreaming: process.env.EXECUTION_MODEL_STREAMING !== '0',
    shortFinish: process.env.EXECUTION_SHORT_FINISH !== '0',
    /**
     * Autonomous visual discovery. Off by default: the frozen visual-focus interfaces and their tests
     * are inert until a run opts in, so ordinary C0-C5 behaviour is byte-for-byte unchanged.
     */
    visualDiscovery: process.env.EXECUTION_VISUAL_DISCOVERY === '1',
    /**
     * Anonymous URL scanning (`ui-scan` runs). Off by default until the build's own evidence exists:
     * the workbench does not offer the mode and the API refuses new UI admission while this is 0.
     * Historical records are still readable either way (plan 11.4).
     */
    urlScan: process.env.EXECUTION_URL_SCAN === '1',
  },

  /** Address boundary for `ui-scan`. Server-owned so a request body can never widen it. */
  urlScan: {
    trustedOrigins: trustedOrigins(),
    dns: readDnsConfig(process.env),
  },

  completionReview: {
    model: 'typesafe/jev-1.13',
    expectedModel: 'typesafe/jev-1.13-20260917',
    endpoint: process.env.COMPLETION_REVIEW_URL ?? 'https://openrouter.ai/api/alpha/decisions',
    apiKey: process.env.COMPLETION_REVIEW_API_KEY ?? process.env.OPENROUTER_API_KEY ?? '',
    timeoutMs: 15000,
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
  if (config.features.blockerReview && !config.completionReview.apiKey)
    missing.push('COMPLETION_REVIEW_API_KEY or OPENROUTER_API_KEY')
  if (!config.agentModel) missing.push('AGENT_MODEL')
  if (!config.visionModel) missing.push('VISION_MODEL')

  if (!process.env.VISION_API_KEY && !process.env.MIDSCENE_MODEL_API_KEY)
    missing.push('VISION_API_KEY')
  if (!process.env.VISION_MODEL_FAMILY && !process.env.MIDSCENE_MODEL_FAMILY)
    missing.push('VISION_MODEL_FAMILY')
  const provider = config.agentModel.split('/')[0]
  if (config.lengthRecoveryWithoutReasoning && provider !== 'openai')
    missing.push('openai-compatible AGENT_MODEL for length recovery without reasoning')
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
