import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/agent/decisions/exploration/**/*.test.ts',
      'scripts/r1-jev/**/*.test.ts',
      'evaluation/r1-jev-dev/**/*.test.ts',
    ],
    testTimeout: 10_000,
    env: {
      R1_JEV_MODE: 'stub',
      OPENROUTER_API_KEY: '',
      COMPLETION_REVIEW_API_KEY: '',
      AGENT_MODEL: '',
      VISION_MODEL: '',
      VISION_API_KEY: '',
      MIDSCENE_MODEL_API_KEY: '',
      DATABASE_URL: 'file::memory:',
    },
  },
})
