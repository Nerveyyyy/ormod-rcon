import type { FastifyPluginAsync } from 'fastify'
import { requireOwner } from '../plugins/auth.js'
import * as ctrl from '../controllers/schedule.js'

// Re-export for server.ts startup cron restoration
export { registerCronJob } from '../controllers/schedule.js'

// ── Schemas ──────────────────────────────────────────────────────────────────

const serverParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' } },
} as const

const taskParams = {
  type: 'object',
  required: ['id', 'taskId'],
  properties: {
    id: { type: 'string' },
    taskId: { type: 'string' },
  },
} as const

const scheduleBody = {
  type: 'object',
  required: ['type', 'cronExpr', 'label', 'payload'],
  properties: {
    type: { type: 'string', enum: ['WIPE', 'COMMAND', 'ANNOUNCEMENT', 'RESTART'] },
    cronExpr: { type: 'string', minLength: 9 }, // shortest valid cron: "* * * * *"
    label: { type: 'string', minLength: 1 },
    payload: { type: 'string' },
    enabled: { type: 'boolean' },
  },
} as const

const scheduleUpdateBody = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['WIPE', 'COMMAND', 'ANNOUNCEMENT', 'RESTART'] },
    cronExpr: { type: 'string', minLength: 9 },
    label: { type: 'string', minLength: 1 },
    payload: { type: 'string' },
    enabled: { type: 'boolean' },
  },
} as const

// ── Routes ───────────────────────────────────────────────────────────────────

const scheduleRoutes: FastifyPluginAsync = async (app) => {
  // Read — any authenticated user
  app.route({
    method: 'GET',
    url: '/servers/:id/schedules',
    schema: { params: serverParams },
    handler: ctrl.listSchedules,
  })

  // Create — OWNER only
  app.route({
    method: 'POST',
    url: '/servers/:id/schedules',
    schema: { params: serverParams, body: scheduleBody },
    preHandler: [requireOwner],
    handler: ctrl.createSchedule,
  })

  // Update — OWNER only
  app.route({
    method: 'PUT',
    url: '/servers/:id/schedules/:taskId',
    schema: { params: taskParams, body: scheduleUpdateBody },
    preHandler: [requireOwner],
    handler: ctrl.updateSchedule,
  })

  // Delete — OWNER only
  app.route({
    method: 'DELETE',
    url: '/servers/:id/schedules/:taskId',
    schema: { params: taskParams },
    preHandler: [requireOwner],
    handler: ctrl.deleteSchedule,
  })

  // Manual trigger — OWNER only
  app.route({
    method: 'POST',
    url: '/servers/:id/schedules/:taskId/run',
    schema: { params: taskParams },
    preHandler: [requireOwner],
    handler: ctrl.runScheduleNow,
  })
}

export default scheduleRoutes
