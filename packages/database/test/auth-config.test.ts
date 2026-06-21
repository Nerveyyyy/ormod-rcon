import { describe, expect, it } from 'vitest'
import { authBaseOptions, authPlugins } from '../src/auth/config.js'

describe('auth config', () => {
  it('enables email and password', () => {
    expect(authBaseOptions.emailAndPassword.enabled).toBe(true)
  })

  it('generates uuidv7 string ids', () => {
    const id = authBaseOptions.advanced.database.generateId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/)
  })

  it('includes organization and two-factor, not admin', () => {
    const ids = authPlugins.map((p) => p.id)
    expect(ids).toContain('organization')
    expect(ids).toContain('two-factor')
    expect(ids).not.toContain('admin')
  })
})
