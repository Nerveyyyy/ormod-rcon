# Lessons Learned

## Prisma 7 + Driver Adapters: Lazy Initialization

**Problem:** `prisma-client.ts` created the `PrismaBetterSqlite3` adapter at module-evaluation time:
```ts
const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
```
`PrismaBetterSqlite3` stores the config but only calls `createBetterSQLite3Client()` (which does `url.replace(...)`) on the first DB query. If `DATABASE_URL` is `undefined` at module-eval time (before `@fastify/env` or `--env-file` has loaded), the stored `url` is `undefined`, causing `TypeError: Cannot read properties of undefined (reading 'replace')` on the first query — not at startup.

**Fix:** Use a lazy singleton with a Proxy so all 14 importers work unchanged:
```ts
let _prisma: PrismaClient | undefined;
function getClient(): PrismaClient {
  if (!_prisma) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
  }
  return _prisma;
}
const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = (client as any)[prop as string];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
```
Bind methods to the actual client to ensure correct `this` context for `$disconnect` etc.

---

## Docker Multi-Stage: Don't Regenerate in Runtime Stage

**Problem:** `Dockerfile.dashboard` had `RUN npx prisma generate` in the runtime stage (Stage 3). This was unnecessary — the api-builder stage (Stage 2) already generates TypeScript source and tsc compiles it to `dist/`. The runtime stage only runs `node dist/src/server.js`.

**Fix:** Remove `RUN npx prisma generate` from runtime stage entirely.

Also, `prisma.config.ts` was missing from the api-builder COPY commands. Adding it:
1. Provides the config to `prisma generate` in api-builder (consistent with local generation)
2. Busts stale Docker layer cache when `prisma.config.ts` changes

**Pattern:** In a multi-stage build, only the builder stage should run `prisma generate` + `tsc`. The runtime stage only needs `node dist/`.

---

## Transient SQLite Fork Failures in Vitest

Vitest `pool: 'forks'` parallel runs with SQLite can show transient failures on the first run. Always re-run the failing file in isolation before investigating. A full second run typically passes 100%.
