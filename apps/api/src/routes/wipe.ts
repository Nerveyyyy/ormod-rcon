import type { FastifyPluginAsync } from 'fastify';
import { requireOwner } from '../plugins/auth.js';
import * as ctrl from '../controllers/wipe.js';

// ── Schemas ──────────────────────────────────────────────────────────────────

const serverParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' } },
} as const;

const wipeLogParams = {
  type: 'object',
  required: ['id', 'wipeId'],
  properties: {
    id:     { type: 'string' },
    wipeId: { type: 'string' },
  },
} as const;

const wipeBody = {
  type: 'object',
  required: ['type'],
  properties: {
    type:       { type: 'string', enum: ['FULL', 'MAP_ONLY', 'MAP_PLAYERS', 'CUSTOM'] },
    files:      { type: 'array', items: { type: 'string' } },
    backup:     { type: 'boolean' },
    stopFirst:  { type: 'boolean' },
  },
} as const;

// ── Routes ───────────────────────────────────────────────────────────────────

const wipeRoutes: FastifyPluginAsync = async (app) => {

  // Read wipe history — any authenticated user
  app.route({
    method:  'GET',
    url:     '/servers/:id/wipes',
    schema:  { params: serverParams },
    handler: ctrl.listWipes,
  });

  // Execute wipe — OWNER only (destructive)
  app.route({
    method:     'POST',
    url:        '/servers/:id/wipe',
    schema:     { params: serverParams, body: wipeBody },
    preHandler: [requireOwner],
    handler:    ctrl.executeWipe,
  });

  // Read single wipe log — any authenticated user
  app.route({
    method:  'GET',
    url:     '/servers/:id/wipes/:wipeId',
    schema:  { params: wipeLogParams },
    handler: ctrl.getWipeLog,
  });
};

export default wipeRoutes;
