import type { FastifyPluginAsync } from 'fastify'
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { sql } from 'drizzle-orm'
import {
  healthzResponseSchema,
  readyzFailSchema,
  readyzOkSchema,
} from '@ormod/contracts'

/**
 * Liveness (`/healthz`) and readiness (`/readyz`). Both live at the
 * root, not under `/api`, so probes and load balancers can reach them
 * without knowing the application namespace.
 *
 * - `/healthz` — process is up. Always 200 unless the event loop is
 *   so wedged the request never lands.
 * - `/readyz` — the process is willing to take traffic. Pings the DB.
 *   200 with `status: ok` when healthy; 503 with `status: degraded`
 *   and a per-check breakdown when not.
 */
const healthRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<TypeBoxTypeProvider>()
  const startedAt = Date.now()

  r.get(
    '/healthz',
    { schema: { tags: [ 'system' ], response: { 200: healthzResponseSchema } } },
    () => {
      return {
        status: 'ok' as const,
        version: app.appVersion,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
      }
    },
  )

  r.get(
    '/readyz',
    {
      schema: {
        tags: [ 'system' ],
        response: {
          200: readyzOkSchema,
          503: readyzFailSchema,
        },
      },
    },
    async (_request, reply) => {
      try {
        await app.db.execute(sql`select 1`)
        return reply.code(200).send({ status: 'ok' as const })
      } catch (err) {
        app.log.error({ err }, '[readyz] database check failed')
        return reply
          .code(503)
          .send({ status: 'degraded' as const, checks: { database: 'fail' as const } })
      }
    },
  )
}

export default healthRoutes
