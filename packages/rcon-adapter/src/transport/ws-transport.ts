import WebSocket, { type ErrorEvent } from 'ws'
import type { TLSSocket } from 'node:tls'
import {
  RconTransportError,
  type RconTransportErrorCode,
} from '../protocol/errors.js'

export const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10_000

// Network-layer failures fall through to socket_closed; TLS / HTTP-upgrade
// signatures promote so callers can branch on the cause.
const classifyConnectError = (err: Error): RconTransportErrorCode => {
  const code = (err as Error & { code?: string }).code ?? ''
  const msg = err.message ?? ''
  if (
    code.startsWith('ERR_TLS')
    || code.startsWith('ERR_SSL')
    || code === 'EPROTO'
    || code === 'CERT_HAS_EXPIRED'
    || code === 'DEPTH_ZERO_SELF_SIGNED_CERT'
    || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
    || code === 'SELF_SIGNED_CERT_IN_CHAIN'
    || code === 'CERT_SIGNATURE_FAILURE'
    || /certificate|self.signed|\bSSL\b|\bTLS\b/i.test(msg)
  ) {
    return 'tls_error'
  }
  if (/unexpected server response|invalid status code|sec-websocket/i.test(msg)) {
    return 'handshake_failed'
  }
  return 'socket_closed'
}

const classifyPostOpenError = (err: Error): RconTransportErrorCode => {
  const msg = err.message ?? ''
  if (/max payload size|frame.*too.*large|payload length too long/i.test(msg)) {
    return 'frame_too_large'
  }
  return 'socket_closed'
}

// Frames are `string` above this layer; UTF-8 conversion happens here.

export interface TransportHandlers {
  onMessage: (data: string) => void
  onClose: (code: number, reason: string) => void
  onError: (err: Error) => void
}

export interface TransportOptions {
  url: string
  tlsSession?: Buffer
  handshakeTimeoutMs?: number
  rejectUnauthorized?: boolean
  ca?: string | Buffer | Array<string | Buffer>
}

export interface Transport {
  connect (): Promise<void>
  send (data: string): void
  close (code?: number, reason?: string): void
  readonly bufferedAmount: number
  // Node-side socket write buffer; ws.bufferedAmount alone misses kernel queue.
  readonly writableLength: number
  readonly tlsSession: Buffer | undefined
}

export type TransportFactory = (
  options: TransportOptions,
  handlers: TransportHandlers,
) => Transport

export const createWsTransport: TransportFactory = (options, handlers) => {
  let socket: WebSocket | null = null
  let capturedSession: Buffer | undefined = options.tlsSession
  let isOpen = false

  const buildSocket = (): WebSocket => {
    // ws forwards unknown options to net/tls.connect, so `session` and `ca`
    // flow through even though they aren't in WebSocket.ClientOptions.
    const wsOptions: WebSocket.ClientOptions & {
      session?: Buffer
      ca?: string | Buffer | Array<string | Buffer>
    } = {
      maxPayload: 65_535, // protocol §5
      // Disable deflate — small JSON, and dodges permessage-deflate bombs.
      perMessageDeflate: false,
      skipUTF8Validation: false,
      handshakeTimeout:
        options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS,
      rejectUnauthorized: options.rejectUnauthorized ?? true,
    }

    if (options.tlsSession !== undefined) {
      wsOptions.session = options.tlsSession
    }
    if (options.ca !== undefined) {
      wsOptions.ca = options.ca
    }

    return new WebSocket(options.url, wsOptions)
  }

  const captureSessionIfTls = (ws: WebSocket): void => {
    // TLS 1.3 sends NewSessionTicket post-handshake (sometimes more than
    // once), so getSession() at 'open' isn't enough — subscribe and keep
    // the latest ticket so the next reconnect can actually resume.
    const nodeSocket = (ws as unknown as { _socket?: unknown })._socket
    if (
      nodeSocket === null
      || nodeSocket === undefined
      || typeof (nodeSocket as TLSSocket).getSession !== 'function'
    ) {
      return
    }
    const tls = nodeSocket as TLSSocket
    const initial = tls.getSession()
    if (initial !== undefined) {
      capturedSession = initial
    }
    tls.on('session', (session: Buffer) => {
      capturedSession = session
    })
  }

  const readWritableLength = (): number => {
    if (socket === null) {
      return 0
    }
    const nodeSocket = (socket as unknown as { _socket?: { writableLength?: number } })
      ._socket
    return nodeSocket?.writableLength ?? 0
  }

  return {
    connect: () => {
      return new Promise((resolve, reject) => {
        const ws = buildSocket()
        socket = ws
        ws.binaryType = 'nodebuffer'

        const onOpen = (): void => {
          isOpen = true
          captureSessionIfTls(ws)
          ws.off('error', onInitialError)
          resolve()
        }

        const onInitialError = (err: ErrorEvent | Error): void => {
          // ws fires 'error' then 'close' on a failed handshake — reject once
          // and let the post-open handler take over from here.
          ws.off('open', onOpen)
          const error = err instanceof Error ? err : new Error(String(err))
          reject(new RconTransportError(error.message, classifyConnectError(error)))
        }

        ws.once('open', onOpen)
        ws.once('error', onInitialError)

        ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
          // Buffer[] is the fragmented-frame case; spec §2 uses single
          // frames, so this branch is defensive.
          const asString = Buffer.isBuffer(data)
            ? data.toString('utf8')
            : Array.isArray(data)
              ? Buffer.concat(data).toString('utf8')
              : Buffer.from(data as ArrayBuffer).toString('utf8')
          handlers.onMessage(asString)
        })

        ws.on('close', (code: number, reason: Buffer) => {
          isOpen = false
          handlers.onClose(code, reason.toString('utf8'))
        })

        // Post-open errors get classified so frame_too_large is distinguishable.
        ws.on('error', (err: Error) => {
          if (isOpen) {
            handlers.onError(
              new RconTransportError(err.message, classifyPostOpenError(err)),
            )
          }
        })
      })
    },

    send: (data) => {
      if (socket === null || !isOpen) {
        throw new Error('transport not open')
      }
      socket.send(data)
    },

    close: (code, reason) => {
      if (socket === null) {
        return
      }
      try {
        socket.close(code, reason)
      } catch {
        // ws rejects RFC-reserved codes (1005/1006/1015) and out-of-range
        // values. The caller wants the connection gone — rip the TCP socket
        // rather than let an invalid code crash the process.
        socket.terminate()
      }
    },

    get bufferedAmount () {
      return socket?.bufferedAmount ?? 0
    },

    get writableLength () {
      return readWritableLength()
    },

    get tlsSession () {
      return capturedSession
    },
  }
}
