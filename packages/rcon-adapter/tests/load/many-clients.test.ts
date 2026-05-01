import { describe, it, expect } from 'vitest'
import { performance, monitorEventLoopDelay } from 'node:perf_hooks'
import { createFakeServer } from '../helpers/fake-server.js'
import {
  RconClient,
  type RconEvent,
} from '../../src/index.js'
import { KEEPALIVE_INTERVAL_MS } from '../../src/client/keepalive.js'

/**
 * Scale validation for RconClient. Spins up N instances against a
 * single in-process fake-server, sustains a broadcast event rate for a
 * short window, and asserts that:
 *
 *  - every client reaches `ready`
 *  - aggregate event delivery is lossless
 *  - per-event latency p99 stays inside a generous CI-friendly bound
 *  - event-loop lag does not spike into problematic territory
 *  - keepalive fan-in is observable when the test window spans at least
 *    one KEEPALIVE_INTERVAL_MS — serves as a black-box "the scheduler is
 *    running" check; the shared-timer invariant is asserted directly in
 *    the keepalive unit test.
 *
 * Targeted ceiling for this test is 1k clients at 100 broadcast events/s
 * — the realistic upper bound for a single process. Defaults stay small
 * so CI runs fast; crank the env vars when doing a scale dry-run.
 *
 * This test is scaffolding — it validates the architecture of the
 * single-client primitive under concurrent load. It is NOT a pool
 * abstraction. Safe to delete before release if not wanted in CI.
 *
 * Tune via env vars when debugging:
 *   RCON_LOAD_CLIENTS        (default 50, realistic ceiling 1000)
 *   RCON_LOAD_EVENTS_PER_SEC (default 40, realistic ceiling 100)
 *   RCON_LOAD_DURATION_MS    (default 2000; set ≥ KEEPALIVE_INTERVAL_MS
 *                             to also exercise the keepalive fan-in)
 */

describe('load · many clients', () => {
  it(
    'sustains broadcast event throughput across many clients',
    async () => {
      const N = Number(process.env.RCON_LOAD_CLIENTS ?? '50')
      const EVENTS_PER_SEC = Number(
        process.env.RCON_LOAD_EVENTS_PER_SEC ?? '40',
      )
      const DURATION_MS = Number(process.env.RCON_LOAD_DURATION_MS ?? '2000')

      const server = await createFakeServer({ secret: 'load' })
      const clients: RconClient[] = []
      let received = 0
      // Bound latency samples at the 1k/100 ceiling — a full-scale run
      // produces ~1000 × 100/s × duration events; keep ~50k samples so
      // the p99 is still representative without blowing memory.
      const LATENCY_SAMPLE_CAP = 50_000
      const latencies: number[] = []
      let latencyCounter = 0
      let latencySampleEvery = 1

      const histogram = monitorEventLoopDelay({ resolution: 10 })
      histogram.enable()

      const onEvent = (event: RconEvent): void => {
        received += 1
        const body = event as Record<string, unknown>
        if (typeof body.sentAt === 'number') {
          latencyCounter += 1
          if (latencyCounter % latencySampleEvery === 0) {
            latencies.push(performance.now() - body.sentAt)
            if (latencies.length > LATENCY_SAMPLE_CAP) {
              // Thin the reservoir: drop every other point and double the
              // sampling rate from here on. Biased slightly toward later
              // samples, but that's acceptable for a sanity p99 check.
              for (let i = latencies.length - 1; i >= 0; i -= 2) {
                latencies.splice(i, 1)
              }
              latencySampleEvery *= 2
            }
          }
        }
      }

      for (let i = 0; i < N; i += 1) {
        const c = new RconClient({
          url: server.url,
          secret: 'load',
          reconnect: { enabled: false },
        })
        c.on('gameEvent', onEvent)
        clients.push(c)
      }

      // Stagger connects in batches so the WebSocketServer listen backlog
      // doesn't overflow under high N. Real deployments connect to N
      // different servers so this isn't a production concern — test-only
      // pacing.
      const connectStart = performance.now()
      const BATCH = 50
      for (let i = 0; i < clients.length; i += BATCH) {
        const batch = clients.slice(i, i + BATCH)
        await Promise.all(batch.map((c) => {
          return c.connect()
        }))
      }
      const connectMs = performance.now() - connectStart
      // Scale the auth-wait budget with client count — ~10ms per client
      // plus a floor. 1k clients → ~30s ceiling, plenty of slack.
      await server.waitForAuthenticated(N, Math.max(30_000, N * 10))

      // No keepalive interval has fired yet — scheduler is armed but has
      // not yet ticked, so the server has received zero pings.
      expect(server.pingCount()).toBe(0)

      // Fire broadcast events at the configured rate. Each event fans out
      // to every authenticated client, so per-tick receive volume is
      // events-per-tick × N.
      const tickMs = 20
      const ticks = Math.floor(DURATION_MS / tickMs)
      const eventsPerTick = Math.max(
        1,
        Math.round((EVENTS_PER_SEC * tickMs) / 1000),
      )
      let fired = 0
      const fireStart = performance.now()
      for (let t = 0; t < ticks; t += 1) {
        for (let i = 0; i < eventsPerTick; i += 1) {
          server.sendEvent({ name: 'load.tick', sentAt: performance.now() })
          fired += 1
        }
        await new Promise((r) => {
          return setTimeout(r, tickMs)
        })
      }
      const fireMs = performance.now() - fireStart

      // Allow receivers to drain.
      await new Promise((r) => {
        return setTimeout(r, 250)
      })
      histogram.disable()

      const expected = fired * N
      const loopLagP99Ms = histogram.percentile(99) / 1e6
      latencies.sort((a, b) => {
        return a - b
      })
      const p99Latency = latencies.length > 0
        ? (latencies[Math.floor(latencies.length * 0.99)] as number)
        : 0
      const pings = server.pingCount()

      // Log for visibility even when thresholds pass.
      console.log(
        `[load] clients=${ N } connectMs=${ connectMs.toFixed(0) } `
          + `fired=${ fired } received=${ received } expected=${ expected } `
          + `fireMs=${ fireMs.toFixed(0) } latencyP99=${ p99Latency.toFixed(1) }ms `
          + `loopLagP99=${ loopLagP99Ms.toFixed(1) }ms pings=${ pings }`,
      )

      // Lossless broadcast: every event reached every authenticated client.
      expect(received).toBe(expected)

      // Generous bounds — a CI machine under load can jitter. The unit
      // tests already lock the internal mechanics; this is a sanity floor.
      expect(p99Latency).toBeLessThan(500)
      expect(loopLagP99Ms).toBeLessThan(250)

      // Black-box keepalive check: when the run spans a full interval,
      // we expect every authenticated client to have pinged at least
      // once. No assertion is made about timer sharing — the unit test
      // covers that directly; here we just verify the scheduler actually
      // fires under load.
      if (DURATION_MS >= KEEPALIVE_INTERVAL_MS) {
        expect(pings).toBeGreaterThanOrEqual(N)
      }

      // Close in batches too — a plain Promise.all on 1k clients floods
      // the event loop with 1k simultaneous close handshakes.
      for (let i = 0; i < clients.length; i += BATCH) {
        const batch = clients.slice(i, i + BATCH)
        await Promise.all(batch.map((c) => {
          return c.close()
        }))
      }
      await server.close()
    },
    120_000,
  )
})