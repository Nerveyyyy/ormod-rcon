# Lessons Learned

## Prisma 7 + Driver Adapters: Lazy Initialization

**Problem:** `prisma-client.ts` created the `PrismaBetterSqlite3` adapter at module-evaluation time:

```ts
const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! })
```

`PrismaBetterSqlite3` stores the config but only calls `createBetterSQLite3Client()` (which does `url.replace(...)`) on the first DB query. If `DATABASE_URL` is `undefined` at module-eval time (before `@fastify/env` or `--env-file` has loaded), the stored `url` is `undefined`, causing `TypeError: Cannot read properties of undefined (reading 'replace')` on the first query — not at startup.

**Fix:** Use a lazy singleton with a Proxy so all 14 importers work unchanged:

```ts
let _prisma: PrismaClient | undefined
function getClient(): PrismaClient {
  if (!_prisma) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    _prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) })
  }
  return _prisma
}
const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient()
    const value = (client as any)[prop as string]
    return typeof value === 'function' ? value.bind(client) : value
  },
})
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

---

## Always Use Specialized Agents for Reviews — Not Explore

**Problem:** Using a general-purpose `Explore` agent to conduct code reviews, security audits, or architecture reviews produces surface-level findings that miss critical issues. An `Explore` agent used for a code quality pass missed 8 high-severity security issues (missing body schemas on 4 PUT routes enabling mass assignment, SSRF in external URL fetch, setup race condition, empty BETTER_AUTH_SECRET, unconditional HSTS) that were only caught when the correct specialized agents were used.

**Rule:** Match agent to task type:

| Task                                                   | Correct Agent                              |
| ------------------------------------------------------ | ------------------------------------------ |
| Code quality, security vulnerabilities, best practices | `voltagent-qa-sec:code-reviewer`           |
| System design, architectural patterns, tech choices    | `voltagent-qa-sec:architect-reviewer`      |
| Docker, Dockerfile, compose, container security        | `voltagent-infra:docker-expert`            |
| Dependency audit, package management                   | `voltagent-dev-exp:dependency-manager`     |
| TypeScript-specific patterns and type safety           | `voltagent-lang:typescript-pro`            |
| React component patterns, hooks, state                 | `voltagent-lang:react-specialist`          |
| Test strategy, coverage gaps, QA                       | `voltagent-qa-sec:qa-expert`               |
| Security penetration / vulnerability exploitation      | `voltagent-qa-sec:penetration-tester`      |
| Performance bottlenecks                                | `voltagent-qa-sec:performance-engineer`    |
| Documentation quality and completeness                 | `voltagent-dev-exp:documentation-engineer` |
| CI/CD pipelines and deployment automation              | `voltagent-infra:deployment-engineer`      |
| Refactoring and code structure improvements            | `voltagent-dev-exp:refactoring-specialist` |

**Explore is for:** Finding files, searching for patterns, understanding codebase structure. It is NOT a substitute for domain-expert agents when the task requires judgment.

**If no suitable agent exists for a required task type, inform the user so they can install one.**
