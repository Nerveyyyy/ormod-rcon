import type { FastifyPluginAsync } from 'fastify';
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

  app.route({
    method:  'GET',
    url:     '/lists',
    handler: ctrl.listAccessLists,
  });

  app.route({
    method:  'POST',
    url:     '/lists',
    schema:  { body: listBody },
    handler: ctrl.createAccessList,
  });

  app.route({
    method:  'GET',
    url:     '/lists/:id',
    schema:  { params: listParams },
    handler: ctrl.getAccessList,
  });

  app.route({
    method:  'PUT',
    url:     '/lists/:id',
    schema:  { params: listParams },
    handler: ctrl.updateAccessList,
  });

  app.route({
    method:  'DELETE',
    url:     '/lists/:id',
    schema:  { params: listParams },
    handler: ctrl.deleteAccessList,
  });

  // ── Entries ────────────────────────────────────────────────────────────────

  app.route({
    method:  'POST',
    url:     '/lists/:id/entries',
    schema:  { params: entryParams, body: entryBody },
    handler: ctrl.upsertEntry,
  });

  app.route({
    method:  'DELETE',
    url:     '/lists/:id/entries/:steamId',
    schema:  { params: entryDeleteParams },
    handler: ctrl.deleteEntry,
  });

  // ── Sync ───────────────────────────────────────────────────────────────────

  app.route({
    method:  'POST',
    url:     '/lists/:id/sync/:serverId',
    schema:  { params: syncParams },
    handler: ctrl.syncListToSingleServer,
  });

  app.route({
    method:  'POST',
    url:     '/lists/sync-all',
    handler: ctrl.syncAll,
  });

  // ── External URL refresh ───────────────────────────────────────────────────

  app.route({
    method:  'POST',
    url:     '/lists/:id/refresh',
    schema:  { params: listParams },
    handler: ctrl.refreshExternal,
  });

  // ── Server-list assignments ────────────────────────────────────────────────

  app.route({
    method:  'GET',
    url:     '/servers/:id/list-assignments',
    schema:  { params: serverParams },
    handler: ctrl.getAssignments,
  });

  app.route({
    method:  'PUT',
    url:     '/servers/:id/list-assignments',
    schema:  { params: serverParams, body: assignmentsBody },
    handler: ctrl.setAssignments,
  });
};

export default accessListsRoutes;
