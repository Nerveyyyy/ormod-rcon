import type { FastifyRequest } from 'fastify'
import { describe, expect, it } from 'vitest'
import { rateLimitOptions } from '../src/plugins/external/rate-limit.js'

describe('rateLimitOptions', () => {
  it('caps at 600 per minute with no proxy header', () => {
    const opts = rateLimitOptions(undefined)
    expect(opts.max).toBe(600)
    expect(opts.timeWindow).toBe('1 minute')
    expect(opts.keyGenerator).toBeUndefined()
  })

  it('keys on the trusted header, taking the first hop', () => {
    const opts = rateLimitOptions('CF-Connecting-IP')
    expect(typeof opts.keyGenerator).toBe('function')
    const request = {
      headers: { 'cf-connecting-ip': '1.1.1.1, 2.2.2.2' },
      ip: '10.0.0.1',
    } as unknown as FastifyRequest
    expect(opts.keyGenerator?.(request)).toBe('1.1.1.1')
  })
})
