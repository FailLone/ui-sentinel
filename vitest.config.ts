import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    env: { DATABASE_URL: 'file::memory:', AGENT_MODEL: '', VISION_MODEL: '', VISION_API_KEY: '', MIDSCENE_MODEL_API_KEY: '' },
    environment: 'node',
    include: ['src/**/*.test.ts', 'arena/**/*.test.ts', 'evaluation/**/*.test.ts'],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': '/src',
      '@arena': '/arena',
      '@evaluation': '/evaluation',
    },
  },
})
