import { EventEmitter } from 'node:events'
import {
  createWsTransport,
  type Transport,
  type TransportFactory,
  type TransportHandlers,
} from '../transport/ws-transport.js'
import type {
  IsoTimestamp,
  RconCommand,
  RconEvent,
} from '../protocol/schema.js'
import {
  decodeFrame,
  encodeCommand,
  type DecodedFrame,
} from '../protocol/codec.js'
import {
  classifyRconError,
  RconProtocolError,
  RconTransportError,
} from '../protocol/errors.js'
import {
  createCorrelationTable,
  type CorrelationTable,
} from './correlation.js'
import {
  createReconnectSupervisor,
  type ReconnectPolicy,
  type ReconnectSupervisor,
} from './reconnect.js'
import {
  createFlowControl,
  type FlowControl,
} from './flow-control.js'
import {
  createClientKeepalive,
  type ClientKeepalive,
} from './keepalive.js'
import {
  createAuthenticator,
  type Authenticator,
  type AuthInfo,
} from './authenticator.js'
import { createNoopLogger, type Logger } from '../telemetry/logger.js'
import {
  publishCommandResolve,
  publishCommandSend,
  publishConnect,
  publishDisconnect,
  publishError,
  publishEvent,
} from '../telemetry/diagnostics.js'

export type RconClientState =
  | { kind: 'idle' }
  | { kind: 'connecting', attempt: number }
  | { kind: 'authenticating' }
  | {
      kind: 'ready',
      serverTime: IsoTimestamp,
      serverName: string,
      version: string,
    }
  | {
      kind: 'reconnecting',
      nextAttemptAt: number,
      attempt: number,
      lastError: Error,
    }
  | { kind: 'closing' }
  | {
      kind: 'closed',
      reason: 'user' | 'giveup' | 'auth_failed' | 'error',
      error?: Error,
    }

export type RconClientStateKind = RconClientState['kind']

export interface RconClientLimits {
  maxInFlightCommands: number
  commandTimeoutMs: number
  maxBufferedAmountBytes: number
  highWaterMarkSeconds: number
}

export interface RconClientOptions {
  url: string
  secret: string
  logger?: Logger
  signal?: AbortSignal
  reconnect?: Partial<ReconnectPolicy>
  tls?: {
    session?: Buffer
    rejectUnauthorized?: boolean
    ca?: string | Buffer | Array<string | Buffer>
  }
  limits?: Partial<RconClientLimits>
  // Test-only injection seam — production callers leave this undefined.
  transportFactory?: TransportFactory
}

export interface RconClientEvents {
  state: [s: RconClientState]
  gameEvent: [e: RconEvent]
}

interface TeardownOptions {
  rejectError: Error
  closeCode: number
  closeReason: string
  // When non-null, this is a terminal teardown: the supervisor is stopped
  // and state moves to the given terminal kind BEFORE t.close() so a
  // synchronous onClose ricochet hits the closed-state guard. When null,
  // the caller (today only #handleConnectionLost) owns the next state
  // transition via the supervisor.
  terminalState: RconClientState | null
}

export class RconClient extends EventEmitter<RconClientEvents> {
  readonly #options: RconClientOptions
  readonly #log: Logger
  readonly #transportFactory: TransportFactory
  readonly #correlation: CorrelationTable
  readonly #authenticator: Authenticator
  readonly #flowControl: FlowControl
  readonly #keepalive: ClientKeepalive
  readonly #supervisor: ReconnectSupervisor

  #transport: Transport | null = null
  #capturedSession: Buffer | undefined
  #state: RconClientState = { kind: 'idle' }

