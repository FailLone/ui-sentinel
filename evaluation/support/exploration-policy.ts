// Shared frozen defaults. Historical schema revisions and cost limits intentionally unchanged.
export const MODES = ['agent', 'program', 'jev'] as const
export type Mode = (typeof MODES)[number]
export const CASES = ['semantic', 'ambiguity', 'expanded'] as const
export type Case = (typeof CASES)[number]
export const AGENT = 'deepseek/deepseek-v4.1-flash'
export const POLICY = {
  revision: 'r1-online-pilot-3',
  candidateSource: 'original-executor-selected-local-public-frame',
  actions: 6,
  modelCalls: 8,
  totalTimeoutMs: 180000,
  toolMs: 5000,
  modelMs: 15000,
  retries: 0,
  maxCandidates: 3,
  maxQuestions: 7,
  maxFrameBytes: 32768,
  maxAgentBytes: 131072,
  jevConfidence: 0.5,
  confidenceMeaning: 'pre-registered exploratory abstention, not calibrated',
  agent: {
    model: AGENT,
    provider: 'Wafer',
    maxOutputTokens: 4096,
    contextTokens: 1048576,
    inputPerTokenUsd: 0.000000055,
    outputPerTokenUsd: 0.0000012,
    reserveUsd: 0.063,
    perRunRequests: 8,
    batchRequests: 72,
  },
  jev: {
    model: 'typesafe/jev-1.13',
    expectedModel: 'typesafe/jev-1.13-20260917',
    provider: 'TypeSafe',
    reserveUsd: 0.003,
    perRunRequests: 2,
    batchRequests: 6,
  },
  vision: { enabled: false, perRunRequests: 0, batchRequests: 0, reservationUsd: 0 },
  batchMaxRequests: 78,
  batchMaxUsd: 4.554,
  batchWindowMs: 1800000,
  noFallback: true,
  scopeExpansion: 'existing-one-local-extension-1',
} as const
