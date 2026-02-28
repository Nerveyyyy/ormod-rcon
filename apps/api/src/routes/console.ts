import type { FastifyPluginAsync } from 'fastify'
import type { WebSocket } from '@fastify/websocket'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../lib/auth.js'
import { requireWrite } from '../plugins/auth.js'
import { dockerManager } from '../services/docker-manager.js'
import * as ctrl from '../controllers/console.js'

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
      // WebSocket upgrades bypass Fastify preHandler hooks, so we
      // validate the session explicitly using the request cookies.
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      })
      if (!session?.user) {
        socket.close(1008, 'Unauthorized')
        return
      }
      // Console logs may expose sensitive data; restrict to ADMIN and OWNER.
      const role = (session.user as { role?: string }).role ?? ''
      if (!['OWNER', 'ADMIN'].includes(role)) {
        socket.close(1008, 'Forbidden')
        return
      }

      const { serverId } = req.params

      const send = (line: string) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ line }))
        }
      }

      // Replay buffered output so the client sees history instantly
      const buffer = dockerManager.getOutputBuffer(serverId)
      for (const line of buffer) send(line)

      // Subscribe to live output
      const emitter = dockerManager.getOutputEmitter(serverId)
      if (!emitter) {
        send('# Server is not running. Start it from the Servers page.')
        return
      }

      const lineHandler = (line: string) => send(line)
      const exitHandler = () => send('# Server process has stopped.')

      emitter.on('line', lineHandler)
      emitter.on('exit', exitHandler)

      socket.on('close', () => {
        emitter.off('line', lineHandler)
        emitter.off('exit', exitHandler)
      })
    }
  )
}
