/**
 * rcon-adapter.ts
 *
 * Abstraction layer over command dispatch so routes never care whether
 * commands go via Docker exec (now) or WebSocket RCON (future).
 *
 * Current flow:
 *   route → getAdapter() → DockerExecAdapter → Docker exec → /proc/1/fd/0 → game stdin
 *
 * Future flow (when game adds RCON):
 *   route → getAdapter() → WebSocketRconAdapter → TCP binary RCON → game
 */

export interface RconAdapter {
  sendCommand(cmd: string): Promise<string>;
  isConnected(): boolean;
}

// ── Current: Docker exec → game stdin ─────────────────────────────────────
export class DockerExecAdapter implements RconAdapter {
  constructor(private serverId: string) {}

  async sendCommand(cmd: string): Promise<string> {
    // Lazy import avoids circular dependency chain
    const { dockerManager } = await import('./docker-manager.js');
    await dockerManager.sendCommand(this.serverId, cmd);
    return 'Command dispatched via docker exec';
  }

  isConnected(): boolean {
    return true; // connected as long as the container exists
  }
}

// ── Future: WebSocket RCON ─────────────────────────────────────────────────
// Implement when ORMOD: Directive adds WebSocket RCON support.
// Transport: net.Socket over TCP (binary protocol, similar to Facepunch webrcon)
export class WebSocketRconAdapter implements RconAdapter {
  private ws: WebSocket | null = null;

  async connect(_host: string, _port: number, _pass: string): Promise<void> {
    throw new Error('RCON WebSocket not yet implemented by game');
  }

  async sendCommand(_cmd: string): Promise<string> {
    throw new Error('RCON not yet implemented by game');
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// ── Factory ────────────────────────────────────────────────────────────────
// Returns the appropriate adapter. Routes always call getAdapter() —
// never interact with docker-manager or RCON sockets directly.
export async function getAdapter(
  server: { id: string; rconPort?: number | null; rconPass?: string | null }
): Promise<RconAdapter> {
  if (server.rconPort && server.rconPass) {
    // Future: instantiate WebSocketRconAdapter and connect here
    throw new Error('RCON WebSocket not yet implemented by game');
  }
  return new DockerExecAdapter(server.id);
}
