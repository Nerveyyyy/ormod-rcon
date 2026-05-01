import type { FastifyPluginAsync } from 'fastify'
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import { and, eq, sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { servers, serverRuntime, type DbClient } from '@ormod/database'
import {
  createServerRequestSchema,
  createServerResponseSchema,
  errorEnvelopeSchema,
  listQuerySchema,
  listServersResponseSchema,
  narrowLastErrorReason,
  serverDetailSchema,
  type ServerDetail,
  type ServerRuntime,
} from '@ormod/contracts'
import {
  buildEnvelope,
  consumeCursor,
  keysetCondition,
  orderBy,
  parseSort,
  wantsTotal,
  type SortableMap,
  type SortSpec,
} from '../lib/pagination.js'
import { probeRconConnection, type ProbeReason } from '../lib/rcon-probe.js'

const idParamSchema = Type.Object({ id: Type.String({ format: 'uuid' }) })

/** Sort fields exposed to clients on the servers list. */
const SERVER_SORTABLE: SortableMap = {
  createdAt: servers.createdAt,
  name: servers.name,
  handle: servers.handle,
}

const DEFAULT_SERVER_SORT: SortSpec = { field: 'createdAt', direction: 'desc' }

const fetchServerDetail = async (
  db: DbClient,
  tenantId: string,
  id: string,
): Promise<ServerDetail | null> => {
  const rows = await db
    .select({
      id: servers.id,
      handle: servers.handle,
      name: servers.name,
      region: servers.region,
      enabled: servers.enabled,
      createdAt: servers.createdAt,
      rconHost: servers.rconHost,
      rconPort: servers.rconPort,
    })
    .from(servers)
    .where(and(eq(servers.id, id), eq(servers.tenantId, tenantId)))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  const runtimeRows = await db
    .select({
      connectionState: serverRuntime.connectionState,
      playerCount: serverRuntime.playerCount,
      latencyMs: serverRuntime.latencyMs,
      lastConnectedAt: serverRuntime.lastConnectedAt,
      lastErrorReason: serverRuntime.lastErrorReason,
    })
    .from(serverRuntime)
    .where(eq(serverRuntime.serverId, row.id))
    .limit(1)

  const rt = runtimeRows[0]
  const runtime: ServerRuntime | null = rt
    ? {
        state: rt.connectionState as ServerRuntime['state'],
        playerCount: rt.playerCount ?? null,
        latencyMs: rt.latencyMs ?? null,
        lastConnectedAt: rt.lastConnectedAt ? rt.lastConnectedAt.toISOString() : null,
        lastErrorReason: narrowLastErrorReason(rt.lastErrorReason),
      }
    : null

  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    region: row.region,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    rconHost: row.rconHost,
    rconPort: row.rconPort,
    runtime,
  }
}

/**
 * Route handlers read `tenantId` off `request.requestContext` with a
 * non-null assertion — the auth plugin's global guard rejects both
 * unauthenticated callers (401) and authenticated callers without an
 * active organization (403) before the handler runs.
 */
const serverRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<TypeBoxTypeProvider>()

  r.get(
    '/api/servers',
    {
      schema: {
        tags: [ 'servers' ],
        querystring: listQuerySchema,
        response: { 200: listServersResponseSchema },
      },
    },
    async (request) => {
      const tenantId = request.requestContext.get('tenantId')!
      const { db } = app

      const sort = parseSort(request.query.sort, SERVER_SORTABLE, DEFAULT_SERVER_SORT)
      const sortColumn = SERVER_SORTABLE[sort.field]!
      const cursor = consumeCursor(request.query.cursor, sort)
      const limit = request.query.limit
      const includeTotal = wantsTotal(request.query.include)

      const baseFilter = eq(servers.tenantId, tenantId)
      const keyset = cursor
        ? keysetCondition(cursor, sort, sortColumn, servers.id)
        : undefined
      const where = keyset ? and(baseFilter, keyset) : baseFilter

      const rows = await db
        .select({
          id: servers.id,
          handle: servers.handle,
          name: servers.name,
          region: servers.region,
          enabled: servers.enabled,
          createdAt: servers.createdAt,
        })
        .from(servers)
        .where(where)
        .orderBy(...orderBy(sortColumn, servers.id, sort.direction))
        .limit(limit + 1)

      let total: number | undefined
      if (includeTotal) {
        const countRows = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(servers)
          .where(baseFilter)
        total = countRows[0]?.count ?? 0
      }

      return buildEnvelope({
        rows,
        limit,
        sort,
        total,
        toItem: (row) => {
          return {
            id: row.id,
            handle: row.handle,
            name: row.name,
            region: row.region,
            enabled: row.enabled,
            createdAt: row.createdAt.toISOString(),
          }
        },
        toCursorLast: (row) => {
          // Walk the typed row by field name so the sort allow-list
          // is the single source of truth for "what's encodable."
          let encoded: string | number
          switch (sort.field) {
            case 'createdAt':
              encoded = row.createdAt.toISOString()
              break
            case 'name':
              encoded = row.name
              break
            case 'handle':
              encoded = row.handle
              break
            default:
              throw new Error(`unhandled sort field "${ sort.field }"`)
          }
          return { [sort.field]: encoded, id: row.id }
        },
      })
    },
  )

  r.post(
    '/api/servers',
    {
      schema: {
        tags: [ 'servers' ],
        body: createServerRequestSchema,
        response: {
          201: createServerResponseSchema,
          400: errorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const tenantId = request.requestContext.get('tenantId')!
      const { db, encrypter, supervisor } = app

      const body = request.body

      // Pre-flight: a TCP ping that confirms the host resolves and
      // the port accepts connections. Catches typos and "server is
      // offline right now" before we persist anything; the supervisor
      // surfaces a wrong-password mismatch later via the `errored`
      // dashboard state.
      const probe = await probeRconConnection({
        host: body.rconHost,
        port: body.rconPort,
      })
      if (!probe.ok) {
        const code: `connection_${ ProbeReason }` = `connection_${ probe.code ?? 'network_error' }`
        const message = probe.detail
          ? `Could not reach the RCON server: ${ probe.detail }`
          : 'Could not reach the RCON server.'
        return reply.code(400).send({
          error: { code, message },
        })
      }

      const id = uuidv7()
      const now = new Date()
      const encryptedPassword = encrypter.encryptTenantScoped(
        tenantId,
        body.rconPassword,
      )

      try {
        await db.insert(servers).values({
          id,
          tenantId,
          handle: body.handle,
          name: body.name,
          region: body.region ?? null,
          rconHost: body.rconHost,
          rconPort: body.rconPort,
          rconPasswordEncrypted: encryptedPassword,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        })
      } catch (err) {
        // Unique (tenant_id, handle) collision — Postgres error code
        // 23505 (unique_violation). Returned to the client as 409 so
        // the form can point at the right field.
        const e = err as { code?: string }
        if (e.code === '23505') return reply.conflict('handle already in use')
        throw err
      }

      void supervisor.add(id).catch((err) => {
        request.log.warn({ err, serverId: id }, '[supervisor] add failed')
      })

      const detail = await fetchServerDetail(db, tenantId, id)
      if (!detail) {
        // Inserted-then-missing should never happen; treat as a 500.
        throw new Error('created server row not found on read-back')
      }
      return reply.code(201).send(detail)
    },
  )

  r.get(
    '/api/servers/:id',
    {
      schema: {
        tags: [ 'servers' ],
        params: idParamSchema,
        response: { 200: serverDetailSchema },
      },
    },
    async (request, reply) => {
      const tenantId = request.requestContext.get('tenantId')!
      const detail = await fetchServerDetail(app.db, tenantId, request.params.id)
      if (!detail) return reply.notFound()
      return detail
    },
  )

  r.delete(
    '/api/servers/:id',
    { schema: { tags: [ 'servers' ], params: idParamSchema } },
    async (request, reply) => {
      const tenantId = request.requestContext.get('tenantId')!
      const { db, supervisor } = app

      const deleted = await db
        .delete(servers)
        .where(and(eq(servers.id, request.params.id), eq(servers.tenantId, tenantId)))
        .returning({ id: servers.id })

      if (deleted.length === 0) return reply.notFound()

      void supervisor.remove(request.params.id).catch((err) => {
        request.log.warn({ err, serverId: request.params.id }, '[supervisor] remove failed')
      })

      return reply.code(204).send()
    },
  )
}

export default serverRoutes
