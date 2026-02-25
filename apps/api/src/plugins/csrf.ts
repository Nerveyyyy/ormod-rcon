import fp from 'fastify-plugin';
import csrf from '@fastify/csrf-protection';
import type { FastifyRequest, FastifyReply } from 'fastify';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Paths that bypass CSRF validation (BetterAuth handles its own protection)
const CSRF_SKIP_PREFIXES = ['/api/auth'];

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
  fastify.addHook('onRequest', (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    if (SAFE_METHODS.has(request.method)) return done();
    if (CSRF_SKIP_PREFIXES.some(p => request.url.startsWith(p))) return done();

    fastify.csrfProtection(request, reply, done);
  });
}, { name: 'csrf', dependencies: ['cookie', 'env'] });
