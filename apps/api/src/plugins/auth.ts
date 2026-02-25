import fp from 'fastify-plugin';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import { auth } from '../lib/auth.js';
import type { SessionData } from '../config.js';

const PUBLIC_PREFIXES = ['/api/auth', '/api/setup', '/api/capabilities', '/api/csrf-token', '/health', '/ws/'];

export default fp(async function authPlugin(fastify) {
  // BetterAuth: intercept /api/auth/* BEFORE body parsing.
  // toNodeHandler reads the raw body stream; Fastify must not consume it first.
  fastify.addHook('onRequest', async (request, reply) => {
    if (!request.url?.startsWith('/api/auth')) return;
    reply.hijack();
    return toNodeHandler(auth)(request.raw, reply.raw);
  });

  // Auth guard: all /api/* and /ws/* routes require a valid session.
  // Exceptions: PUBLIC_PREFIXES whitelist.
  fastify.addHook('preHandler', async (request, reply) => {
    const url = request.url ?? '';

    // Static assets and non-API paths are public
    if (!url.startsWith('/api') && !url.startsWith('/ws')) return;

    // Whitelisted public API paths
    if (PUBLIC_PREFIXES.some(p => url === p || url.startsWith(p))) return;

    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session?.user) {
      return reply.status(401).send({ error: 'Unauthorized — please log in' });
    }

    // Attach to request so route handlers can read user/role without re-fetching
    request.session = session as SessionData;
  });
}, { name: 'auth', dependencies: ['env'] });
