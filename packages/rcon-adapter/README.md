# @ormod/rcon-adapter

TypeScript RCON client for ORMOD: Directive game servers. Speaks the WebSocket JSON protocol defined in `rcon/README.md`.

- One connection per `RconClient` — no pool, no orchestration.
- Idiomatic Node `EventEmitter` surface (`on` / `off` / `once`).
- Typed command and event shapes from the protocol spec.
- Typed error taxonomy so callers can switch on failure modes.
- Shared keepalive scheduler — O(1) timers across N clients in a single process.
- Opt-in observability via `node:diagnostics_channel`.
- No `any` on the public surface.

## Install

```bash
pnpm add @ormod/rcon-adapter
```

The package depends on `ws`. The optional `bufferutil` and `utf-8-validate` native helpers are pulled in when available — see [Alpine / multi-arch](#alpine--multi-arch) below if your build environment can't compile them.

## Usage

```ts
import { RconClient } from '@ormod/rcon-adapter'

const client = new RconClient({
  url: 'ws://127.0.0.1:28016',
  secret: process.env.RCON_SECRET as string,
})

client.on('gameEvent', (event) => {
  if (event.name === 'player.join') {
    console.log(`${ event.displayName } joined`)
  }
})

await client.connect()

const players = await client.send<{
  count: number
  players: Array<{ steamId: string, displayName: string }>
}>({ cmd: 'getplayers' })

console.log(`${ players.count } players online`)

await client.close()
```

`RconClient` extends Node's `EventEmitter`, so `await using client = new RconClient(...)` works — `Symbol.asyncDispose` calls `close()` on scope exit.

## Public API

### `new RconClient(options)`

| Option | Type | Default | Purpose |
|---|---|---|---|
| `url` | `string` | — | `ws://…` or `wss://…` endpoint. |
| `secret` | `string` | — | Plaintext RCON password (from `serversettings.json`). |
| `logger` | `Logger` | noop | Pino-compatible logger. Noop default, no deps required. |
| `signal` | `AbortSignal` | — | Aborts pending commands and the reconnect loop. Moves state to `closed(user)`. |
| `reconnect.enabled` | `boolean` | `true` | Set `false` to stop on first failure. |
| `reconnect.initialDelayMs` | `number` | `1000` | Exponential backoff base. |
| `reconnect.maxDelayMs` | `number` | `30000` | Cap on the computed delay. |
| `reconnect.jitter` | `number` | `0.2` | ±20% jitter. Mandatory in aggregate — see below. |
| `tls.session` | `Buffer` | — | TLS session ticket for resumption on the first connect. |
| `limits.maxInFlightCommands` | `number` | `64` | Per-connection outstanding-command cap. Exceeding → `RconOverloadError`. |
| `limits.commandTimeoutMs` | `number` | `30000` | Matches spec §8 (server must respond within 30 s). |
| `limits.maxBufferedAmountBytes` | `number` | `262144` | Combined ws.bufferedAmount + socket.writableLength ceiling. |
| `limits.highWaterMarkSeconds` | `number` | `5` | Terminate the socket if buffered bytes stay above zero this long. |

### Methods

```ts
class RconClient extends EventEmitter<RconClientEvents> {
  readonly state: RconClientState
  connect (): Promise<void>
  send<R> (command: RconCommand): Promise<R>
  close (): Promise<void>
  [Symbol.asyncDispose] (): Promise<void>
}
```

- `connect()` resolves on `auth_ok`. Rejects on `auth_error` / fatal error / abort.
- `send()` requires the client to be in the `ready` state; otherwise rejects with `RconTransportError { code: 'not_ready' }`. The response promise rejects with a typed error on failure.
- `close()` is idempotent. Pending commands reject. State moves to `closed(user)`.
- `[Symbol.asyncDispose]()` is an alias for `close()` so the client is compatible with `await using`.

### Events

```ts
interface RconClientEvents {
  state: [s: RconClientState]
  gameEvent: [e: RconEvent]
}
```

- `state` fires for every state transition. Use this to drive dashboards, alerts, or reconnect-aware logic.
- `gameEvent` fires for each inbound event frame. **Listeners must not throw** — thrown errors are logged and swallowed so a misbehaving listener cannot break dispatch.

The supported public surface inherited from `EventEmitter` is `on`, `off`, `once`, `addListener`, `removeListener`, `listenerCount`, and `eventNames`. Other inherited members (`emit`, `removeAllListeners`, `setMaxListeners`) are exposed but are not part of the public contract — calling them is supported by the JS runtime but unsupported by the package.

There is no `'error'` event. Transport, protocol, auth, and overload failures route to the `state` event (`closed{auth_failed}`, `closed{error}`, `reconnecting`) and to `connect()` / `send()` promise rejections. Stock `EventEmitter` would crash the process on `emit('error')` with no listener; deliberately keeping that surface empty avoids the foot-gun.

`emit('state' | 'gameEvent', …)` is overridden to isolate listener throws — one bad listener logs and the next continues. This trades stock-EE rethrow semantics for fan-out reliability.

### State

```ts
type RconClientState =
  | { kind: 'idle' }
  | { kind: 'connecting', attempt: number }
  | { kind: 'authenticating' }
  | { kind: 'ready', serverTime, serverName, version }
  | { kind: 'reconnecting', nextAttemptAt, attempt, lastError }
  | { kind: 'closing' }
  | { kind: 'closed', reason: 'user' | 'giveup' | 'auth_failed' | 'error', error? }
```

### Errors

| Class | When | Discriminator |
|---|---|---|
| `RconTransportError` | Socket / TLS / framing failure; client not ready. | `code: 'socket_closed' \| 'handshake_failed' \| 'tls_error' \| 'frame_too_large' \| 'unknown_frame' \| 'not_ready'` |
| `RconProtocolError` | Auth reason or spec §7 error code. | `code: 'invalid_secret' \| 'NOT_AUTHENTICATED' \| ...` |
| `RconCommandError` | Game-side error code not in spec §7. | `code: string` (whatever the server sent) |
| `RconTimeoutError` | Command exceeded `limits.commandTimeoutMs`. | `commandId`, `elapsedMs` |
| `RconOverloadError` | Local cap hit before the frame leaves. | `reason: 'in_flight_cap' \| 'buffered_amount'` |

## Listener contract (important)

`gameEvent` listeners are called synchronously per frame on the client's dispatch path. **Do not `await`** inside them, and **do not throw** — thrown errors are logged and swallowed so a misbehaving listener cannot break the dispatch loop. Queue or defer async work to a downstream consumer.

Doing heavy work inline in a `gameEvent` listener is the most common way to make the adapter look "slow" at scale. Push events into a channel (an array plus a microtask, a Node stream, a `queueMicrotask` batch) and do the expensive work there.

## Reconnect and jitter

Jitter is on by default and should stay on. A fleet of clients losing the upstream at the same moment (api restart, transient network blip) produces a synchronised reconnect storm without jitter. ±20% spread across N clients turns the thundering herd into a well-distributed arrival curve. The default `maxDelayMs: 30_000` also caps worst-case backoff; override for testing but rarely in production.

## Running at scale

The shared keepalive scheduler is a module-level singleton — one `setInterval` for the entire process regardless of how many `RconClient` instances you create. Ping/pong handling is spec-accurate (30 s period, 10 s pong timeout) and does not scale with client count.

Every client exposes `bufferedAmount` + `writableLength` watchdogs so one slow server cannot block commands heading to another.

## Alpine / multi-arch

`bufferutil` and `utf-8-validate` ship prebuilds via `node-gyp-build` for common platforms. If your builder hits a source-compile path (Alpine + musl, missing toolchain), set:

```bash
WS_NO_BUFFER_UTIL=1
WS_NO_UTF_8_VALIDATE=1
```

to force the pure-JS fallback. At typical per-connection rates (single-digit events per second) the throughput delta is noise.

## Observability

Each lifecycle event publishes on a `node:diagnostics_channel` channel. Payloads are zero-cost when nobody subscribes. Channel names are exported as `DIAGNOSTICS_CHANNELS`:

```ts
import diagnosticsChannel from 'node:diagnostics_channel'
import { DIAGNOSTICS_CHANNELS } from '@ormod/rcon-adapter'

diagnosticsChannel.subscribe(
  DIAGNOSTICS_CHANNELS.commandResolve,
  (msg) => {
    /* record metric, emit trace, etc. */
  },
)
```

| Channel | Payload fields |
|---|---|
| `rcon.connect` | `url`, `attempt` |
| `rcon.auth` | `url`, `result: 'ok'\|'error'`, `reason?` |
| `rcon.command.send` | `url`, `id`, `cmd`, `inFlight` |
| `rcon.command.resolve` | `url`, `id`, `cmd`, `ms`, `success`, `code?` |
| `rcon.event` | `url`, `name` |
| `rcon.disconnect` | `url`, `code`, `reason`, `willReconnect` |
| `rcon.backpressure` | `url`, `bufferedAmount`, `writableLength`, `action: 'reject'\|'terminate'` |
| `rcon.error` | `url`, `className`, `code?`, `message` |

## Scripts

```bash
pnpm -F @ormod/rcon-adapter build       # tsc → dist/
pnpm -F @ormod/rcon-adapter typecheck   # tsc --noEmit
pnpm -F @ormod/rcon-adapter test        # unit + integration
pnpm -F @ormod/rcon-adapter test:load   # load validation
```

The load script accepts `RCON_LOAD_CLIENTS`, `RCON_LOAD_EVENTS_PER_SEC`, and `RCON_LOAD_DURATION_MS` env vars.

## Protocol

The canonical wire protocol is documented in `rcon/README.md` at the repository root. This package's types track that spec. Unknown event names are passed through untouched — the consumer can `switch` on `event.name` and ignore anything unfamiliar.
