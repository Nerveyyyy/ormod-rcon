import type { FastifyPluginAsync } from 'fastify';
import * as ctrl from '../controllers/settings.js';

// ── Schemas ──────────────────────────────────────────────────────────────────

const serverParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' } },
} as const;

const settingKeyParams = {
  type: 'object',
  required: ['id', 'key'],
  properties: {
    id:  { type: 'string' },
    key: { type: 'string' },
  },
} as const;

const settingKeyBody = {
  type: 'object',
  required: ['value'],
  properties: { value: {} }, // any JSON value
} as const;

// ── Routes ───────────────────────────────────────────────────────────────────

const settingsRoutes: FastifyPluginAsync = async (app) => {

  // Returns the full serversettings.json as a parsed JSON object.
  app.route({
    method:  'GET',
    url:     '/servers/:id/settings',
    schema:  { params: serverParams },
    handler: ctrl.getSettings,
  });

  // Replaces the entire serversettings.json. The game hot-reloads this file.
  app.route({
    method:  'PUT',
    url:     '/servers/:id/settings',
    schema:  { params: serverParams },
    handler: ctrl.replaceSettings,
  });

  // Updates a single key in serversettings.json (read-modify-write).
  app.route({
    method:  'PUT',
    url:     '/servers/:id/settings/:key',
    schema:  { params: settingKeyParams, body: settingKeyBody },
    handler: ctrl.updateSettingKey,
  });
};

export default settingsRoutes;
