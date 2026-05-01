import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Load tests live under tests/load and run only via `pnpm test:load`
    // (which uses vitest.load.config.ts). Keep the default suite fast.
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
    ],
    environment: 'node',
    testTimeout: 10_000,
    // Windows' non-paged socket pool is small: running multiple
    // fake-server instances across parallel test-file forks triggers
    // `listen ENOBUFS`. Run test files sequentially, each in its own
    // fresh worker — avoids both socket saturation and cross-file
    // memory accumulation from repeated TLS connection cycling.
    fileParallelism: false,
  },
})