import fp from 'fastify-plugin'
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node'
import { auth, canWrite, isOwner } from '../lib/auth.js'
import type { SessionData } from '../config.js'
import type { FastifyRequest, FastifyReply } from 'fastify'

// Routes that use prefix matching (genuinely cover multiple sub-paths)
const PUBLIC_PREFIX_ROUTES = ['/api/auth']

// Routes that must match exactly (no sub-path access)
const PUBLIC_EXACT_ROUTES = [
  '/api/setup',
  '/api/me',
  '/api/csrf-token',
  '/health',
]

const VALID_ROLES = ['OWNER', 'ADMIN', 'VIEWER']

/**
 * Runtime guard that validates the session role is a known value.
 * Throws if the role is missing or not in the allowed set.
 */
export function assertSessionRole(session: SessionData): void {
  if (!VALID_ROLES.includes(session.user.role)) {
    throw new Error(`Invalid session role: ${session.user.role}`)
  }
}

export default fp(
  async function authPlugin(fastify) {
    // BetterAuth: intercept /api/auth/* BEFORE body parsing.
    // toNodeHandler reads the raw body stream; Fastify must not consume it first.
    fastify.addHook('onRequest', async (request, reply) => {
      if (!request.url?.startsWith('/api/auth')) return
      reply.hijack()
      return toNodeHandler(auth)(request.raw, reply.raw)
    })

    // Auth guard: all /api/* and /ws/* routes require a valid session.
    // Exceptions: public routes whitelist.
    fastify.addHook('preHandler', async (request, reply) => {
      const url = request.url ?? ''

      // Static assets and non-API paths are public
      if (!url.startsWith('/api') && !url.startsWith('/ws')) return

      // Exact-match public routes (strip querystring for comparison)
      const urlPath = url.split('?')[0] ?? url
      if (PUBLIC_EXACT_ROUTES.includes(urlPath)) return

      // Prefix-match public routes (e.g. /api/auth/*)
      if (PUBLIC_PREFIX_ROUTES.some((p) => url.startsWith(p))) return

      const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) })
      if (!session?.user) {
        return reply.status(401).send({ error: 'Unauthorized — please log in' })
      }

      // Attach to request so route handlers can read user/role without re-fetching
      const typedSession = session as SessionData
      assertSessionRole(typedSession)
      request.session = typedSession
    })
  },
  { name: 'auth', dependencies: ['env'] }
)

// ── RBAC preHandlers ─────────────────────────────────────────────────────────
// Use these as route-level preHandler arrays, e.g.:
//   app.route({ ..., preHandler: [requireWrite] })

/** Requires OWNER or ADMIN role. Rejects VIEWER with 403. */
export async function requireWrite(request: FastifyRequest, reply: FastifyReply) {
  if (!request.session?.user) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
  if (!canWrite(request.session.user.role)) {
    return reply.status(403).send({ error: 'Forbidden — requires ADMIN or OWNER role' })
  }
}

/** Requires OWNER role. Rejects ADMIN and VIEWER with 403. */
export async function requireOwner(request: FastifyRequest, reply: FastifyReply) {
  if (!request.session?.user) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
  if (!isOwner(request.session.user.role)) {
    return reply.status(403).send({ error: 'Forbidden — requires OWNER role' })
  }
}
