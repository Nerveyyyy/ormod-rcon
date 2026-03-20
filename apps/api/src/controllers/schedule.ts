import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import cron from 'node-cron'
import { CronExpressionParser } from 'cron-parser'
import prisma from '../db/prisma-client.js'
import { dockerManager } from '../services/docker-manager.js'
import { getAdapter } from '../services/rcon-adapter.js'
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

async function runTask(task: TaskRow): Promise<void> {
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
    // AUDIT-95: use Pino logger instead of console.error
    logError(err, `[scheduler] Task "${fresh.label}" failed`)
  }

  await prisma.scheduledTask.update({
    where: { id: fresh.id },
    data: { lastRun: new Date(), nextRun: computeNextRun(fresh.cronExpr) },
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

export async function listSchedules(req: FastifyRequest<{ Params: { id: string } }>) {
  return prisma.scheduledTask.findMany({
    where: { serverId: req.params.id },
    orderBy: { createdAt: 'asc' },
  })
}

export async function createSchedule(
  req: FastifyRequest<{
    Params: { id: string }
    Body: { type: string; cronExpr: string; label: string; payload: string; enabled?: boolean }
  }>,
  reply: FastifyReply
) {
  const { cronExpr } = req.body
  if (!cron.validate(cronExpr)) {
    return reply.status(400).send({ error: `Invalid cron expression: ${cronExpr}` })
  }
  const task = await prisma.scheduledTask.create({
    data: {
      ...req.body,
      serverId: req.params.id,
      nextRun: computeNextRun(cronExpr),
    },
  })
  if (task.enabled) registerCronJob(task)
  reply.status(201)
  return task
}

export async function updateSchedule(
  req: FastifyRequest<{
    Params: { id: string; taskId: string }
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
  const existing = await prisma.scheduledTask.findFirst({
    where: { id: req.params.taskId, serverId: req.params.id },
  })
  if (!existing) return reply.status(404).send({ error: 'Task not found' })

  // AUDIT-61: update DB first, then touch cron registry.
  // If the DB update throws, the old cron job continues correctly.
  const cronExpr = req.body.cronExpr ?? existing.cronExpr
  const task = await prisma.scheduledTask.update({
    where: { id: req.params.taskId },
    data: { ...req.body, nextRun: computeNextRun(cronExpr) },
  })

  unregisterCronJob(req.params.taskId)
  if (task.enabled) registerCronJob(task)
  return task
}

export async function deleteSchedule(
  req: FastifyRequest<{ Params: { id: string; taskId: string } }>,
  reply: FastifyReply
) {
  const existing = await prisma.scheduledTask.findFirst({
    where: { id: req.params.taskId, serverId: req.params.id },
  })
  if (!existing) return reply.status(404).send({ error: 'Task not found' })
  unregisterCronJob(req.params.taskId)
  await prisma.scheduledTask.delete({ where: { id: req.params.taskId } })
  return { ok: true }
}

export async function runScheduleNow(
  req: FastifyRequest<{ Params: { id: string; taskId: string } }>,
  reply: FastifyReply
) {
  const task = await prisma.scheduledTask.findFirst({
    where: { id: req.params.taskId, serverId: req.params.id },
  })
  if (!task) return reply.status(404).send({ error: 'Task not found' })
  await runTask(task)
  return { ok: true }
}
