import type {
  Transport,
  TransportFactory,
  TransportHandlers,
  TransportOptions,
} from '../../src/transport/ws-transport.js'

/**
 * In-memory transport for unit tests. Conforms to the Transport contract
 * but never touches a real socket — tests drive the "server side" via
 * simulateMessage / simulateClose / simulateError helpers.
 *
 * NOT production code. Lives under tests/ so it cannot be imported from
 * src/ files (the package boundary enforces this).
 */

export interface FakeTransport extends Transport {
  simulateOpen (): void
  simulateMessage (data: string): void
  simulateClose (code?: number, reason?: string): void
  simulateError (err: Error): void
  sent: string[]
  connectCalls: number
  closeCalls: number
  fail: Error | null
  bufferedAmountValue: number
  writableLengthValue: number
  tlsSessionValue: Buffer | undefined
}

export interface FakeTransportControls {
  transport: FakeTransport
  handlers: TransportHandlers
  options: TransportOptions
}

export interface FakeTransportRegistry {
  factory: TransportFactory
  instances: FakeTransportControls[]
  latest: () => FakeTransportControls
}

// Factory builder: returns a TransportFactory that records every instance
// it creates so tests can drive them. Use one registry per test.
export const createFakeTransportRegistry = (): FakeTransportRegistry => {
  const instances: FakeTransportControls[] = []

  const factory: TransportFactory = (options, handlers) => {
    let pendingConnect: { resolve: () => void, reject: (err: Error) => void } | null = null
    let isOpen = false
    const sent: string[] = []
    let connectCalls = 0
    let closeCalls = 0

    const fake: FakeTransport = {
      connect: () => {
        connectCalls += 1
        return new Promise((resolve, reject) => {
          pendingConnect = { resolve, reject }
          if (fake.fail !== null) {
            const err = fake.fail
            pendingConnect = null
            reject(err)
          }
        })
      },
      send: (data) => {
        if (!isOpen) {
          throw new Error('fake transport not open')
        }
        sent.push(data)
      },
      close: (code, reason) => {
        closeCalls += 1
        if (isOpen) {
          isOpen = false
          handlers.onClose(code ?? 1000, reason ?? '')
        }
      },
      get bufferedAmount () {
        return fake.bufferedAmountValue
      },
      get writableLength () {
        return fake.writableLengthValue
      },
      get tlsSession () {
        return fake.tlsSessionValue
      },

      // Test controls
      simulateOpen: () => {
        isOpen = true
        pendingConnect?.resolve()
        pendingConnect = null
      },
      simulateMessage: (data) => {
        handlers.onMessage(data)
      },
      simulateClose: (code, reason) => {
        isOpen = false
        handlers.onClose(code ?? 1006, reason ?? '')
      },
      simulateError: (err) => {
        if (pendingConnect !== null) {
          pendingConnect.reject(err)
          pendingConnect = null
          return
        }
        handlers.onError(err)
      },
      sent,
      get connectCalls () {
        return connectCalls
      },
      get closeCalls () {
        return closeCalls
      },
      fail: null,
      bufferedAmountValue: 0,
      writableLengthValue: 0,
      tlsSessionValue: undefined,
    } as FakeTransport

    instances.push({ transport: fake, handlers, options })
    return fake
  }

  return {
    factory,
    instances,
    latest: () => {
      const last = instances[instances.length - 1]
      if (last === undefined) {
        throw new Error('no fake transport instances created yet')
      }
      return last
    },
  }
}
