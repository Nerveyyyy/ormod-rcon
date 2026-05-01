import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import underPressure from '@fastify/under-pressure'

/**
 * Auto-503 the server when it can't keep up. Thresholds target a small
 * self-hosted VDS: 500 MB heap and 1 GB RSS catch runaway-memory
 * problems before the host starts swapping. Event-loop delay and
 * utilisation fire on CPU saturation the memory metrics would miss.
 * Self-hosters on heavier hardware can bump these by editing this file.
 */
const underPressurePlugin: FastifyPluginAsync = async (app) => {
  await app.register(underPressure, {
    maxEventLoopDelay: 1_000,
    maxEventLoopUtilization: 0.98,
    maxHeapUsedBytes: 500 * 1024 * 1024,
    maxRssBytes: 1_000_000_000,
    retryAfter: 10,
    message: 'Server under pressure — try again shortly',
    exposeStatusRoute: false,
  })
}

export default fp(underPressurePlugin, { name: 'under-pressure' })
