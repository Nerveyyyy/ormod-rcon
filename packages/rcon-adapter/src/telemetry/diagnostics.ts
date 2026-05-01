import diagnosticsChannel from 'node:diagnostics_channel'

// Opt-in observability. Publishing is free until a subscriber attaches.

export const DIAGNOSTICS_CHANNELS = {
  connect: 'rcon.connect',
  auth: 'rcon.auth',
  commandSend: 'rcon.command.send',
  commandResolve: 'rcon.command.resolve',
  event: 'rcon.event',
  disconnect: 'rcon.disconnect',
  backpressure: 'rcon.backpressure',
  error: 'rcon.error',
} as const

export type DiagnosticsChannelName =
  (typeof DIAGNOSTICS_CHANNELS)[keyof typeof DIAGNOSTICS_CHANNELS]

// Pre-resolve channels — repeated string lookups would land on the hot path.
const channels = {
  connect: diagnosticsChannel.channel(DIAGNOSTICS_CHANNELS.connect),
  auth: diagnosticsChannel.channel(DIAGNOSTICS_CHANNELS.auth),
  commandSend: diagnosticsChannel.channel(DIAGNOSTICS_CHANNELS.commandSend),
  commandResolve: diagnosticsChannel.channel(
    DIAGNOSTICS_CHANNELS.commandResolve,
  ),
  event: diagnosticsChannel.channel(DIAGNOSTICS_CHANNELS.event),
  disconnect: diagnosticsChannel.channel(DIAGNOSTICS_CHANNELS.disconnect),
  backpressure: diagnosticsChannel.channel(DIAGNOSTICS_CHANNELS.backpressure),
  error: diagnosticsChannel.channel(DIAGNOSTICS_CHANNELS.error),
} as const

export interface ConnectPayload {
  url: string
  attempt: number
}
export interface AuthPayload {
  url: string
  result: 'ok' | 'error'
  reason?: string
}
export interface CommandSendPayload {
  url: string
  id: string
  cmd: string
  inFlight: number
}
export interface CommandResolvePayload {
  url: string
  id: string
  cmd: string
  ms: number
  success: boolean
  code?: string
}
export interface EventPayload {
  url: string
  name: string
}
export interface DisconnectPayload {
  url: string
  code: number
  reason: string
  willReconnect: boolean
}
export interface BackpressurePayload {
  url: string
  bufferedAmount: number
  writableLength: number
  action: 'reject' | 'terminate'
}
export interface ErrorPayload {
  url: string
  className: string
  code?: string
  message: string
}

export const publishConnect = (payload: ConnectPayload): void => {
  if (channels.connect.hasSubscribers) {
    channels.connect.publish(payload)
  }
}

export const publishAuth = (payload: AuthPayload): void => {
  if (channels.auth.hasSubscribers) {
    channels.auth.publish(payload)
  }
}

export const publishCommandSend = (payload: CommandSendPayload): void => {
  if (channels.commandSend.hasSubscribers) {
    channels.commandSend.publish(payload)
  }
}

export const publishCommandResolve = (
  payload: CommandResolvePayload,
): void => {
  if (channels.commandResolve.hasSubscribers) {
    channels.commandResolve.publish(payload)
  }
}

export const publishEvent = (payload: EventPayload): void => {
  if (channels.event.hasSubscribers) {
    channels.event.publish(payload)
  }
}

export const publishDisconnect = (payload: DisconnectPayload): void => {
  if (channels.disconnect.hasSubscribers) {
    channels.disconnect.publish(payload)
  }
}

export const publishBackpressure = (payload: BackpressurePayload): void => {
  if (channels.backpressure.hasSubscribers) {
    channels.backpressure.publish(payload)
  }
}

export const publishError = (payload: ErrorPayload): void => {
  if (channels.error.hasSubscribers) {
    channels.error.publish(payload)
  }
}
