import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Pluggable encryption seam. Services receive an encrypter via context and
 * don't touch key material directly. Tests can inject a stub; alternate
 * implementations can layer scoped key strategies on top of the same
 * interface without call sites changing.
 *
 * Methods are scoped so implementations can route user-owned secrets
 * (e.g. TOTP seeds) and tenant-owned secrets (e.g. RCON passwords) through
 * different key material if desired. The default implementation below
 * uses one master key for both.
 */
export interface SecretEncrypter {
  encryptUserScoped (plaintext: string): string
  decryptUserScoped (ciphertext: string): string
  encryptTenantScoped (tenantId: string, plaintext: string): string
  decryptTenantScoped (tenantId: string, ciphertext: string): string
}

const ALGO = 'aes-256-gcm'
const KEY_LEN_BYTES = 32
const NONCE_LEN_BYTES = 12
const TAG_LEN_BYTES = 16
const CIPHERTEXT_VERSION = 'v1'

const encryptWithKey = (
  key: Buffer,
  prefix: string,
  plaintext: string,
): string => {
  const nonce = randomBytes(NONCE_LEN_BYTES)
  const cipher = createCipheriv(ALGO, key, nonce)
  const enc = Buffer.concat([ cipher.update(plaintext, 'utf8'), cipher.final() ])
  const tag = cipher.getAuthTag()
  const payload = Buffer.concat([ enc, tag ]).toString('base64')
  return `${ prefix }:${ nonce.toString('base64') }:${ payload }`
}

const decryptWithKey = (
  key: Buffer,
  expectedPrefix: string,
  encoded: string,
): string => {
  const idx1 = encoded.indexOf(':')
  const idx2 = encoded.indexOf(':', idx1 + 1)
  if (idx1 === -1 || idx2 === -1) {
    throw new Error('malformed ciphertext: expected 3 colon-delimited parts')
  }
  const prefix = encoded.slice(0, idx1)
  const nonceB64 = encoded.slice(idx1 + 1, idx2)
  const payloadB64 = encoded.slice(idx2 + 1)
  if (prefix !== expectedPrefix) {
    throw new Error(
      `ciphertext prefix mismatch: expected ${ expectedPrefix }, got ${ prefix }`,
    )
  }
  const nonce = Buffer.from(nonceB64, 'base64')
  const payload = Buffer.from(payloadB64, 'base64')
  const ct = payload.subarray(0, payload.length - TAG_LEN_BYTES)
  const tag = payload.subarray(payload.length - TAG_LEN_BYTES)
  const decipher = createDecipheriv(ALGO, key, nonce)
  decipher.setAuthTag(tag)
  return Buffer.concat([ decipher.update(ct), decipher.final() ]).toString('utf8')
}

/**
 * AES-256-GCM with a single master key. Both scoped methods encrypt with
 * the same key; the tenant-id argument is accepted for interface symmetry
 * and ignored. Ciphertext format: `v1:<base64 nonce>:<base64 ciphertext+tag>`.
 * The version prefix leaves room for a future algorithm change without
 * forcing a schema migration.
 */
export const createSingleKeyEncrypter = (masterKey: Buffer): SecretEncrypter => {
  if (masterKey.length !== KEY_LEN_BYTES) {
    throw new Error(
      `master key must be ${ KEY_LEN_BYTES } bytes (got ${ masterKey.length })`,
    )
  }
  const encrypt = (plaintext: string): string => {
    return encryptWithKey(masterKey, CIPHERTEXT_VERSION, plaintext)
  }
  const decrypt = (ciphertext: string): string => {
    return decryptWithKey(masterKey, CIPHERTEXT_VERSION, ciphertext)
  }
  return {
    encryptUserScoped: encrypt,
    decryptUserScoped: decrypt,
    encryptTenantScoped: (_tenantId, plaintext) => {
      return encrypt(plaintext)
    },
    decryptTenantScoped: (_tenantId, ciphertext) => {
      return decrypt(ciphertext)
    },
  }
}

/**
 * Parse ORMOD_SECRET_KEY (base64) into a Buffer, validating length.
 * Throws if missing or wrong length — call this at boot, fail fast.
 * Generate a key with: openssl rand -base64 32
 */
export const loadMasterKeyFromEnv = (envValue: string | undefined): Buffer => {
  if (!envValue) {
    throw new Error('ORMOD_SECRET_KEY is not set')
  }
  const key = Buffer.from(envValue, 'base64')
  if (key.length !== KEY_LEN_BYTES) {
    throw new Error(
      `ORMOD_SECRET_KEY must decode to ${ KEY_LEN_BYTES } bytes; got ${ key.length }. Regenerate with: openssl rand -base64 32`,
    )
  }
  return key
}