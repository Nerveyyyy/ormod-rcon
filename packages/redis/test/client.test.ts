import { describe, expect, it, vi } from 'vitest'
import { createRedisClient } from '../src/client.js'

describe('createRedisClient', () => {
  it('forwards client errors to the onError handler', async () => {
    const onError = vi.fn()
    const { client, close } = createRedisClient('redis://127.0.0.1:6390', {
      lazyConnect: true,
      onError,
    })
    const err = new Error('boom')
    client.emit('error', err)
    expect(onError).toHaveBeenCalledWith(err)
    await close()
  })

  it('attaches an error listener so an error event never crashes', async () => {
    const { client, close } = createRedisClient('redis://127.0.0.1:6390', {
      lazyConnect: true,
    })
    expect(() => {
      return client.emit('error', new Error('boom'))
    }).not.toThrow()
    await close()
  })
})
