/**
 * capabilities controller
 *
 * Derives which dashboard features are available based on the server's
 * environment configuration.  Exposed via GET /api/capabilities so the
 * frontend can hide or disable features that aren't supported.
 *
 * Deployment modes:
 *
 *   FULL_CONTROL (default, Docker compose)
 *     dockerControl: true  — can start/stop/restart containers, stream logs,
 *                            exec commands via Docker attach
 *     fileAccess:    true  — can read/write save files, wipe, backup
 *
 *   RCON_ONLY (future, when game ships RCON)
 *     dockerControl: false — no Docker socket access
 *     fileAccess:    false — no shared save volume
 *     rconAvailable: true  — RCON commands + responses
 */

import type { FastifyInstance } from 'fastify'

export type Capabilities = {
  dockerControl: boolean
  fileAccess: boolean
  rconAvailable: boolean
  authEnabled: boolean
  mode: 'FULL_CONTROL' | 'RCON_ONLY' | 'PARTIAL'
}

export async function listCapabilities(config: FastifyInstance['config']): Promise<Capabilities> {
  // DOCKER_CONTROL_ENABLED is a boolean env var (validated by @fastify/env schema)
  const dockerControl = config.DOCKER_CONTROL_ENABLED
  const fileAccess = Boolean(config.SAVE_BASE_PATH || config.SAVES_PATH || config.BACKUP_PATH)
  // RCON is not yet implemented in the game (Playtest 1.9.0).
  // Flip this to true and implement WebSocketRconAdapter when the game adds RCON.
  const rconAvailable = false
  const authEnabled = true // BetterAuth is always active

  let mode: Capabilities['mode'] = 'PARTIAL'
  if (dockerControl && fileAccess) mode = 'FULL_CONTROL'
  else if (!dockerControl && rconAvailable) mode = 'RCON_ONLY'

  return { dockerControl, fileAccess, rconAvailable, authEnabled, mode }
}
