import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/r1-decision-pilot/**/*.test.ts'],
    env: { R1_JEV_API_KEY: '', OPENROUTER_API_KEY: '', COMPLETION_REVIEW_API_KEY: '' },
  },
})
