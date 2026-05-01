import { WebSocketServer, type WebSocket } from 'ws'
import type { AddressInfo } from 'node:net'
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https'
import type { TLSSocket } from 'node:tls'

/**
 * In-process WebSocket server that speaks the ORMOD RCON protocol well
 * enough for integration tests. Not a reference implementation — shortcuts
 * are fine so long as clients see the same wire shapes the real game
 * server produces.
 *
 * Implements:
 *   - auth handshake (success, `invalid_secret`, arbitrary-reason via
 *     `failNextAuth`)
 *   - per-command dispatch through `stub()` / `stallCommand()`
 *   - `ping` → `pong` reply and inbound-ping counter
 *   - event broadcast to every authenticated connection
 *   - opt-in wss mode via an in-memory TLS cert fixture
 *
 * Does NOT implement:
 *   - spec §8 30-second server-side command timeout
 *   - spec §2 65,535-byte max frame size enforcement
 *   - `already_authenticated` rejection of a second `auth` on the same
 *     socket
 *   - `max_connections` limit
 *   - spontaneous `INTERNAL_ERROR` dispatch
 *
 * If a test needs one of the missing behaviors, register a stub or extend
 * this helper rather than asserting against the game server's docs.
 */

export interface FakeServerOptions {
  secret?: string
  serverName?: string
  version?: string
  tls?: {
    cert: Buffer
    key: Buffer
  }
}

export type CommandResult =
  | { success: true, data: unknown }
  | { success: false, error: { code: string, message: string } }

export type CommandStub = (
  data: Record<string, unknown> | undefined,
) => CommandResult | Promise<CommandResult>

export interface FakeServer {
  readonly url: string
  readonly port: number
  connectionCount (): number
  sendEvent (
    eventBody: Record<string, unknown> & { name: string },
    timestamp?: string,
  ): void
  stub (cmd: string, handler: CommandStub): void
  // Register a command that the server receives but never replies to. Used
  // to exercise the client's command-timeout path without racing against a
  // synchronous stub response.
  stallCommand (cmd: string): void
  clearStubs (): void
  disconnectAll (code?: number, reason?: string): void
  // Cause the next auth attempt (for any connection) to fail with reason.
  failNextAuth (reason: string): void
  close (): Promise<void>
  // Wait for at least `n` authenticated clients.
  waitForAuthenticated (n: number, timeoutMs?: number): Promise<void>
  // Inbound-ping telemetry — used by the load test's black-box assertion
  // that N clients still share one keepalive timer (single-client ping
  // rate, not N×). `pingCount` counts every `ping` frame received from any
  // authenticated client since construction or the last `resetPingCount`.
  pingCount (): number
  resetPingCount (): void
  // Count of connections whose TLS handshake resumed an earlier session.
  // Zero for ws:// and for wss:// when no session was presented.
  tlsResumptionCount (): number
}

interface SocketState {
  authenticated: boolean
}

