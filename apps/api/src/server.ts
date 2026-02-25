/**
 * server.ts — Thin entry point.
 *
 * Builds the Fastify app, starts the listener, and runs post-startup
 * tasks (Docker reconnect, cron job restoration).
 */

import buildApp from './app.js';
import { dockerManager } from './services/docker-manager.js';
import prisma from './db/prisma-client.js';
import { registerCronJob } from './routes/schedule.js';

const app = await buildApp();

try {
  await app.listen({ port: app.config.PORT, host: '0.0.0.0' });

  await dockerManager.reconnect();
  app.log.info('Docker manager reconnected to running containers');

  const tasks = await prisma.scheduledTask.findMany({ where: { enabled: true } });
  for (const task of tasks) {
    registerCronJob(task);
  }
  app.log.info(`Restored ${tasks.length} scheduled task(s) from DB`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
