import type { FastifyPluginAsync } from 'fastify';
import * as ctrl from '../controllers/servers.js';

// ── Schemas ──────────────────────────────────────────────────────────────────

const serverParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' } },
} as const;

const serverBody = {
  type: 'object',
  required: ['name', 'serverName', 'savePath'],
  properties: {
    name:           { type: 'string' },
    serverName:     { type: 'string' },
    savePath:       { type: 'string' },
    containerName:  { type: 'string', nullable: true },
    executablePath: { type: 'string' },
    gamePort:       { type: 'number' },
    queryPort:      { type: 'number' },
    notes:          { type: 'string' },
  },
} as const;

// ── Routes ───────────────────────────────────────────────────────────────────

const serversRoutes: FastifyPluginAsync = async (app) => {

  app.route({
    method:  'GET',
    url:     '/servers',
    handler: ctrl.listServers,
  });

  app.route({
    method:  'POST',
    url:     '/servers',
    schema:  { body: serverBody },
    handler: ctrl.createServer,
  });

  app.route({
    method:  'GET',
    url:     '/servers/:id',
    schema:  { params: serverParams },
    handler: ctrl.getServer,
  });

  app.route({
    method:  'PUT',
    url:     '/servers/:id',
    schema:  { params: serverParams },
    handler: ctrl.updateServer,
  });

  app.route({
    method:  'DELETE',
    url:     '/servers/:id',
    schema:  { params: serverParams },
    handler: ctrl.deleteServer,
  });

  app.route({
    method:  'POST',
    url:     '/servers/:id/start',
    schema:  { params: serverParams },
    handler: ctrl.startServer,
  });

  app.route({
    method:  'POST',
    url:     '/servers/:id/stop',
    schema:  { params: serverParams },
    handler: ctrl.stopServer,
  });

  app.route({
    method:  'POST',
    url:     '/servers/:id/restart',
    schema:  { params: serverParams },
    handler: ctrl.restartServer,
  });
};

export default serversRoutes;
