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
 *   route → getAdapter() → WebSocketRconAdapter → WebSocket RCON → game
 */

import { EventEmitter } from 'node:events'
// Minimal WebSocket type — avoids ws/@types/ws dependency for skeleton code.
// Replace with `import { WebSocket } from 'ws'` when the game ships RCON.
interface WS { readyState: number; send(data: string): void; close(): void; on(event: string, listener: (...args: any[]) => void): void; removeAllListeners(): void }
type WSCtor = new (url: string) => WS
const WebSocket: WSCtor = ((globalThis as any).WebSocket ?? class { constructor() { throw new Error('WebSocket not available') } }) as WSCtor
import { dockerManager } from './docker-manager.js'

// ── Inline protocol types (mirrors rcon/schema.ts) ────────────────────────
// Kept in-sync with rcon/schema.ts. Do not add business logic here — these
// are pure structural types for the wire format.
// When rcon/schema.ts is brought into the apps/api compilation scope (e.g.
// via a project reference or a path re-export), remove these and restore the
// import from '../../../../rcon/schema.js'.

interface RconAuthMessage       { type: 'auth'; secret: string }
interface RconAuthOkMessage     { type: 'auth_ok'; serverTime: string; serverName: string; version: '1.0.0' }
interface RconAuthErrorMessage  { type: 'auth_error'; reason: string }
interface RconPingMessage       { type: 'ping' }
interface RconPongMessage       { type: 'pong'; serverTime: string }

interface RconCommandMessage {
  type: 'command'
  id: string
  command: Record<string, unknown>
}

interface RconResultOk<T = unknown>  { type: 'result'; id: string; success: true; data: T }
interface RconResultError            { type: 'result'; id: string; success: false; error: { code: string; message: string } }
type RconResult<T = unknown> = RconResultOk<T> | RconResultError

interface RconEventMessage { type: 'event'; timestamp: string; event: Record<string, unknown> }

type RconAnyMessage =
  | RconAuthMessage | RconAuthOkMessage | RconAuthErrorMessage
  | RconPingMessage | RconPongMessage
  | RconCommandMessage | RconResult
  | RconEventMessage

export interface RconAdapter {
  sendCommand(cmd: string): Promise<string>
  isConnected(): boolean
}

// ── Current: Docker exec → game stdin ─────────────────────────────────────
export class DockerExecAdapter implements RconAdapter {
  constructor(private serverId: string) {}

  async sendCommand(cmd: string): Promise<string> {
    return dockerManager.sendCommandAndCollect(this.serverId, cmd)
  }

  isConnected(): boolean {
    return true // connected as long as the container exists
  }
}

// ── Future: WebSocket RCON ─────────────────────────────────────────────────

type ConnectionState = 'disconnected' | 'connecting' | 'authenticating' | 'connected'

interface PendingRequest<T = unknown> {
  resolve: (value: T) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const COMMAND_TIMEOUT_MS = 30_000
const PING_INTERVAL_MS = 30_000
const MAX_RECONNECT_DELAY_MS = 60_000
const BASE_RECONNECT_DELAY_MS = 1_000

/**
 * WebSocket RCON adapter — implements the JSON-framed protocol defined in
 * rcon/schema.ts. Methods are fully typed; game-specific handling is marked
 * with TODO comments where the protocol spec requires runtime behaviour not
 * yet verifiable against a live server.
 *
 * State machine:
 *   disconnected ──connect()──> connecting ──WS open──> authenticating ──auth_ok──> connected
 *        ^                          |                        |                          |
 *        |                     WS error/close            auth_error                WS close
 *        └──────────────────────────┴────────────────────────┴──────────────────────────┘
 *                                            │
 *                                    scheduleReconnect()
 */
export class WebSocketRconAdapter implements RconAdapter {
  private state: ConnectionState = 'disconnected'
  private ws: WS | null = null

  // Keyed by numeric request ID; stores resolve/reject/timeout per in-flight command.
  private pendingRequests = new Map<number, PendingRequest>()
  private nextId = 1

  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null

  private emitter = new EventEmitter()

  // Connection parameters — stored for automatic reconnection.
  private host = ''
  private port = 0
  private pass = ''

  // ── Public: lifecycle ──────────────────────────────────────────────────────