  constructor (options: RconClientOptions) {
    super()
    this.#options = options
    const logger = options.logger ?? createNoopLogger()
    this.#log = logger.child({ component: 'rcon-client', url: options.url })
    this.#transportFactory = options.transportFactory ?? createWsTransport
    this.#capturedSession = options.tls?.session

    this.#correlation = createCorrelationTable({
      maxInFlight: options.limits?.maxInFlightCommands,
      timeoutMs: options.limits?.commandTimeoutMs,
    })

    this.#authenticator = createAuthenticator({
      secret: options.secret,
      url: options.url,
    })

    this.#keepalive = createClientKeepalive({
      getTransport: () => {
        return this.#transport
      },
      onFailure: (err) => {
        this.#handleConnectionLost(err)
      },
    })

    this.#flowControl = createFlowControl({
      limits: {
        maxBufferedAmountBytes: options.limits?.maxBufferedAmountBytes,
        highWaterMarkSeconds: options.limits?.highWaterMarkSeconds,
      },
      onTerminate: (err) => {
        this.#handleConnectionLost(err)
      },
      url: options.url,
    })

    this.#supervisor = createReconnectSupervisor({
      policy: options.reconnect,
      isAborted: () => {
        return this.#isAborted()
      },
      onAttempt: () => {
        void this.#attemptConnect()
      },
      stateAccess: {
        get: () => {
          return this.#state
        },
        set: (next) => {
          this.#setState(next)
        },
      },
    })

    options.signal?.addEventListener(
      'abort',
      () => {
        this.#onAbort()
      },
      { once: true },
    )
  }

  get state (): RconClientState {
    return this.#state
  }

  override emit<E extends keyof RconClientEvents> (
    event: E,
    ...args: RconClientEvents[E]
  ): boolean {
    const listeners = this.rawListeners(event)
    if (listeners.length === 0) {
      return false
    }
    for (const listener of listeners) {
      try {
        (listener as (...a: unknown[]) => void)(...args)
      } catch (err) {
        this.#log.warn(
          { err, event },
          'rcon-client listener threw — continuing fan-out',
        )
      }
    }
    return true
  }

  async connect (): Promise<void> {
    const current = this.#state
    if (current.kind === 'ready') {
      return
    }
    if (current.kind === 'closed') {
      throw current.error
        ?? new Error(`client closed: ${ current.reason }`)
    }
    if (current.kind === 'idle') {
      void this.#attemptConnect()
    }
    // For idle / connecting / authenticating / reconnecting / closing,
    // wait on the next terminal kind. #waitForState checks current state
    // synchronously before subscribing so a microtask race after
    // #attemptConnect resolves to ready is still observed.
    const result = await this.#waitForState([ 'ready', 'closed' ])
    if (result.kind === 'closed') {
      throw result.error
        ?? new Error(`client closed: ${ result.reason }`)
    }
  }

  send<R = unknown> (command: RconCommand): Promise<R> {
    if (this.#state.kind !== 'ready' || this.#transport === null) {
      return Promise.reject(
        new RconTransportError('client is not ready', 'not_ready'),
      )
    }
    const transport = this.#transport

    return this.#correlation.register<R>(command.cmd, (id) => {
      // flow-control owns the only command-send path: predicate + action.
      // Throws RconOverloadError on reject; on saturation, also calls
      // handleConnectionLost via onTerminate before throwing.
      this.#flowControl.send(transport, encodeCommand(command, id))
      publishCommandSend({
        url: this.#options.url,
        id,
        cmd: command.cmd,
        inFlight: this.#correlation.size(),
      })
    })
  }

  close (): Promise<void> {
    const kind = this.#state.kind
    if (kind === 'closed' || kind === 'closing') {
      return Promise.resolve()
    }
    this.#setState({ kind: 'closing' })
    this.#teardown({
      rejectError: new RconTransportError('client closed', 'socket_closed'),
      closeCode: 1000,
      closeReason: 'user close',
      terminalState: { kind: 'closed', reason: 'user' },
    })
    return Promise.resolve()
  }

  [Symbol.asyncDispose] (): Promise<void> {
    return this.close()
  }

  // ── internals ─────────────────────────────────────────────────────────────

  #setState (next: RconClientState): void {
    this.#state = next
    this.emit('state', next)
  }

  // Returns a promise that settles when state.kind ∈ kinds. Synchronous
  // pre-check so `#setState({ kind: 'ready' }); await #waitForState(['ready'])`
  // works. closed-state matches reject with the closed error.
  #waitForState (
    kinds: readonly RconClientStateKind[],
  ): Promise<RconClientState> {
    const closedError = (
      s: Extract<RconClientState, { kind: 'closed' }>,
    ): Error => {
      return s.error ?? new Error(`client closed: ${ s.reason }`)
    }
    if (kinds.includes(this.#state.kind)) {
      return this.#state.kind === 'closed'
        ? Promise.reject(closedError(this.#state))
        : Promise.resolve(this.#state)
    }
    return new Promise((resolve, reject) => {
      const onState = (next: RconClientState): void => {
        if (!kinds.includes(next.kind)) {
          return
        }
        this.off('state', onState)
        if (next.kind === 'closed') {
          reject(closedError(next))
          return
        }
        resolve(next)
      }
      this.on('state', onState)
    })
  }

  #handleMessage (data: string): void {
    let decoded: DecodedFrame
    try {
      decoded = decodeFrame(data)
    } catch (err) {
      const transportErr = err as RconTransportError
      publishError({
        url: this.#options.url,
        className: 'RconTransportError',
        code: transportErr.code,
        message: transportErr.message,
      })
      this.#log.warn({ err }, 'failed to decode frame')
      return
    }

    switch (decoded.kind) {
      case 'auth_ok':
        this.#authenticator.handleAuthOk({
          serverTime: decoded.serverTime,
          serverName: decoded.serverName,
          version: decoded.version,
        })
        return
      case 'auth_error':
        this.#authenticator.handleAuthError(decoded.reason)
        return
      case 'result_ok': {
        const cmd =
          this.#correlation.resolve(decoded.id, decoded.data) ?? 'unknown'
        publishCommandResolve({
          url: this.#options.url,
          id: decoded.id,
          cmd,
          ms: 0,
          success: true,
        })
        return
      }
      case 'result_error': {
        const cmd =
          this.#correlation.rejectById(
            decoded.id,
            classifyRconError(decoded.code, decoded.message),
          ) ?? 'unknown'
        publishCommandResolve({
          url: this.#options.url,
          id: decoded.id,
          cmd,
          ms: 0,
          success: false,
          code: decoded.code,
        })
        return
      }
      case 'event':
        publishEvent({ url: this.#options.url, name: decoded.event.name })
        this.emit('gameEvent', decoded.event)
        return
      case 'pong':
        this.#keepalive.onPong()
        return
    }
  }

  #handleConnectionLost (err: Error): void {
    const kind = this.#state.kind
    if (kind === 'reconnecting' || kind === 'closing' || kind === 'closed') {
      return
    }
    const transportErr = err instanceof RconTransportError
      ? err
      : new RconTransportError(
          err.message ?? 'connection lost',
          'socket_closed',
        )
    publishDisconnect({
      url: this.#options.url,
      code: 1006,
      reason: err.message,
      willReconnect: this.#supervisor.policy.enabled && !this.#isAborted(),
    })
    this.#teardown({
      rejectError: transportErr,
      closeCode: 1011,
      closeReason: 'connection lost',
      // Non-terminal: the supervisor's failure() picks the next state
      // (reconnecting / closed{error} / no-op on abort).
      terminalState: null,
    })
    this.#supervisor.failure(transportErr)
  }

  #closeFatalAuthFailure (err: RconProtocolError): void {
    this.#teardown({
      rejectError: err,
      closeCode: 1000,
      closeReason: 'auth_failed',
      terminalState: { kind: 'closed', reason: 'auth_failed', error: err },
    })
  }

  // Single teardown path for every shutdown shape. Load-bearing ordering:
  // when terminalState is non-null, state moves to its terminal kind BEFORE
  // t.close() so a synchronous onClose ricochet hits the closed-state guard
  // and cannot schedule a reconnect.
  #teardown (opts: TeardownOptions): void {
    this.#authenticator.cancel()
    const t = this.#transport
    this.#transport = null
    this.#correlation.rejectAll(opts.rejectError)
    this.#flowControl.reset()
    this.#keepalive.stop()
    if (opts.terminalState !== null) {
      this.#supervisor.stop()
      this.#setState(opts.terminalState)
    }
    t?.close(opts.closeCode, opts.closeReason)
  }

  #onAbort (): void {
    if (this.#state.kind === 'closed') {
      return
    }
    this.#teardown({
      rejectError: new Error('aborted'),
      closeCode: 1000,
      closeReason: 'aborted',
      terminalState: { kind: 'closed', reason: 'user' },
    })
  }

  #isAborted (): boolean {
    return this.#options.signal?.aborted === true
  }

  async #attemptConnect (): Promise<void> {
    // Defense-in-depth: a supervisor retry timer could fire after close()
    // has already torn the client down (timer dispatched between the
    // supervisor's clear-timer guard and the body firing). Bail before
    // dialling so we don't resurrect a closed client.
    if (this.#state.kind === 'closed' || this.#state.kind === 'closing') {
      return
    }
    if (this.#isAborted()) {
      // The top-of-function guard already excluded closed/closing, so
      // setting closed{user} is unconditional here.
      this.#setState({ kind: 'closed', reason: 'user' })
      this.#supervisor.stop()
      return
    }

    this.#setState({ kind: 'connecting', attempt: this.#supervisor.attempt })
    publishConnect({
      url: this.#options.url,
      attempt: this.#supervisor.attempt,
    })

    const handlers: TransportHandlers = {
      onMessage: (data) => {
        this.#handleMessage(data)
      },
      onClose: (code, reason) => {
        const current = this.#state.kind
        if (current === 'closing' || current === 'closed') {
          return
        }
        this.#handleConnectionLost(
          new RconTransportError(
            `socket closed: ${ code } ${ reason }`,
            'socket_closed',
          ),
        )
      },
      onError: (err) => {
        publishError({
          url: this.#options.url,
          className: err.name,
          code: err instanceof RconTransportError ? err.code : undefined,
          message: err.message,
        })
        this.#log.error({ err }, 'transport error')
      },
    }

    const t = this.#transportFactory(
      {
        url: this.#options.url,
        tlsSession: this.#capturedSession,
        rejectUnauthorized: this.#options.tls?.rejectUnauthorized,
        ca: this.#options.tls?.ca,
      },
      handlers,
    )
    this.#transport = t

    try {
      await t.connect()
    } catch (err) {
      this.#transport = null
      this.#handleConnectionLost(err as Error)
      return
    }

    this.#setState({ kind: 'authenticating' })
    let info: AuthInfo
    try {
      info = await this.#authenticator.run(t)
    } catch (err) {
      if (err instanceof RconProtocolError) {
        this.#closeFatalAuthFailure(err)
        return
      }
      this.#handleConnectionLost(err as Error)
      return
    }

    if (t.tlsSession !== undefined) {
      this.#capturedSession = t.tlsSession
    }
    this.#setState({
      kind: 'ready',
      serverTime: info.serverTime,
      serverName: info.serverName,
      version: info.version,
    })
    this.#supervisor.success()
    this.#keepalive.start()
  }
}
