import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    // Register tsx ESM loader in forked processes so Node.js can resolve
    // .js → .ts imports (used by TypeScript NodeNext moduleResolution) and
    // handle @fastify/autoload's runtime dynamic imports of .ts files.
    execArgv: ['--import', 'tsx/esm'],
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
