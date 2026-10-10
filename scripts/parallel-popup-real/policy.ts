export const POLICY = {
  version: 'parallel-popup-real-1',
  rows: 3,
  mainRequests: 30,
  jevRequests: 18,
  maxCostUsd: 1.86,
  row: { mainRequests: 10, jevRequests: 6, maxActions: 6, maxModelCalls: 16, timeoutMs: 180000 },
  batchMs: 600000,
  cleanupMs: 60000,
  mainTimeoutMs: 60000,
  jevTimeoutMs: 8000,
  main: {
    model: 'deepseek/deepseek-v4.1-flash',
    provider: 'Wafer',
    reserveUsd: 0.06,
    contextTokens: 1048576,
    outputTokens: 4096,
    promptPrice: 0.00000005,
    outputPrice: 0.0000016,
  },
  jev: {
    model: 'typesafe/jev-1.13',
    provider: 'TypeSafe',
    reserveUsd: 0.003,
    promptTokens: 32000,
    promptPrice: 0.000000042,
    outputPrice: 0,
  },
  retry: 0,
  recovery: false,
  fallback: false,
  vision: false,
} as const

/** A separate proposal/claim for exactly one P02 parent and its original two children. */
export const P02_POLICY = {
  ...POLICY,
  version: 'parallel-popup-p02-continuation-1',
  rows: 1,
  mainRequests: 10,
  jevRequests: 6,
  maxCostUsd: 0.62,
  batchMs: 180000,
} as const
export type BatchPolicy = typeof POLICY | typeof P02_POLICY
