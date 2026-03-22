import type { FastifyPluginAsync } from 'fastify'
import { requireOwner } from '../plugins/auth.js'
import * as ctrl from '../controllers/schedule.js'
import { serverParams } from './_schemas.js'

// Re-export for server.ts startup cron restoration
export { registerCronJob } from '../controllers/schedule.js'

// ── Schemas ──────────────────────────────────────────────────────────────────

const scheduleSlugParams = {
  type: 'object',
  required: ['serverName', 'slug'],
  properties: {
    serverName: { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9_.-]*$' },
    slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' },
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
    url: '/servers/:serverName/schedules',
    schema: { params: serverParams },
    handler: ctrl.listSchedules,
  })

  // Create — OWNER only
  app.route({
    method: 'POST',
    url: '/servers/:serverName/schedules',
    schema: { params: serverParams, body: scheduleBody },
    preHandler: [requireOwner],
    handler: ctrl.createSchedule,
  })

  // Update — OWNER only
  app.route({
    method: 'PUT',
    url: '/servers/:serverName/schedules/:slug',
    schema: { params: scheduleSlugParams, body: scheduleUpdateBody },
    preHandler: [requireOwner],
    handler: ctrl.updateSchedule,
  })

  // Delete — OWNER only
  app.route({
    method: 'DELETE',
    url: '/servers/:serverName/schedules/:slug',
    schema: { params: scheduleSlugParams },
    preHandler: [requireOwner],
    handler: ctrl.deleteSchedule,
  })

  // Manual trigger — OWNER only
  app.route({
    method: 'POST',
    url: '/servers/:serverName/schedules/:slug/run',
    schema: { params: scheduleSlugParams },
    preHandler: [requireOwner],
    handler: ctrl.runScheduleNow,
  })
}

export default scheduleRoutes
