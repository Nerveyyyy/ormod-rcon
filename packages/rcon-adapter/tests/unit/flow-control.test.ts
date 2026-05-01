import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFlowControl } from '../../src/client/flow-control.js'
import {
  RconOverloadError,
  RconTransportError,
} from '../../src/protocol/errors.js'
import type { Transport } from '../../src/transport/ws-transport.js'

interface StubTransport extends Transport {
  sent: string[]
  buffered: number
  writable: number
}

const makeStubTransport = (): StubTransport => {
  const stub: StubTransport = {
    connect: () => {
      return Promise.resolve()
    },
    send: (data: string) => {
      stub.sent.push(data)
    },
    close: () => {},
    get bufferedAmount () {
      return stub.buffered
    },
    get writableLength () {
      return stub.writable
    },
    get tlsSession () {
      return undefined
    },
    sent: [],
    buffered: 0,
    writable: 0,
  }
  return stub
}

describe('flow-control', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('passes through to transport.send when buffered stays below cap', () => {
    const transport = makeStubTransport()
    transport.buffered = 500
    transport.writable = 200
    const fc = createFlowControl({
      limits: { maxBufferedAmountBytes: 1_000, highWaterMarkSeconds: 5 },
      onTerminate: vi.fn(),
      url: 'ws://test',
    })
    fc.send(transport, 'frame1')
    expect(transport.sent).toEqual([ 'frame1' ])
  })

  it('throws RconOverloadError when bufferedAmount + writableLength exceeds cap', () => {
    const transport = makeStubTransport()
    transport.buffered = 600
    transport.writable = 500
    const onTerminate = vi.fn()
    const fc = createFlowControl({
      limits: { maxBufferedAmountBytes: 1_000, highWaterMarkSeconds: 5 },
      onTerminate,
      url: 'ws://test',
    })
    expect(() => {
      return fc.send(transport, 'frame')
    }).toThrow(RconOverloadError)
    expect(transport.sent).toEqual([])
    expect(onTerminate).not.toHaveBeenCalled()
  })

  it('terminates when buffered stays non-zero past highWaterMarkSeconds', () => {
    const transport = makeStubTransport()
    transport.buffered = 100
    const onTerminate = vi.fn()
    const fc = createFlowControl({
      limits: { maxBufferedAmountBytes: 10_000, highWaterMarkSeconds: 5 },
      onTerminate,
      url: 'ws://test',
    })
    fc.send(transport, 'frame1')
    vi.advanceTimersByTime(3_000)
    fc.send(transport, 'frame2')
    expect(onTerminate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(3_000) // total 6s past first non-empty observation
    expect(() => {
      return fc.send(transport, 'frame3')
    }).toThrow(RconOverloadError)
    expect(onTerminate).toHaveBeenCalledTimes(1)
    const passedErr = onTerminate.mock.calls[0]?.[0]
    expect(passedErr).toBeInstanceOf(RconTransportError)
  })

  it('resets the high-water timer when buffer drains to zero', () => {
    const transport = makeStubTransport()
    transport.buffered = 100
    const onTerminate = vi.fn()
    const fc = createFlowControl({
      limits: { maxBufferedAmountBytes: 10_000, highWaterMarkSeconds: 5 },
      onTerminate,
      url: 'ws://test',
    })
    fc.send(transport, 'frame1')
    vi.advanceTimersByTime(3_000)
    transport.buffered = 0
    fc.send(transport, 'drained')
    transport.buffered = 50
    vi.advanceTimersByTime(2_000)
    fc.send(transport, 'frame3')
    vi.advanceTimersByTime(4_000)
    fc.send(transport, 'frame4')
    expect(onTerminate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2_000)
    expect(() => {
      return fc.send(transport, 'frame5')
    }).toThrow(RconOverloadError)
    expect(onTerminate).toHaveBeenCalledTimes(1)
  })

  it('reset() clears high-water tracking', () => {
    const transport = makeStubTransport()
    transport.buffered = 100
    const onTerminate = vi.fn()
    const fc = createFlowControl({
      limits: { maxBufferedAmountBytes: 10_000, highWaterMarkSeconds: 5 },
      onTerminate,
      url: 'ws://test',
    })
    fc.send(transport, 'frame1')
    vi.advanceTimersByTime(4_000)
    fc.reset()
    fc.send(transport, 'frame2')
    vi.advanceTimersByTime(4_000)
    fc.send(transport, 'frame3')
    expect(onTerminate).not.toHaveBeenCalled()
  })

  it('does not terminate while the buffer is empty', () => {
    const transport = makeStubTransport()
    const onTerminate = vi.fn()
    const fc = createFlowControl({
      limits: { maxBufferedAmountBytes: 10_000, highWaterMarkSeconds: 5 },
      onTerminate,
      url: 'ws://test',
    })
    fc.send(transport, 'frame')
    vi.advanceTimersByTime(60_000)
    fc.send(transport, 'frame')
    expect(onTerminate).not.toHaveBeenCalled()
  })

  it('reject preempts terminate when buffered exceeds cap past the high-water threshold', () => {
    // The orchestrator preferences reject over terminate. This is asserted
    // here — even after the high-water timer has aged past the threshold,
    // a buffer above the cap surfaces as RconOverloadError(reject), not as
    // an onTerminate call.
    const transport = makeStubTransport()
    transport.buffered = 100
    const onTerminate = vi.fn()
    const fc = createFlowControl({
      limits: { maxBufferedAmountBytes: 1_000, highWaterMarkSeconds: 5 },
      onTerminate,
      url: 'ws://test',
    })
    fc.send(transport, 'frame1')
    vi.advanceTimersByTime(6_000)
    transport.buffered = 1_500
    expect(() => {
      return fc.send(transport, 'frame2')
    }).toThrow(/exceeds cap/)
    expect(onTerminate).not.toHaveBeenCalled()
  })

})