export const createFakeServer = async (
  options: FakeServerOptions = {},
): Promise<FakeServer> => {
  const secret = options.secret ?? 'test-secret'
  const serverName = options.serverName ?? 'FakeServer'
  const version = options.version ?? '1.0.0'

  const states = new WeakMap<WebSocket, SocketState>()
  const sockets = new Set<WebSocket>()
  const stubs = new Map<string, CommandStub>()
  const stalled = new Set<string>()
  let pendingAuthFailReason: string | null = null
  let pingCounter = 0
  let tlsResumes = 0

  let wss: WebSocketServer
  let httpsServer: HttpsServer | null = null
  let scheme: 'ws' | 'wss'

  if (options.tls !== undefined) {
    httpsServer = createHttpsServer({
      cert: options.tls.cert,
      key: options.tls.key,
    })
    wss = new WebSocketServer({ server: httpsServer })
    scheme = 'wss'
    await new Promise<void>((resolve, reject) => {
      httpsServer!.once('listening', () => {
        return resolve()
      })
      httpsServer!.once('error', (err) => {
        return reject(err)
      })
      httpsServer!.listen(0, '127.0.0.1')
    })
  } else {
    wss = new WebSocketServer({ port: 0 })
    scheme = 'ws'
    await new Promise<void>((resolve, reject) => {
      wss.once('listening', () => {
        return resolve()
      })
      wss.once('error', (err) => {
        return reject(err)
      })
    })
  }

  const addressed = httpsServer ?? wss
  const addr = addressed.address() as AddressInfo
  const port = addr.port
  // In TLS mode use `localhost` so hostname validation matches the
  // cert's CN. Plain ws stays on 127.0.0.1 to avoid resolver lookup.
  const host = scheme === 'wss' ? 'localhost' : '127.0.0.1'
  const url = `${ scheme }://${ host }:${ port }`

  const handleMessage = (ws: WebSocket, raw: Buffer): void => {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(raw.toString('utf8')) as Record<string, unknown>
    } catch {
      return
    }

    const state = states.get(ws)
    if (state === undefined) {
      return
    }

    const type = msg.type

    if (type === 'auth') {
      if (pendingAuthFailReason !== null) {
        const reason = pendingAuthFailReason
        pendingAuthFailReason = null
        ws.send(JSON.stringify({ type: 'auth_error', reason }))
        ws.close(1000, 'auth_error')
        return
      }
      if (msg.secret !== secret) {
        ws.send(
          JSON.stringify({ type: 'auth_error', reason: 'invalid_secret' }),
        )
        ws.close(1000, 'auth_error')
        return
      }
      state.authenticated = true
      ws.send(
        JSON.stringify({
          type: 'auth_ok',
          serverTime: new Date().toISOString(),
          serverName,
          version,
        }),
      )
      return
    }

    if (!state.authenticated) {
      // Spec §7 — commands before auth_ok.
      if (type === 'command' && typeof msg.id === 'string') {
        ws.send(
          JSON.stringify({
            type: 'result',
            id: msg.id,
            success: false,
            error: { code: 'NOT_AUTHENTICATED', message: 'not authed' },
          }),
        )
      }
      return
    }

    if (type === 'ping') {
      pingCounter += 1
      ws.send(
        JSON.stringify({
          type: 'pong',
          serverTime: new Date().toISOString(),
        }),
      )
      return
    }

    if (type === 'command') {
      const cmd = String(msg.cmd)
      const id = String(msg.id)
      if (stalled.has(cmd)) {
        // Intentionally no reply — forces the client to hit its own
        // command-timeout path.
        return
      }
      const stub = stubs.get(cmd)
      if (stub === undefined) {
        ws.send(
          JSON.stringify({
            type: 'result',
            id,
            success: false,
            error: {
              code: 'UNKNOWN_COMMAND',
              message: `no stub for ${ cmd }`,
            },
          }),
        )
        return
      }
      // Stubs may return a Promise so tests can hold responses to exercise
      // out-of-order correlation. Sync stubs just flow through
      // Promise.resolve.
      Promise.resolve(stub(msg.data as Record<string, unknown> | undefined))
        .then((result) => {
          if (result.success) {
            ws.send(
              JSON.stringify({
                type: 'result',
                id,
                success: true,
                data: result.data,
              }),
            )
          } else {
            ws.send(
              JSON.stringify({
                type: 'result',
                id,
                success: false,
                error: result.error,
              }),
            )
          }
        })
        .catch(() => {
          ws.send(
            JSON.stringify({
              type: 'result',
              id,
              success: false,
              error: {
                code: 'INTERNAL_ERROR',
                message: 'stub rejected',
              },
            }),
          )
        })
    }
  }

  wss.on('connection', (ws, req) => {
    // TLSSocket exposes `isSessionReused()` when the transport is TLS —
    // used by the TLS session-ticket reuse test to verify the client
    // actually resumed, not just reconnected.
    const sock = req.socket as TLSSocket
    if (typeof sock.isSessionReused === 'function' && sock.isSessionReused()) {
      tlsResumes += 1
    }
    sockets.add(ws)
    states.set(ws, { authenticated: false })
    ws.on('message', (data) => {
      return handleMessage(ws, data as Buffer)
    })
    ws.on('close', () => {
      sockets.delete(ws)
    })
    // Do not crash on client-side transport errors during tests.
    ws.on('error', () => {})
  })

  return {
    url,
    port,
    connectionCount: () => {
      return sockets.size
    },
    sendEvent: (eventBody, timestamp) => {
      const ts = timestamp ?? new Date().toISOString()
      const frame = JSON.stringify({
        type: 'event',
        timestamp: ts,
        event: eventBody,
      })
      for (const ws of sockets) {
        const state = states.get(ws)
        if (state?.authenticated === true) {
          ws.send(frame)
        }
      }
    },
    stub: (cmd, handler) => {
      stubs.set(cmd, handler)
    },
    stallCommand: (cmd) => {
      stalled.add(cmd)
    },
    clearStubs: () => {
      stubs.clear()
      stalled.clear()
    },
    disconnectAll: (code, reason) => {
      for (const ws of sockets) {
        ws.close(code ?? 1001, reason ?? 'server disconnect')
      }
    },
    failNextAuth: (reason) => {
      pendingAuthFailReason = reason
    },
    close: () => {
      return new Promise<void>((resolve) => {
        for (const ws of sockets) {
          ws.terminate()
        }
        // In wss mode a connection stuck mid-TLS never surfaces to the ws
        // layer, so `sockets` may not contain it — force-close at the
        // underlying http(s) server to guarantee the close promise
        // resolves during teardown.
        if (httpsServer !== null) {
          httpsServer.closeAllConnections()
        }
        wss.close(() => {
          if (httpsServer !== null) {
            httpsServer.close(() => {
              return resolve()
            })
          } else {
            resolve()
          }
        })
      })
    },
    waitForAuthenticated: (n, timeoutMs = 2_000) => {
      return new Promise<void>((resolve, reject) => {
        const started = Date.now()
        const check = (): void => {
          let authed = 0
          for (const ws of sockets) {
            if (states.get(ws)?.authenticated === true) {
              authed += 1
            }
          }
          if (authed >= n) {
            resolve()
            return
          }
          if (Date.now() - started > timeoutMs) {
            reject(
              new Error(
                `timed out waiting for ${ n } auth'd clients (have ${ authed })`,
              ),
            )
            return
          }
          setTimeout(check, 10)
        }
        check()
      })
    },
    pingCount: () => {
      return pingCounter
    },
    resetPingCount: () => {
      pingCounter = 0
    },
    tlsResumptionCount: () => {
      return tlsResumes
    },
  }
}
