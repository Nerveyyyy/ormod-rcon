import {
  RconOverloadError,
  RconTransportError,
} from '../protocol/errors.js'
import type { Transport } from '../transport/ws-transport.js'
import { publishBackpressure } from '../telemetry/diagnostics.js'

// Effective bytes = ws.bufferedAmount + node socket writableLength. The first
// alone misses kernel-side queue growth, which is why we sum both.

export interface FlowControlLimits {
  maxBufferedAmountBytes: number
  highWaterMarkSeconds: number
}

export const DEFAULT_FLOW_CONTROL_LIMITS: FlowControlLimits = {
  maxBufferedAmountBytes: 262_144,
  highWaterMarkSeconds: 5,
}

export interface FlowControlOptions {
  limits?: Partial<FlowControlLimits>
  onTerminate: (err: Error) => void
  url: string
}

export interface FlowControl {
  // Sends a command frame through the transport, gated by the buffered-amount
  // cap and the high-water timer. Throws RconOverloadError on reject or on
  // saturation; saturation also invokes onTerminate before throwing so the
  // orchestrator can tear the connection down.
  //
  // Lifecycle frames (auth, ping) bypass this guard intentionally — they call
  // transport.send() directly from their owning modules.
  send (transport: Transport, encoded: string): void
  reset (): void
}

export const createFlowControl = (
  options: FlowControlOptions,
): FlowControl => {
  const { onTerminate, url } = options
  const limits: FlowControlLimits = {
    maxBufferedAmountBytes:
      options.limits?.maxBufferedAmountBytes
      ?? DEFAULT_FLOW_CONTROL_LIMITS.maxBufferedAmountBytes,
    highWaterMarkSeconds:
      options.limits?.highWaterMarkSeconds
      ?? DEFAULT_FLOW_CONTROL_LIMITS.highWaterMarkSeconds,
  }
  let highWaterSince: number | null = null

  return {
    send: (transport, encoded) => {
      const now = Date.now()
      const bufferedAmount = transport.bufferedAmount
      const writableLength = transport.writableLength
      const effective = bufferedAmount + writableLength

      // Track the high-water timer regardless of whether we're about to
      // reject. This way a buffer that hovers above the cap still ages the
      // timer; once it eventually drops below the cap, terminate can fire
      // immediately on the long stuck duration.
      if (effective === 0) {
        highWaterSince = null
      } else if (highWaterSince === null) {
        highWaterSince = now
      }

      if (effective > limits.maxBufferedAmountBytes) {
        publishBackpressure({
          url,
          bufferedAmount,
          writableLength,
          action: 'reject',
        })
        throw new RconOverloadError(
          `buffered amount ${ effective } exceeds cap`,
          'buffered_amount',
        )
      }

      const overHighWater =
        highWaterSince !== null
        && effective > 0
        && now - highWaterSince > limits.highWaterMarkSeconds * 1000

      if (overHighWater) {
        publishBackpressure({
          url,
          bufferedAmount,
          writableLength,
          action: 'terminate',
        })
        onTerminate(
          new RconTransportError(
            'high-water mark exceeded',
            'socket_closed',
          ),
        )
        throw new RconOverloadError(
          'connection saturated — terminated',
          'buffered_amount',
        )
      }

      transport.send(encoded)
    },

    reset: () => {
      highWaterSince = null
    },
  }
}
