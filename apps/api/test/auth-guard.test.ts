import { describe, expect, it } from 'vitest'
import { isPublicPath } from '../src/plugins/app/is-public-path.js'

describe('isPublicPath', () => {
  it('treats non-api paths as public', () => {
    expect(isPublicPath('/health')).toBe(true)
    expect(isPublicPath('/docs')).toBe(true)
    expect(isPublicPath('/')).toBe(true)
  })

  it('treats the auth handler as public', () => {
    expect(isPublicPath('/api/auth/sign-in/email')).toBe(true)
  })

  it('protects other api paths, ignoring the query string', () => {
    expect(isPublicPath('/api/servers')).toBe(false)
    expect(isPublicPath('/api/servers?limit=20')).toBe(false)
  })
})