  /**
   * Open the WebSocket connection and authenticate with the game server.
   * Resolves once `auth_ok` is received; rejects on `auth_error` or timeout.
   */
  connect(host: string, port: number, pass: string): Promise<void> {
    if (this.state !== 'disconnected') {
      return Promise.reject(new Error(`Cannot connect from state "${this.state}"`))
    }

    this.host = host
    this.port = port
    this.pass = pass
    this.state = 'connecting'

    return new Promise<void>((resolve, reject) => {
      const url = `ws://${host}:${port}`
      this.ws = new WebSocket(url)

      // One-shot auth handlers — removed once auth completes or fails.
      const onAuthOk = () => {
        this.reconnectAttempts = 0
        resolve()
      }
      const onAuthError = (reason: string) => {
        reject(new Error(`RCON authentication failed: ${reason}`))
      }

      this.emitter.once('_auth_ok', onAuthOk)
      this.emitter.once('_auth_error', onAuthError)

      this.ws.on('open', () => this.handleOpen())
      this.ws.on('message', (data) => this.handleMessage(data))
      this.ws.on('close', () => this.handleClose())
      this.ws.on('error', (err) => this.handleError(err))
    })
  }

  /**
   * Close the connection cleanly and stop any scheduled reconnection.
   * Does not trigger automatic reconnection.
   */
  disconnect(): void {
    // Signal that reconnection is not desired before cleanup alters state.
    this.reconnectAttempts = -1
    this.cleanup()
    this.state = 'disconnected'
    this.emitter.emit('disconnected')
  }

  // ── Public: RconAdapter interface ─────────────────────────────────────────

  /**
   * Send a raw string command.
   * Wraps the string in a `command` envelope as `{ cmd: <string> }`.
   * TODO: Align with the exact Command shape the game expects for raw console
   *       input once the server implementation is finalised.
   */
  async sendCommand(cmd: string): Promise<string> {
    // TODO: Replace cast with the correct Command variant when the game
    //       defines a generic console/exec command type.
    const result = await this.sendTypedCommand<{ output: string }>({
      type: 'command',
      payload: { cmd } as unknown as Record<string, unknown>,
    })
    return result.output ?? ''
  }

  isConnected(): boolean {
    return this.state === 'connected'
  }

  // ── Public: typed command dispatch ────────────────────────────────────────

