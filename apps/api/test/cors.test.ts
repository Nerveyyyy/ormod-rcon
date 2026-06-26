import type { FastifyInstance } from 'fastify'
import { describe, expect, it } from 'vitest'
import { autoConfig } from '../src/plugins/external/cors.js'

const fake = (config: Record<string, unknown>): FastifyInstance => {
  return { config } as unknown as FastifyInstance
}

describe('cors autoConfig', () => {
  it('allows just the public url by default', () => {
    const opts = autoConfig(fake({ PUBLIC_URL: 'http://localhost:3000' }))
    expect(opts.origin).toEqual(['http://localhost:3000'])
    expect(opts.credentials).toBe(true)
  })

  it('adds the web origin when set', () => {
    const opts = autoConfig(
      fake({
        PUBLIC_URL: 'https://api.example.com',
        WEB_ORIGIN: 'https://app.example.com',
      })
    )
    expect(opts.origin).toEqual([
      'https://api.example.com',
      'https://app.example.com',
    ])
  })
})
