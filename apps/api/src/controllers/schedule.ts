import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import cron from 'node-cron'
import { CronExpressionParser } from 'cron-parser'
import prisma from '../db/prisma-client.js'
import { dockerManager } from '../services/docker-manager.js'
import { getAdapter } from '../services/rcon-adapter.js'
import { generateSlug, uniqueSlug } from '../lib/slug.js'
type TaskType = 'COMMAND' | 'RESTART'

// ── Cron internals ───────────────────────────────────────────────────────────

const cronJobs = new Map<string, cron.ScheduledTask>()

// Module-level logger reference — set by the route plugin once the Fastify
// instance is available.  Falls back to console so startup restores (before
// the plugin initialises) still produce output.
let _app: FastifyInstance | null = null

/** Inject the Fastify instance so the scheduler can use its Pino logger. */
export function setSchedulerApp(app: FastifyInstance): void {
  _app = app
}

function logError(err: unknown, msg: string): void {
  if (_app) {
    _app.log.error(err, msg)
  } else {
    console.error(msg, err)
  }
}

function logWarn(msg: string): void {
  if (_app) {
    _app.log.warn(msg)
  } else {
    console.warn(msg)
  }
}

type TaskRow = {
  id: string
  serverId: string
  type: string
  cronExpr: string
  label: string
  slug: string
  payload: string
  enabled: boolean
  lastRun: Date | null
  nextRun: Date | null
  createdAt: Date
}

function computeNextRun(cronExpr: string): Date | null {
  try {
    return CronExpressionParser.parse(cronExpr).next().toDate()
  } catch {
    return null
  }
}

async function runTask(task: TaskRow, manualUserId?: string): Promise<void> {
  // AUDIT-21: re-fetch from DB to avoid stale-closure data
  const fresh = await prisma.scheduledTask.findUnique({ where: { id: task.id } })
  if (!fresh) {
    logWarn(`[scheduler] Scheduled task ${task.id} not found — skipping`)
    return
  }

  const server = await prisma.server.findUnique({ where: { id: fresh.serverId } })
  if (!server) return

  // Skip execution when the container is not running — avoids queuing commands
  // against a stopped or unreachable container.
  const containerName =
    server.containerName?.trim() || process.env.GAME_CONTAINER_NAME || 'ormod-server'
  const containerInfo = await dockerManager.inspect(containerName)
  if (!containerInfo?.running) {
    logWarn(`[scheduler] Task "${fresh.label}" skipped — server "${server.name}" is offline`)
    await prisma.scheduledTask.update({
      where: { id: fresh.id },
      data: { lastRun: new Date(), nextRun: computeNextRun(fresh.cronExpr) },
    })
    return
  }

  let success = true
  let errorMsg: string | undefined
  try {
    switch (fresh.type as TaskType) {
      case 'COMMAND': {
        const adapter = await getAdapter(server)
        await adapter.sendCommand(fresh.payload)
        break
      }
      case 'RESTART': {
        await dockerManager.restart(fresh.serverId)
        break
      }
    }
  } catch (err) {
    success = false
    errorMsg = err instanceof Error ? err.message : String(err)
    // AUDIT-95: use Pino logger instead of console.error
    logError(err, `[scheduler] Task "${fresh.label}" failed`)
  }

  await prisma.scheduledTask.update({
    where: { id: fresh.id },
    data: { lastRun: new Date(), nextRun: computeNextRun(fresh.cronExpr) },
  })

  // Log to activity feed
  const source = manualUserId ? 'dashboard' : 'schedule'
  const performedBy = manualUserId ?? 'schedule'
  await prisma.actionLog.create({
    data: {
      serverId: server.id,
      performedBy,
      userId: manualUserId ?? null,
      action: 'SCHEDULE_RUN',
      source,
      details: JSON.stringify({
        schedule: fresh.label,
        type: fresh.type,
        payload: fresh.payload,
        success,
        ...(errorMsg ? { error: errorMsg } : {}),
        manual: !!manualUserId,
      }),
    },
  })
}

/** Register a cron job for a task. Exported for use by server.ts on startup. */
export function registerCronJob(task: TaskRow): void {
  if (!cron.validate(task.cronExpr)) {
    // AUDIT-95: use Pino logger instead of console.warn
    logWarn(`[scheduler] Invalid cron expression for task "${task.label}": ${task.cronExpr}`)
    return
  }
  // AUDIT-5: wrap callback in async with error handling so the promise is not floating
  const job = cron.schedule(task.cronExpr, async () => {
    try {
      await runTask(task)
    } catch (e) {
      logError(e, 'Scheduled task failed')
    }
  })
  cronJobs.set(task.id, job)
}

