import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { fromNodeHeaders } from 'better-auth/node'
import { sql } from 'drizzle-orm'
import type { DbClient } from '@ormod/database'
import type { AuthSession } from '../lib/auth.js'
import '../types.js'

/**
 * Paths that bypass the authenticated-caller guard. Exact matches or
 * prefix matches depending on the entry — see `isPublicPath` below.
 * CSRF is intentionally NOT in this list because Better Auth already
 * enforces trustedOrigins + Fetch Metadata + SameSite cookies, which
 * covers the cases `@fastify/csrf-protection` would have caught.
 */
const PUBLIC_EXACT = new Set<string>([
  '/healthz',
  '/readyz',
  '/api/setup',
])

const PUBLIC_PREFIXES = [
  '/api/auth/',
  '/docs',
]

const isPublicPath = (url: string): boolean => {
  // Strip query string before matching — `/api/servers?limit=20` must
  // still test against `/api/servers`.
  const pathEnd = url.indexOf('?')
  const path = pathEnd === -1 ? url : url.slice(0, pathEnd)
  if (PUBLIC_EXACT.has(path)) return true
  for (const prefix of PUBLIC_PREFIXES) {
    if (path === prefix || path.startsWith(prefix)) return true
  }
  // Non-API paths are either SPA assets served from spa-fallback or
  // plain 404s — either way they shouldn't require a session.
  if (!path.startsWith('/api/')) return true
  return false
}

const extractTenantId = (session: AuthSession): string | null => {
  return session.session.activeOrganizationId ?? null
}

interface MemberLookupResult {
  organizationId: string | null
  /** Set when the lookup query itself failed — useful so callers can
   * distinguish "no membership row" from "we couldn't ask the question." */
  error?: unknown
}

/**
 * Fallback lookup for users whose session hasn't picked up its
 * activeOrganizationId yet — typical in the single-org deployment
 * right after signup, where `activeOrganizationId` is only populated
 * once Better Auth's organization plugin sees the membership. The
 * `member` table is plugin-managed and not in our Drizzle schema, so
 * the query is raw.
 */
const lookupMemberOrg = async (
  db: DbClient,
  userId: string,
): Promise<MemberLookupResult> => {
  try {
    const raw = await db.execute<{ organization_id: string }>(
      sql`select organization_id from member where user_id = ${ userId } limit 1`,
    )
    const rows = Array.isArray(raw) ? raw : (raw as { rows?: unknown[] }).rows ?? []
    const first = rows[0] as { organization_id?: string } | undefined
    return { organizationId: first?.organization_id ?? null }
  } catch (err) {
    return { organizationId: null, error: err }
  }
}

/**
 * Converts a Fastify request into a Fetch-style Request for Better
 * Auth's handler. Matches Better Auth's documented Fastify integration
 * (URL + fromNodeHeaders + new Request + auth.handler + header copy-
 * back). `toNodeHandler` isn't used here because it's documented for
 * Express and the Next.js Pages Router; using it on Fastify requires
 * `reply.hijack()` before body parsing and drifts from the published
 * integration path.
 */
const forwardToAuthHandler = async (
  request: FastifyRequest,
  authHandler: (req: Request) => Promise<Response>,
): Promise<Response> => {
  const url = new URL(request.url, `http://${ request.headers.host ?? 'localhost' }`)
  const headers = fromNodeHeaders(request.headers)

  // Better Auth derives session `ipAddress` from headers only (it
  // can't reach the socket). Behind a real proxy `x-forwarded-for` is
  // already populated; on dev / direct hits it isn't — surface
  // Fastify's resolved request.ip so the session row gets loopback
  // instead of null.
  if (!headers.has('x-forwarded-for') && request.ip) {
    headers.set('x-forwarded-for', request.ip)
  }

  const body = request.body ? JSON.stringify(request.body) : undefined

  const req = new Request(url.toString(), {
    method: request.method,
    headers,
    body,
  })

  return authHandler(req)
}

/**
 * Authentication plugin. Owns three responsibilities so the rest of
 * the app has one place to look for auth behaviour:
 *
 *   1. Mounts the Better Auth handler at `/api/auth/*`.
 *   2. Resolves the caller's session on every request and writes
 *      `user` / `tenantId` / `sessionId` into `request.requestContext`.
 *   3. Enforces a global guard — non-public paths without a session
 *      return 401; authed callers without an active organization
 *      return 403.
 *
 * Depends on `cookie` so Better Auth can read its session cookie, and
 * on `request-context` so the onRequest hook has somewhere to write.
 */
const authPlugin: FastifyPluginAsync = async (app) => {
  app.route({
    method: [ 'GET', 'POST' ],
    url: '/api/auth/*',
    handler: async (request, reply) => {
      const response = await forwardToAuthHandler(request, app.auth.handler)
      reply.status(response.status)
      response.headers.forEach((value, key) => {
        void reply.header(key, value)
      })
      const text = response.body ? await response.text() : null
      return reply.send(text)
    },
  })

  app.addHook('onRequest', async (request) => {
    // The auth handler's own endpoints don't need pre-resolved session
    // state — skipping them avoids a redundant getSession round-trip
    // while the request is already headed into Better Auth.
    if (request.url.startsWith('/api/auth/')) return

    try {
      const session = await app.auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      })
      // The /get-session after-hook in lib/auth.ts wraps null into
      // `{setupRequired: true}` so the SPA can route first-run visitors
      // to /setup. That wrapper has no user/session, so check both
      // before treating this as an authenticated caller.
      if (!session || !session.user || !session.session) return

      request.requestContext.set('user', {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      })
      request.requestContext.set('sessionId', session.session.id)

      let tenantId = extractTenantId(session)
      if (!tenantId) {
        const lookup = await lookupMemberOrg(app.db, session.user.id)
        tenantId = lookup.organizationId
        if (lookup.error) {
          request.log.error(
            { err: lookup.error, userId: session.user.id },
            '[auth] member lookup failed — check the member table schema',
          )
        } else if (!tenantId) {
          request.log.warn(
            { userId: session.user.id },
            '[auth] session has no activeOrganizationId and no member row found',
          )
        }
      }
      request.requestContext.set('tenantId', tenantId)
    } catch (err) {
      request.log.warn({ err }, '[auth] failed to resolve session')
    }
  })

  app.addHook('preHandler', async (request, reply) => {
    if (isPublicPath(request.url)) return
    const user = request.requestContext.get('user')
    if (!user) return reply.unauthorized('not signed in')
    const tenantId = request.requestContext.get('tenantId')
    if (!tenantId) return reply.forbidden('signed in but not bound to an organization')
  })
}

export default fp(authPlugin, {
  name: 'auth',
  dependencies: [ 'cookie', 'request-context' ],
})
