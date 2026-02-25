import type { FastifyPluginAsync } from 'fastify';
import { requireWrite } from '../plugins/auth.js';
import * as ctrl from '../controllers/access-lists.js';

// ── Schemas ──────────────────────────────────────────────────────────────────

const listParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' } },
} as const;

const listBody = {
  type: 'object',
  required: ['name', 'type'],
  properties: {
    name:        { type: 'string', minLength: 1 },
    type:        { type: 'string', enum: ['BAN', 'WHITELIST', 'ADMIN'] },
    scope:       { type: 'string', enum: ['GLOBAL', 'SERVER', 'EXTERNAL'] },
    description: { type: 'string' },
    externalUrl: { type: 'string' },
  },
} as const;

const entryParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' } },
} as const;

const entryBody = {
  type: 'object',
  required: ['steamId'],
  properties: {
    steamId:    { type: 'string', pattern: '^\\d{17}$' },
    playerName: { type: 'string' },
    reason:     { type: 'string' },
    addedBy:    { type: 'string' },
    permission: { type: 'string' },
    expiresAt:  { type: 'string', format: 'date-time' },
  },
} as const;

const entryDeleteParams = {
  type: 'object',
  required: ['id', 'steamId'],
  properties: {
    id:      { type: 'string' },
    steamId: { type: 'string' },
  },
} as const;

const syncParams = {
  type: 'object',
  required: ['id', 'serverId'],
  properties: {
    id:       { type: 'string' },
    serverId: { type: 'string' },
  },
} as const;

const serverParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' } },
} as const;

const assignmentsBody = {
  type: 'object',
  required: ['listIds'],
  properties: {
    listIds: { type: 'array', items: { type: 'string' } },
  },
} as const;

// ── Routes ───────────────────────────────────────────────────────────────────

const accessListsRoutes: FastifyPluginAsync = async (app) => {

  // ── List CRUD ──────────────────────────────────────────────────────────────

  // Read — any authenticated user
  app.route({
    method:  'GET',
    url:     '/lists',
    handler: ctrl.listAccessLists,
  });

  // Create — ADMIN+
  app.route({
    method:     'POST',
    url:        '/lists',
    schema:     { body: listBody },
    preHandler: [requireWrite],
    handler:    ctrl.createAccessList,
  });

  // Read — any authenticated user
  app.route({
    method:  'GET',
    url:     '/lists/:id',
    schema:  { params: listParams },
    handler: ctrl.getAccessList,
  });

  // Update — ADMIN+
  app.route({
    method:     'PUT',
    url:        '/lists/:id',
    schema:     { params: listParams },
    preHandler: [requireWrite],
    handler:    ctrl.updateAccessList,
  });

  // Delete — ADMIN+
  app.route({
    method:     'DELETE',
    url:        '/lists/:id',
    schema:     { params: listParams },
    preHandler: [requireWrite],
    handler:    ctrl.deleteAccessList,
  });

  // ── Entries ────────────────────────────────────────────────────────────────

  // Add entry — ADMIN+
  app.route({
    method:     'POST',
    url:        '/lists/:id/entries',
    schema:     { params: entryParams, body: entryBody },
    preHandler: [requireWrite],
    handler:    ctrl.upsertEntry,
  });

  // Remove entry — ADMIN+
  app.route({
    method:     'DELETE',
    url:        '/lists/:id/entries/:steamId',
    schema:     { params: entryDeleteParams },
    preHandler: [requireWrite],
    handler:    ctrl.deleteEntry,
  });

  // ── Sync ───────────────────────────────────────────────────────────────────

  // Sync to server — ADMIN+
  app.route({
    method:     'POST',
    url:        '/lists/:id/sync/:serverId',
    schema:     { params: syncParams },
    preHandler: [requireWrite],
    handler:    ctrl.syncListToSingleServer,
  });

  // Sync all — ADMIN+
  app.route({
    method:     'POST',
    url:        '/lists/sync-all',
    preHandler: [requireWrite],
    handler:    ctrl.syncAll,
  });

  // ── External URL refresh ───────────────────────────────────────────────────

  // Refresh external feed — ADMIN+
  app.route({
    method:     'POST',
    url:        '/lists/:id/refresh',
    schema:     { params: listParams },
    preHandler: [requireWrite],
    handler:    ctrl.refreshExternal,
  });

  // ── Server-list assignments ────────────────────────────────────────────────

  // Read — any authenticated user
  app.route({
    method:  'GET',
    url:     '/servers/:id/list-assignments',
    schema:  { params: serverParams },
    handler: ctrl.getAssignments,
  });

  // Set assignments — ADMIN+
  app.route({
    method:     'PUT',
    url:        '/servers/:id/list-assignments',
    schema:     { params: serverParams, body: assignmentsBody },
    preHandler: [requireWrite],
    handler:    ctrl.setAssignments,
  });
};

export default accessListsRoutes;
