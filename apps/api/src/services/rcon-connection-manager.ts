/**
 * rcon-connection-manager.ts
 *
 * Manages RCON WebSocket connection lifecycle for all servers.
 *
 * Each server with mode === 'RCON' gets one WebSocketRconAdapter instance.
 * On startup, reconnectAll() loads all RCON-enabled servers from the DB and
 * connects them. Individual connect/disconnect calls handle runtime changes
 * (server added, edited, or removed via the dashboard).
 *
 * NOTE: WebSocketRconAdapter.connect() currently throws "not yet implemented".
 * RconConnectionManager.connect() catches and logs that error so startup is
 * non-fatal (degraded mode).
 */

import { WebSocketRconAdapter } from './rcon-adapter.js'
import { RconEventPersister } from './rcon-event-persister.js'
import prisma from '../db/prisma-client.js'

interface ManagedServer {
  id: string
  rconPort: number
  rconPass: string
  serverName: string
}

export class RconConnectionManager {
  private adapters = new Map<string, WebSocketRconAdapter>()
  private persisters = new Map<string, RconEventPersister>()

  /** Connect (or reconnect) a single server. */
  async connect(server: ManagedServer): Promise<void> {
    // Tear down any existing connection first
    if (this.adapters.has(server.id)) {
      await this.disconnect(server.id)
    }

    const adapter = new WebSocketRconAdapter()
    const persister = new RconEventPersister(server.id)

    adapter.on('event', (event: unknown) => {
      persister.handleEvent(event as { name: string; data: Record<string, unknown> }).catch(err => {
        console.error(`[RCON] Event persist error for ${server.serverName}:`, err)
      })
    })

    this.adapters.set(server.id, adapter)
    this.persisters.set(server.id, persister)

    // Connect — host is localhost because RCON runs on the same machine
    await adapter.connect('127.0.0.1', server.rconPort, server.rconPass)
  }

  /** Disconnect and remove a single server's adapter. */
  async disconnect(serverId: string): Promise<void> {
    const adapter = this.adapters.get(serverId)
    if (adapter) {
      adapter.disconnect()
      this.adapters.delete(serverId)
      this.persisters.delete(serverId)
    }
  }

  /** Return the live adapter for a server, or undefined if not connected. */
  getAdapter(serverId: string): WebSocketRconAdapter | undefined {
    return this.adapters.get(serverId)
  }

  /**
   * Connect all servers that have mode === 'RCON' and valid rconPort/rconPass.
   * Called once after the API listener starts. Errors per-server are caught and
   * logged so a single bad server cannot block the others.
   */
  async reconnectAll(): Promise<void> {
    const servers = await prisma.server.findMany({
      where: {
        mode: 'RCON',
        rconPort: { not: null },
        rconPass: { not: null },
      },
    })

    for (const server of servers) {
      if (server.rconPort == null || server.rconPass == null) continue
      try {
        await this.connect({
          id: server.id,
          rconPort: server.rconPort,
          rconPass: server.rconPass,
          serverName: server.serverName,
        })
      } catch (err) {
        // Degraded mode — log and continue; dashboard still works via Docker exec
        console.error(`[RCON] Failed to connect to ${server.serverName}:`, err)
      }
    }
  }

  /** Disconnect all managed servers. Called on Fastify onClose. */
  async disconnectAll(): Promise<void> {
    for (const serverId of [...this.adapters.keys()]) {
      await this.disconnect(serverId)
    }
  }
}

// Singleton — survives dual ESM module evaluation under Vitest + @fastify/autoload.
// Same pattern as docker-manager.ts (see CLAUDE.md Known Gotchas).
const GLOBAL_KEY = '__ormod_rcon_connection_manager__' as const
export const rconConnectionManager: RconConnectionManager =
  ((globalThis as Record<string, unknown>)[GLOBAL_KEY] ??= new RconConnectionManager()) as RconConnectionManager
