import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/agent/decisions/jev-provider/**/*.test.ts', 'scripts/r1-jev-real/**/*.test.ts'],
    testTimeout: 10000,
    env: { R1_JEV_API_KEY: '', OPENROUTER_API_KEY: '', COMPLETION_REVIEW_API_KEY: '' },
  },
})
