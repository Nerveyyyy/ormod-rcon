import { defineConfig } from 'vitest/config'

// Dedicated config for load tests. Invoked by `pnpm test:load`. These
// tests are not part of the default suite — they validate the single-
// client primitive under concurrent load and can take minutes at the
// realistic ceiling (1k clients, 100 events/s).
export default defineConfig({
  test: {
    include: [ 'tests/load/**/*.test.ts' ],
    environment: 'node',
    testTimeout: 180_000,
    fileParallelism: false,
  },
})