import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import staticPlugin from '../src/plugins/app/static.js'

describe('static plugin', () => {
  it('marks serveWeb false when no built web dir is present', async () => {
    const app = Fastify()
    await app.register(staticPlugin)
    await app.ready()
    expect(app.serveWeb).toBe(false)
    await app.close()
  })
})
