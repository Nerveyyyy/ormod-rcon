import type { FastifyPluginAsync } from 'fastify'
import { requireOwner } from '../plugins/auth.js'
import * as ctrl from '../controllers/schedule.js'
import { serverParams as sharedServerParams } from './_schemas.js'

// Re-export for server.ts startup cron restoration
export { registerCronJob } from '../controllers/schedule.js'

// ── Schemas ──────────────────────────────────────────────────────────────────

// AUDIT-96: use shared serverParams from _schemas.ts
const serverParams = sharedServerParams

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
    type: { type: 'string', enum: ['COMMAND', 'RESTART'] },
    // AUDIT-68: limit cronExpr and other string fields
    cronExpr: { type: 'string', minLength: 9, maxLength: 100 }, // shortest valid cron: "* * * * *"
    label: { type: 'string', minLength: 1, maxLength: 255 },
    payload: { type: 'string', maxLength: 4096 },
    enabled: { type: 'boolean' },
  },
} as const

const scheduleUpdateBody = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['COMMAND', 'RESTART'] },
    // AUDIT-68: limit cronExpr and other string fields
    cronExpr: { type: 'string', minLength: 9, maxLength: 100 },
    label: { type: 'string', minLength: 1, maxLength: 255 },
    payload: { type: 'string', maxLength: 4096 },
    enabled: { type: 'boolean' },
  },
} as const

// ── Routes ───────────────────────────────────────────────────────────────────

const scheduleRoutes: FastifyPluginAsync = async (app) => {
  // AUDIT-95: inject the Fastify app into the schedule controller so it can use
  // the Pino logger instead of falling back to console.
  ctrl.setSchedulerApp(app)

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