  /**
   * Send a typed command envelope and await the correlated result.
   *
   * @param command - An object with `type: 'command'` and a `payload` that
   *                  is a valid `Command` from rcon/schema.ts. The `payload`
   *                  is sent as the `command` field of a `CommandMessage`.
   * @returns The `data` field from the matching `ResultOk` response.
   * @throws If the server returns a `ResultError`, or if the request times out.
   */
  sendTypedCommand<T>(command: {
    type: 'command'
    payload: Record<string, unknown>
  }): Promise<T> {
    if (this.state !== 'connected') {
      return Promise.reject(new Error(`Cannot send command: adapter is "${this.state}"`))
    }

    const id = this.nextId++

    const envelope: RconCommandMessage = {
      type: 'command',
      id: String(id),
      // The payload must conform to the Command union from rcon/schema.ts.
      command: command.payload,
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`RCON command timed out after ${COMMAND_TIMEOUT_MS}ms (id=${id})`))
      }, COMMAND_TIMEOUT_MS)

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      })

      this.ws!.send(JSON.stringify(envelope))
    })
  }

  // ── Public: event subscription ────────────────────────────────────────────

  /** Subscribe to adapter events: `'event'`, `'connected'`, `'disconnected'`. */
  on(event: string, listener: (...args: unknown[]) => void): this {
    this.emitter.on(event, listener)
    return this
  }

  /** Unsubscribe a previously registered listener. */
  off(event: string, listener: (...args: unknown[]) => void): this {
    this.emitter.off(event, listener)
    return this
  }

  // ── Private: WebSocket event handlers ─────────────────────────────────────

  private handleOpen(): void {
    this.state = 'authenticating'

    const authMsg: RconAuthMessage = {
      type: 'auth',
      secret: this.pass,
    }

    this.ws!.send(JSON.stringify(authMsg))
  }

  private handleMessage(raw: unknown): void {
    let msg: RconAnyMessage

    try {
      msg = JSON.parse(String(raw)) as RconAnyMessage
    } catch {
      // Malformed frame — ignore. TODO: increment a metrics counter.
      return
    }

    switch (msg.type) {
      case 'auth_ok': {
        const ok = msg as RconAuthOkMessage
        this.state = 'connected'
        this.startPing()
        this.emitter.emit('_auth_ok')
        this.emitter.emit('connected', ok)
        break
      }

      case 'auth_error': {
        const err = msg as RconAuthErrorMessage
        this.state = 'disconnected'
        this.emitter.emit('_auth_error', err.reason)
        this.ws?.close()
        break
      }

      case 'result': {
        const result = msg as RconResult
        const numericId = Number(result.id)
        const pending = this.pendingRequests.get(numericId)

        if (!pending) {
          // Unknown or already-timed-out correlation ID — ignore.
          break
        }

        clearTimeout(pending.timer)
        this.pendingRequests.delete(numericId)

        if (result.success) {
          pending.resolve(result.data)
        } else {
          pending.reject(
            new Error(`RCON error [${result.error.code}]: ${result.error.message}`)
          )
        }
        break
      }

      case 'event': {
        // Forward server-push events to subscribers.
        const ev = msg as RconEventMessage
        this.emitter.emit('event', ev.event)
        break
      }

      case 'pong': {
        // Pong received — keepalive cycle confirmed.
        // TODO: Record round-trip latency for metrics if desired.
        break
      }

      default:
        // Forward-compatible: ignore unknown message types.
        break
    }
  }

  private handleClose(): void {
    const wasConnected = this.state === 'connected' || this.state === 'authenticating'
    this.stopPing()
    this.rejectAllPending(new Error('RCON connection closed'))
    this.state = 'disconnected'

    if (wasConnected && this.reconnectAttempts !== -1) {
      this.emitter.emit('disconnected')
      this.scheduleReconnect()
    }
  }

  private handleError(err: Error): void {
    // The 'close' event always follows an 'error' event on a WebSocket; let
    // handleClose() drive state transitions and reconnection logic.
    console.error('[RCON] WebSocket error:', err.message)
  }

  // ── Private: reconnection ─────────────────────────────────────────────────

  /**
   * Schedule a reconnection attempt with exponential backoff.
   * Delay = min(BASE * 2^attempts, MAX). Resets on successful authentication.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return

    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts,
      MAX_RECONNECT_DELAY_MS
    )
    this.reconnectAttempts++

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.state !== 'disconnected') return

      // Re-enter the connect flow. Errors are non-fatal here — handleClose
      // will schedule the next attempt if it fails again.
      this.connect(this.host, this.port, this.pass).catch(() => {
        // handleClose already scheduled the next attempt.
      })
    }, delay)
  }

  // ── Private: keepalive ────────────────────────────────────────────────────

  private startPing(): void {
    this.stopPing()
    this.pingTimer = setInterval(() => {
      if (this.state !== 'connected' || this.ws === null) {
        this.stopPing()
        return
      }

      const ping: RconPingMessage = { type: 'ping' }
      this.ws.send(JSON.stringify(ping))
    }, PING_INTERVAL_MS)
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  // ── Private: cleanup ──────────────────────────────────────────────────────

  /**
   * Reject all in-flight commands, cancel timers, and close the WebSocket.
   * Does not alter `this.state` — callers are responsible for that.
   */
  private cleanup(): void {
    this.stopPing()

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.rejectAllPending(new Error('RCON adapter disconnected'))

    if (this.ws !== null) {
      // Remove listeners before closing to prevent handleClose from firing
      // and scheduling a reconnect during an intentional shutdown.
      this.ws.removeAllListeners()
      this.ws.close()
      this.ws = null
    }
  }

  private rejectAllPending(reason: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(reason)
      this.pendingRequests.delete(id)
    }
  }
}

// ── Factory ────────────────────────────────────────────────────────────────
// Returns the appropriate adapter. Routes always call getAdapter() —
// never interact with docker-manager or RCON sockets directly.
export async function getAdapter(server: {
  id: string
  rconPort?: number | null
  rconPass?: string | null
}): Promise<RconAdapter> {
  // Demo mode: return mock adapter that accepts all commands
  if (process.env.DEMO_MODE === 'true') {
    const { DemoAdapter } = await import('./demo/demo-adapter.js')
    return new DemoAdapter()
  }

  // Check RconConnectionManager for an active RCON adapter before falling back to Docker
  const { rconConnectionManager } = await import('./rcon-connection-manager.js')
  const rconAdapter = rconConnectionManager?.getAdapter(server.id)
  if (rconAdapter?.isConnected()) return rconAdapter

  return new DockerExecAdapter(server.id)
}
