import fp from 'fastify-plugin';
import csrf from '@fastify/csrf-protection';
import type { FastifyRequest, FastifyReply } from 'fastify';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Paths that bypass CSRF validation (BetterAuth handles its own protection)
const CSRF_SKIP_PREFIXES = ['/api/auth', '/api/setup'];

export default fp(async function csrfPlugin(fastify) {
  await fastify.register(csrf, {
    sessionPlugin: '@fastify/cookie',
    cookieOpts: {
      signed:   false,
      httpOnly: true,
      sameSite: 'strict',
      path:     '/',
    },
  });

  // Validate CSRF token on all state-changing requests
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (SAFE_METHODS.has(request.method)) return;
    if (CSRF_SKIP_PREFIXES.some(p => request.url.startsWith(p))) return;

    return new Promise<void>((resolve, reject) => {
      fastify.csrfProtection(request, reply, (err?: Error) => err ? reject(err) : resolve());
    });
  });
}, { name: 'csrf', dependencies: ['cookie', 'env'] });
