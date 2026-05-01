import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  createSingleKeyEncrypter,
  loadMasterKeyFromEnv,
} from '../src/crypto.js'

describe('createSingleKeyEncrypter', () => {
  const key = randomBytes(32)
  const encrypter = createSingleKeyEncrypter(key)

  it('round-trips user-scoped plaintext', () => {
    const plain = 'totp-seed-abc123'
    const encrypted = encrypter.encryptUserScoped(plain)
    expect(encrypted).not.toBe(plain)
    expect(encrypter.decryptUserScoped(encrypted)).toBe(plain)
  })

  it('round-trips tenant-scoped plaintext', () => {
    const plain = 'rcon-password-xyz'
    const encrypted = encrypter.encryptTenantScoped('tenant-1', plain)
    expect(encrypter.decryptTenantScoped('tenant-1', encrypted)).toBe(plain)
  })

  it('produces a different ciphertext on each call (random nonce)', () => {
    const plain = 'same-input'
    const a = encrypter.encryptUserScoped(plain)
    const b = encrypter.encryptUserScoped(plain)
    expect(a).not.toBe(b)
  })

  it('uses the v1: prefix on output', () => {
    const out = encrypter.encryptUserScoped('hi')
    expect(out.startsWith('v1:')).toBe(true)
  })

  it('rejects ciphertext with the wrong prefix', () => {
    const out = encrypter.encryptUserScoped('hi').replace(/^v1:/, 'v2:')
    expect(() => { return encrypter.decryptUserScoped(out) }).toThrow(/prefix/)
  })

  it('rejects malformed ciphertext (missing colons)', () => {
    expect(() => { return encrypter.decryptUserScoped('not-valid') }).toThrow(
      /malformed/,
    )
  })

  it('rejects tampered ciphertext via the auth tag', () => {
    const enc = encrypter.encryptUserScoped('hello')
    // Flip a byte in the payload.
    const idx2 = enc.lastIndexOf(':')
    const payload = Buffer.from(enc.slice(idx2 + 1), 'base64')
    payload[0] = (payload[0] ?? 0) ^ 0xff
    const tampered = `${ enc.slice(0, idx2 + 1) }${ payload.toString('base64') }`
    expect(() => { return encrypter.decryptUserScoped(tampered) }).toThrow()
  })

  it('rejects keys that are not 32 bytes', () => {
    expect(() => { return createSingleKeyEncrypter(randomBytes(16)) }).toThrow(
      /32 bytes/,
    )
  })
})

describe('loadMasterKeyFromEnv', () => {
  it('decodes a valid base64 32-byte key', () => {
    const raw = randomBytes(32)
    const env = raw.toString('base64')
    const loaded = loadMasterKeyFromEnv(env)
    expect(loaded.equals(raw)).toBe(true)
  })

  it('throws when the env value is missing', () => {
    expect(() => { return loadMasterKeyFromEnv(undefined) }).toThrow(
      /not set/,
    )
  })

  it('throws when the decoded length is wrong', () => {
    const env = randomBytes(16).toString('base64')
    expect(() => { return loadMasterKeyFromEnv(env) }).toThrow(/32 bytes/)
  })
})
