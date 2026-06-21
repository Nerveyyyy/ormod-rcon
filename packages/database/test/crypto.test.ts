import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createSingleKeyEncrypter,
  loadMasterKeyFromEnv,
} from '../src/crypto.js'

const key = randomBytes(32)

describe('SecretEncrypter', () => {
  it('round-trips user-scoped secrets', () => {
    const enc = createSingleKeyEncrypter(key)
    const ct = enc.encryptUserScoped('totp-seed')
    expect(ct).not.toBe('totp-seed')
    expect(enc.decryptUserScoped(ct)).toBe('totp-seed')
  })

  it('round-trips tenant-scoped secrets', () => {
    const enc = createSingleKeyEncrypter(key)
    const ct = enc.encryptTenantScoped('tenant-1', 'rcon-pw')
    expect(enc.decryptTenantScoped('tenant-1', ct)).toBe('rcon-pw')
  })

  it('uses the versioned ciphertext format', () => {
    const enc = createSingleKeyEncrypter(key)
    expect(enc.encryptUserScoped('x').startsWith('v1:')).toBe(true)
  })

  it('fails to decrypt tampered ciphertext', () => {
    const enc = createSingleKeyEncrypter(key)
    const ct = enc.encryptUserScoped('secret')
    const tampered = `${ct.slice(0, -2)}AA`
    expect(() => enc.decryptUserScoped(tampered)).toThrow()
  })

  it('rejects a wrong-length master key', () => {
    expect(() => {
      loadMasterKeyFromEnv(randomBytes(16).toString('base64'))
    }).toThrow(/32 bytes/)
  })

  it('loads a valid base64 key', () => {
    const loaded = loadMasterKeyFromEnv(randomBytes(32).toString('base64'))
    expect(loaded.length).toBe(32)
  })

  it('rejects ciphertext with a too-short payload', () => {
    const enc = createSingleKeyEncrypter(key)
    expect(() => enc.decryptUserScoped('v1:AAAA:AAAA')).toThrow(
      /payload too short/
    )
  })
})
