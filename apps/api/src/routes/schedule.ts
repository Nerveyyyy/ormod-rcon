import type { FastifyPluginAsync } from 'fastify';
import cron from 'node-cron';
import { CronExpressionParser } from 'cron-parser';
import prisma from '../db/prisma-client.js';
import { WipeService } from '../services/wipe-service.js';
import { dockerManager } from '../services/docker-manager.js';
import { getAdapter } from '../services/rcon-adapter.js';
import type { TaskType } from '../types.js';

const cronJobs = new Map<string, cron.ScheduledTask>();

function computeNextRun(cronExpr: string): Date | null {
  try {
    return CronExpressionParser.parse(cronExpr).next().toDate();
  } catch {
    return null;
  }
}

type TaskRow = {
  id: string;
  serverId: string;
  type: string;
  cronExpr: string;
  label: string;
  payload: string;
  enabled: boolean;
  lastRun: Date | null;
  nextRun: Date | null;
  createdAt: Date;
};

async function runTask(task: TaskRow): Promise<void> {
  const server = await prisma.server.findUnique({ where: { id: task.serverId } });
  if (!server) return;

  try {
    switch (task.type as TaskType) {
      case 'WIPE': {
        const config = JSON.parse(task.payload);
        await new WipeService().executeWipe(task.serverId, config, 'scheduler');
        break;
      }
      case 'COMMAND': {
        const adapter = await getAdapter(server);
        await adapter.sendCommand(task.payload);
        break;
      }
      case 'ANNOUNCEMENT': {
        const adapter = await getAdapter(server);
        await adapter.sendCommand(`announcement ${task.payload}`);
        break;
      }
      case 'RESTART': {
        await dockerManager.restart(task.serverId);
        break;
      }
    }
  } catch (err) {
    console.error(`[scheduler] Task "${task.label}" failed:`, err);
  }

  await prisma.scheduledTask.update({
    where: { id: task.id },
    data: { lastRun: new Date(), nextRun: computeNextRun(task.cronExpr) },
  });
}

export function registerCronJob(task: TaskRow): void {
  if (!cron.validate(task.cronExpr)) {
    console.warn(`[scheduler] Invalid cron expression for task "${task.label}": ${task.cronExpr}`);
    return;
  }
  const job = cron.schedule(task.cronExpr, () => { runTask(task); });
  cronJobs.set(task.id, job);
}

function unregisterCronJob(taskId: string): void {
  const job = cronJobs.get(taskId);
  if (job) { job.stop(); cronJobs.delete(taskId); }
}

export const scheduleRoutes: FastifyPluginAsync = async (app) => {

  // GET /api/servers/:id/schedules
  app.get<{ Params: { id: string } }>('/servers/:id/schedules', async (req) => {
    return prisma.scheduledTask.findMany({
      where: { serverId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
  });

  // POST /api/servers/:id/schedules
  app.post<{ Params: { id: string }; Body: { type: string; cronExpr: string; label: string; payload: string; enabled?: boolean } }>('/servers/:id/schedules', async (req, reply) => {
    const { cronExpr } = req.body;
    if (!cron.validate(cronExpr)) {
      return reply.status(400).send({ error: `Invalid cron expression: ${cronExpr}` });
    }
    const task = await prisma.scheduledTask.create({
      data: {
        ...req.body,
        serverId: req.params.id,
        nextRun: computeNextRun(cronExpr),
      },
    });
    if (task.enabled) registerCronJob(task);
    reply.status(201);
    return task;
  });

  // PUT /api/servers/:id/schedules/:taskId
  app.put<{ Params: { id: string; taskId: string }; Body: Partial<{ type: string; cronExpr: string; label: string; payload: string; enabled: boolean }> }>('/servers/:id/schedules/:taskId', async (req, reply) => {
    const existing = await prisma.scheduledTask.findUnique({ where: { id: req.params.taskId } });
    if (!existing) return reply.status(404).send({ error: 'Task not found' });

    unregisterCronJob(req.params.taskId);

    const cronExpr = req.body.cronExpr ?? existing.cronExpr;
    const task = await prisma.scheduledTask.update({
      where: { id: req.params.taskId },
      data: { ...req.body, nextRun: computeNextRun(cronExpr) },
    });
    if (task.enabled) registerCronJob(task);
    return task;
  });

  // DELETE /api/servers/:id/schedules/:taskId
  app.delete<{ Params: { id: string; taskId: string } }>('/servers/:id/schedules/:taskId', async (req, reply) => {
    const existing = await prisma.scheduledTask.findUnique({ where: { id: req.params.taskId } });
    if (!existing) return reply.status(404).send({ error: 'Task not found' });
    unregisterCronJob(req.params.taskId);
    await prisma.scheduledTask.delete({ where: { id: req.params.taskId } });
    return { ok: true };
  });

  // POST /api/servers/:id/schedules/:taskId/run  (manual trigger)
  app.post<{ Params: { id: string; taskId: string } }>('/servers/:id/schedules/:taskId/run', async (req, reply) => {
    const task = await prisma.scheduledTask.findUnique({ where: { id: req.params.taskId } });
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    await runTask(task);
    return { ok: true };
  });
};
