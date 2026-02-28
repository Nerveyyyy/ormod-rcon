import type { FastifyPluginAsync } from 'fastify';
import { requireOwner } from '../plugins/auth.js';
import * as ctrl from '../controllers/users.js';

// ── Schemas ──────────────────────────────────────────────────────────────────

const userParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' } },
} as const;

const createUserBody = {
  type: 'object',
  required: ['name', 'email', 'password', 'role'],
  properties: {
    name:     { type: 'string', minLength: 1 },
    email:    { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8 },
    role:     { type: 'string', enum: ['ADMIN', 'VIEWER'] },
  },
} as const;

const updateRoleBody = {
  type: 'object',
  required: ['role'],
  properties: {
    role: { type: 'string', enum: ['OWNER', 'ADMIN', 'VIEWER'] },
  },
} as const;

const changePasswordBody = {
  type: 'object',
  required: ['currentPassword', 'newPassword'],
  properties: {
    currentPassword: { type: 'string', minLength: 1 },
    newPassword:     { type: 'string', minLength: 8 },
  },
} as const;

// ── Routes ───────────────────────────────────────────────────────────────────

const usersRoutes: FastifyPluginAsync = async (app) => {

  // List all users — OWNER only
  app.route({
    method:     'GET',
    url:        '/users',
    preHandler: [requireOwner],
    handler:    ctrl.listUsers,
  });

  // Create user — OWNER only
  app.route({
    method:     'POST',
    url:        '/users',
    schema:     { body: createUserBody },
    preHandler: [requireOwner],
    handler:    ctrl.createUser,
  });

  // Change user role — OWNER only
  app.route({
    method:     'PUT',
    url:        '/users/:id/role',
    schema:     { params: userParams, body: updateRoleBody },
    preHandler: [requireOwner],
    handler:    ctrl.updateRole,
  });

  // Delete user — OWNER only
  app.route({
    method:     'DELETE',
    url:        '/users/:id',
    schema:     { params: userParams },
    preHandler: [requireOwner],
    handler:    ctrl.deleteUser,
  });

  // Get current user profile — any authenticated user
  app.route({
    method:  'GET',
    url:     '/users/me',
    handler: ctrl.getMe,
  });

  // Change own password — any authenticated user
  app.route({
    method:  'POST',
    url:     '/users/me/password',
    schema:  { body: changePasswordBody },
    handler: ctrl.changeOwnPassword,
  });
};

export default usersRoutes;
