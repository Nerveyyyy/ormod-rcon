import type { FastifyPluginAsync } from 'fastify'
import type { WebSocket } from '@fastify/websocket'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../lib/auth.js'
import { requireWrite, assertSessionRole } from '../plugins/auth.js'
import { dockerManager } from '../services/docker-manager.js'
import * as ctrl from '../controllers/console.js'
import type { SessionData } from '../config.js'
import prisma from '../db/prisma-client.js'

// ── Schemas ──────────────────────────────────────────────────────────────────

const serverParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' } },
} as const

const commandBody = {
  type: 'object',
  required: ['command'],
  properties: { command: { type: 'string', minLength: 1 } },
} as const

const logQuerystring = {
  type: 'object',
  properties: { lines: { type: 'string' } },
} as const

// ── HTTP routes — autoloaded under /api prefix ───────────────────────────────

const consoleRoutes: FastifyPluginAsync = async (app) => {
  // Send command — ADMIN+ (commands can have destructive effects)
  app.route({
    method: 'POST',
    url: '/servers/:id/console/command',
    schema: { params: serverParams, body: commandBody },
    preHandler: [requireWrite],
    handler: ctrl.sendCommand,
  })

  app.route({
    method: 'GET',
    url: '/servers/:id/console/log',
    schema: { params: serverParams, querystring: logQuerystring },
    preHandler: [requireWrite],
    handler: ctrl.getConsoleLog,
  })
}

export default consoleRoutes

// ── WebSocket route — registered manually in app.ts (no /api prefix) ─────────

export const consoleWsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { serverId: string } }>(
    '/ws/log/:serverId',
    { websocket: true },
    async (socket: WebSocket, req) => {
      // AUDIT-37: Validate Origin header before any processing
      const origin = req.headers.origin
      const allowedOrigins = app.config.PUBLIC_URL
        ? [app.config.PUBLIC_URL]
        : [`http://localhost:${app.config.PORT}`]
      if (origin && !allowedOrigins.some((o) => origin.startsWith(o))) {
        socket.close(1008, 'Invalid origin')
        return
      }

      // WebSocket upgrades bypass Fastify preHandler hooks, so we
      // validate the session explicitly using the request cookies.
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      })
      if (!session?.user) {
        socket.close(1008, 'Unauthorized')
        return
      }

      // AUDIT-84: Runtime role validation
      const typedSession = session as SessionData
      try {
        assertSessionRole(typedSession)
      } catch {
        socket.close(1008, 'Invalid role')
        return
      }

      // Console logs may expose sensitive data; restrict to ADMIN and OWNER.
      const role = typedSession.user.role
      if (!['OWNER', 'ADMIN'].includes(role)) {
        socket.close(1008, 'Forbidden')
        return
      }

      const { serverId } = req.params

      // AUDIT-15: Validate serverId exists in database before accessing buffers
      const server = await prisma.server.findUnique({ where: { id: serverId } })
      if (!server) {
        socket.close(1008, 'Server not found')
        return
      }

      const send = (line: string) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ line }))
        }
      }

      // AUDIT-36: Periodic session re-validation heartbeat (every 60s)
      const heartbeat = setInterval(async () => {
        try {
          const fresh = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
          })
          if (!fresh?.user?.id) {
            socket.close(1008, 'Session expired')
          }
        } catch {
          socket.close(1008, 'Session validation failed')
        }
      }, 60_000)

      // Replay buffered output so the client sees history instantly
      const buffer = dockerManager.getOutputBuffer(serverId)
      for (const line of buffer) send(line)

      // Subscribe to live output
      const emitter = dockerManager.getOutputEmitter(serverId)
      if (!emitter) {
        send('# Server is not running. Start it from the Servers page.')
        clearInterval(heartbeat)
        return
      }

      const lineHandler = (line: string) => send(line)
      const exitHandler = () => send('# Server process has stopped.')

      emitter.on('line', lineHandler)
      emitter.on('exit', exitHandler)

      socket.on('close', () => {
        clearInterval(heartbeat)
        emitter.off('line', lineHandler)
        emitter.off('exit', exitHandler)
      })
    }
  )
}
