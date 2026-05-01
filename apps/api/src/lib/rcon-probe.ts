import { createConnection, type Socket } from 'node:net'

export type ProbeReason =
  | 'timeout'
  | 'refused'
  | 'dns_failed'
  | 'network_error'

export interface ProbeResult {
  ok: boolean
  /** Machine-readable reason on failure. */
  code?: ProbeReason
  /** Human-readable detail (the underlying error message). */
  detail?: string
}

export interface ProbeOpts {
  host: string
  port: number
  /** How long to wait for the TCP handshake. Default 5s. */
  timeoutMs?: number
}

const classify = (err: NodeJS.ErrnoException): ProbeReason => {
  switch (err.code) {
    case 'ETIMEDOUT':
      return 'timeout'
    case 'ECONNREFUSED':
      return 'refused'
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'dns_failed'
    default:
      return 'network_error'
  }
}

/**
 * Single-shot TCP reachability check used as the pre-flight on
 * POST /api/servers. Confirms the host resolves and the port accepts
 * TCP connections, no further protocol exchange.
 *
 * Why TCP-only and not the full WebSocket + RCON auth handshake:
 *   - Catches the high-frequency mistakes (DNS typo, wrong port,
 *     server offline) without dragging in the adapter's reconnect
 *     state machine.
 *   - Stays under a few hundred milliseconds against a healthy server,
 *     so the create form feels instant.
 *   - Wrong-password / wrong-protocol mismatches surface later via the
 *     supervisor's `errored` dashboard state, which is the right channel
 *     for them anyway.
 */
export const probeRconConnection = async (opts: ProbeOpts): Promise<ProbeResult> => {
  const timeoutMs = opts.timeoutMs ?? 5_000
  return new Promise<ProbeResult>((resolve) => {
    let settled = false
    let socket: Socket | null = null
    const finish = (result: ProbeResult): void => {
      if (settled) return
      settled = true
      if (socket) {
        socket.destroy()
        socket = null
      }
      resolve(result)
    }

    socket = createConnection({ host: opts.host, port: opts.port })
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => { finish({ ok: true }) })
    socket.once('timeout', () => {
      finish({ ok: false, code: 'timeout', detail: `no response after ${ timeoutMs }ms` })
    })
    socket.once('error', (err: NodeJS.ErrnoException) => {
      finish({ ok: false, code: classify(err), detail: err.message })
    })
  })
}