export function unregisterCronJob(taskId: string): void {
  const job = cronJobs.get(taskId)
  if (job) {
    job.stop()
    cronJobs.delete(taskId)
  }
}

// ── Route handlers ───────────────────────────────────────────────────────────

export async function listSchedules(
  req: FastifyRequest<{ Params: { serverName: string } }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })
  return prisma.scheduledTask.findMany({
    where: { serverId: server.id },
    orderBy: { createdAt: 'asc' },
  })
}

export async function createSchedule(
  req: FastifyRequest<{
    Params: { serverName: string }
    Body: { type: string; cronExpr: string; label: string; payload: string; enabled?: boolean }
  }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })

  const { cronExpr, label } = req.body
  if (!cron.validate(cronExpr)) {
    return reply.status(400).send({ error: `Invalid cron expression: ${cronExpr}` })
  }

  const slug = await uniqueSlug(label, async (s) => {
    const existing = await prisma.scheduledTask.findUnique({ where: { slug: s } })
    return !!existing
  })

  const task = await prisma.scheduledTask.create({
    data: {
      ...req.body,
      slug,
      serverId: server.id,
      nextRun: computeNextRun(cronExpr),
    },
  })
  if (task.enabled) registerCronJob(task)

  await prisma.actionLog.create({
    data: {
      serverId: server.id,
      performedBy: req.session!.user.id,
      userId: req.session!.user.id,
      action: 'SCHEDULE_CREATE',
      details: JSON.stringify({ label: task.label, type: task.type, cronExpr: task.cronExpr }),
    },
  })

  reply.status(201)
  return task
}

export async function updateSchedule(
  req: FastifyRequest<{
    Params: { serverName: string; slug: string }
    Body: Partial<{
      type: string
      cronExpr: string
      label: string
      payload: string
      enabled: boolean
    }>
  }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })

  const existing = await prisma.scheduledTask.findFirst({
    where: { slug: req.params.slug, serverId: server.id },
  })
  if (!existing) return reply.status(404).send({ error: 'Task not found' })

  // AUDIT-61: update DB first, then touch cron registry.
  // If the DB update throws, the old cron job continues correctly.
  const cronExpr = req.body.cronExpr ?? existing.cronExpr
  const task = await prisma.scheduledTask.update({
    where: { id: existing.id },
    data: { ...req.body, nextRun: computeNextRun(cronExpr) },
  })

  unregisterCronJob(existing.id)
  if (task.enabled) registerCronJob(task)

  // Determine what changed for a meaningful activity message
  let change = 'updated'
  if (req.body.enabled !== undefined && req.body.enabled !== existing.enabled) {
    change = req.body.enabled ? 'enabled' : 'paused'
  }
  await prisma.actionLog.create({
    data: {
      serverId: server.id,
      performedBy: req.session!.user.id,
      userId: req.session!.user.id,
      action: 'SCHEDULE_UPDATE',
      details: JSON.stringify({ label: task.label, change }),
    },
  })

  return task
}

export async function deleteSchedule(
  req: FastifyRequest<{ Params: { serverName: string; slug: string } }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })

  const existing = await prisma.scheduledTask.findFirst({
    where: { slug: req.params.slug, serverId: server.id },
  })
  if (!existing) return reply.status(404).send({ error: 'Task not found' })
  unregisterCronJob(existing.id)
  await prisma.scheduledTask.delete({ where: { id: existing.id } })

  await prisma.actionLog.create({
    data: {
      serverId: server.id,
      performedBy: req.session!.user.id,
      userId: req.session!.user.id,
      action: 'SCHEDULE_DELETE',
      details: JSON.stringify({ label: existing.label }),
    },
  })

  return { ok: true }
}

export async function runScheduleNow(
  req: FastifyRequest<{ Params: { serverName: string; slug: string } }>,
  reply: FastifyReply
) {
  const server = await prisma.server.findUnique({ where: { serverName: req.params.serverName } })
  if (!server) return reply.status(404).send({ error: 'Server not found' })

  const task = await prisma.scheduledTask.findFirst({
    where: { slug: req.params.slug, serverId: server.id },
  })
  if (!task) return reply.status(404).send({ error: 'Task not found' })
  await runTask(task, req.session!.user.id)
  return { ok: true }
}
