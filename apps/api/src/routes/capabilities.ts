import type { FastifyPluginAsync } from 'fastify';
import * as ctrl from '../controllers/capabilities.js';

// ── Routes ───────────────────────────────────────────────────────────────────

const capabilitiesRoutes: FastifyPluginAsync = async (app) => {

  app.route({
    method:  'GET',
    url:     '/capabilities',
    handler: ctrl.listCapabilities,
  });
};

export default capabilitiesRoutes;
