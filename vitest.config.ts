import { defineConfig } from 'vitest/config'

// Most suites spawn the CLI or a browser as a subprocess. On a slow or busy disk one spawn can
// take seconds, and a worker per core starves them all, so allow time and cap the pool.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    maxWorkers: '50%',
  },
})
