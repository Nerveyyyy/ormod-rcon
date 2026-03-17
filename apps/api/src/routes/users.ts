import type { FastifyPluginAsync } from 'fastify'
import { requireOwner } from '../plugins/auth.js'
import * as ctrl from '../controllers/users.js'

// ── Schemas ──────────────────────────────────────────────────────────────────

const userParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' } },
} as const

const createUserBody = {
  type: 'object',
  required: ['name', 'email', 'password', 'role'],
  properties: {
    // AUDIT-68: add maxLength constraints
    name: { type: 'string', minLength: 1, maxLength: 255 },
    email: { type: 'string', format: 'email', maxLength: 255 },
    password: { type: 'string', minLength: 8, maxLength: 255 },
    role: { type: 'string', enum: ['ADMIN', 'VIEWER'] },
  },
} as const

const updateRoleBody = {
  type: 'object',
  required: ['role'],
  properties: {
    role: { type: 'string', enum: ['OWNER', 'ADMIN', 'VIEWER'] },
  },
} as const

const changePasswordBody = {
  type: 'object',
  required: ['currentPassword', 'newPassword'],
  properties: {
    currentPassword: { type: 'string', minLength: 1, maxLength: 255 },
    newPassword: { type: 'string', minLength: 8, maxLength: 255 },
  },
} as const

// AUDIT-39: reply schema for listUsers — omits password fields, additionalProperties: false
const userItem = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string' },
    role: { type: 'string' },
    createdAt: { type: 'string' },
  },
} as const

const listUsersReply = {
  200: {
    type: 'array',
    items: userItem,
  },
} as const

// ── Routes ───────────────────────────────────────────────────────────────────

const usersRoutes: FastifyPluginAsync = async (app) => {
  // List all users — OWNER only
  app.route({
    method: 'GET',
    url: '/users',
    schema: { response: listUsersReply },
    preHandler: [requireOwner],
    handler: ctrl.listUsers,
  })

  // Create user — OWNER only
  app.route({
    method: 'POST',
    url: '/users',
    schema: { body: createUserBody },
    preHandler: [requireOwner],
    handler: ctrl.createUser,
  })

  // Change user role — OWNER only
  app.route({
    method: 'PUT',
    url: '/users/:id/role',
    schema: { params: userParams, body: updateRoleBody },
    preHandler: [requireOwner],
    handler: ctrl.updateRole,
  })

  // Delete user — OWNER only
  app.route({
    method: 'DELETE',
    url: '/users/:id',
    schema: { params: userParams },
    preHandler: [requireOwner],
    handler: ctrl.deleteUser,
  })

  // Get current user profile — any authenticated user
  app.route({
    method: 'GET',
    url: '/users/me',
    handler: ctrl.getMe,
  })

  // Change own password — any authenticated user
  app.route({
    method: 'POST',
    url: '/users/me/password',
    schema: { body: changePasswordBody },
    handler: ctrl.changeOwnPassword,
  })
}

export default usersRoutes
