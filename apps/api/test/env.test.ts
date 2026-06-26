import Fastify from 'fastify'
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import env, { autoConfig } from '../src/plugins/env.js'

const REQUIRED = {
  DATABASE_URL: 'postgres://localhost:5432/x',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  ORMOD_SECRET_KEY: 'x',
  REDIS_URL: 'redis://localhost:6379',
}

let saved: NodeJS.ProcessEnv

const build = async () => {
  const app = Fastify().withTypeProvider<TypeBoxTypeProvider>()
  await app.register(env, autoConfig())
  await app.ready()
  return app
}

describe('env config', () => {
  beforeEach(() => {
    saved = { ...process.env }
    Object.assign(process.env, REQUIRED)
    delete process.env.WEB_ORIGIN
  })

  afterEach(() => {
    process.env = saved
  })

  it('applies server and public-url defaults', async () => {
    const app = await build()
    expect(app.config.HOST).toBe('0.0.0.0')
    expect(app.config.PORT).toBe(3000)
    expect(app.config.PUBLIC_URL).toBe('http://localhost:3000')
    await app.close()
  })

  it('leaves WEB_ORIGIN unset by default and reads it when present', async () => {
    const first = await build()
    expect(first.config.WEB_ORIGIN).toBeUndefined()
    await first.close()

    process.env.WEB_ORIGIN = 'https://app.example.com'
    const second = await build()
    expect(second.config.WEB_ORIGIN).toBe('https://app.example.com')
    await second.close()
  })

  it('drops the removed knobs from config', async () => {
    process.env.CORS_ORIGIN = 'http://nope'
    process.env.RATE_LIMIT_MAX = '5'
    const app = await build()
    expect(app.config).not.toHaveProperty('CORS_ORIGIN')
    expect(app.config).not.toHaveProperty('SERVE_WEB_DIR')
    expect(app.config).not.toHaveProperty('RATE_LIMIT_MAX')
    await app.close()
  })
})
