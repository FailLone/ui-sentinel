import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
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
