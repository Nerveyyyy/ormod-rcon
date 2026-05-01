import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createFakeServer, type FakeServer } from '../helpers/fake-server.js'
import { waitForState } from '../helpers/wait-for.js'
import { RconClient } from '../../src/index.js'

/**
 * Verifies TLS session-ticket reuse across reconnects. When the adapter
 * captures the negotiated session from the initial wss handshake and
 * presents it on the subsequent reconnect, the server's TLS layer reports
 * `isSessionReused()` === true for the second handshake.
 *
 * If this test fails, either the adapter's TLS config shape differs from
 * what this file assumes, or session-ticket reuse is not wired into the
 * reconnect loop. Both failure modes are useful diagnostic signal — the
 * unit test suite has no TLS coverage so this file is the first place
 * that failure surfaces.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const TLS_DIR = join(HERE, '..', 'fixtures', 'tls')
const CERT = readFileSync(join(TLS_DIR, 'cert.pem'))
const KEY = readFileSync(join(TLS_DIR, 'key.pem'))

describe('rcon-adapter · TLS session reuse', () => {
  let server: FakeServer
  let client: RconClient | null = null

  beforeEach(async () => {
    server = await createFakeServer({
      secret: 'ok',
      tls: { cert: CERT, key: KEY },
    })
  })

  afterEach(async () => {
    await client?.close()
    client = null
    await server.close()
  })

  it('resumes the TLS session on reconnect after server disconnects', async () => {
    // Safety net: if a future regression breaks the TLS handshake, the
    // adapter retries every 20ms and fast handshake errors can leak
    // enough per-attempt state to OOM the process. A 5s abort bounds it.
    const ctrl = new AbortController()
    const stopTimer = setTimeout(() => {
      return ctrl.abort()
    }, 5_000)

    client = new RconClient({
      url: server.url,
      secret: 'ok',
      reconnect: {
        enabled: true,
        initialDelayMs: 20,
        maxDelayMs: 100,
        jitter: 0,
      },
      signal: ctrl.signal,
      // Pin the self-signed cert as its own CA so TLS validation passes
      // without relaxing rejectUnauthorized. Same pattern a private-PKI
      // deployment would use against its own root.
      tls: { ca: CERT },
    })
    try {
      await client.connect()
      expect(client.state.kind).toBe('ready')
      // First handshake establishes the session — no prior session to
      // resume, so the counter must still be zero.
      expect(server.tlsResumptionCount()).toBe(0)

      // Force the server to drop the socket so the adapter's reconnect
      // loop kicks in.
      server.disconnectAll(1011, 'force reconnect')
      await waitForState(client, [ 'reconnecting' ])
      await waitForState(client, [ 'ready' ])

      // The reconnect handshake should be a session-ticket resumption,
      // not a fresh TLS negotiation.
      expect(server.tlsResumptionCount()).toBe(1)
    } finally {
      clearTimeout(stopTimer)
    }
  })
})
