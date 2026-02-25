import type { FastifyPluginAsync } from 'fastify';

// ── Routes ───────────────────────────────────────────────────────────────────

const csrfRoutes: FastifyPluginAsync = async (app) => {

  // Generate a CSRF token (sets the _csrf secret cookie, returns the token)
  app.route({
    method:  'GET',
    url:     '/csrf-token',
    handler: async (_request, reply) => {
      const token = reply.generateCsrf();
      return { token };
    },
  });
};

export default csrfRoutes;
