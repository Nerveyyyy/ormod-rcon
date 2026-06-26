import { describe, expect, it } from 'vitest'
import {
  API_KEY_RATE_LIMIT,
  authBaseOptions,
  authPlugins,
} from '../src/createAuth.js'

describe('auth config', () => {
  it('enables email and password', () => {
    expect(authBaseOptions.emailAndPassword.enabled).toBe(true)
  })

  it('generates uuidv7 string ids', () => {
    const id = authBaseOptions.advanced.database.generateId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/)
  })

  it('includes organization and two-factor, not admin', () => {
    const ids = authPlugins().map((p) => p.id)
    expect(ids).toContain('organization')
    expect(ids).toContain('two-factor')
    expect(ids).not.toContain('admin')
  })

  it('adds captcha only when configured', () => {
    expect(authPlugins().map((p) => p.id)).not.toContain('captcha')
    const ids = authPlugins({
      provider: 'cloudflare-turnstile',
      secretKey: 'test',
    }).map((p) => p.id)
    expect(ids).toContain('captcha')
  })

  it('pins the global auth rate limit', () => {
    expect(authBaseOptions.rateLimit.window).toBe(60)
    expect(authBaseOptions.rateLimit.max).toBe(100)
  })

  it('gives api keys 600 requests per minute', () => {
    expect(API_KEY_RATE_LIMIT.timeWindow).toBe(60_000)
    expect(API_KEY_RATE_LIMIT.maxRequests).toBe(600)
  })

  it('closes public sign-up', () => {
    expect(authBaseOptions.emailAndPassword.disableSignUp).toBe(true)
  })

  it('declares the mustChangePassword field, not client-settable', () => {
    const field = authBaseOptions.account.additionalFields.mustChangePassword
    expect(field.type).toBe('boolean')
    expect(field.input).toBe(false)
    expect(field.defaultValue).toBe(false)
  })
})
