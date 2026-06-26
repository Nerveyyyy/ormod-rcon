import { type Redis, Redis as RedisClient } from 'ioredis'
import type { RedisOptions } from 'ioredis'

export type { Redis, RedisOptions }

export interface RedisHandle {
  client: Redis
  close: () => Promise<void>
}

export interface CreateRedisOptions extends RedisOptions {
  onError?: (err: Error) => void
}

export const createRedisClient = (
  url: string,
  options: CreateRedisOptions = {}
): RedisHandle => {
  const { onError, ...redisOptions } = options
  const client = new RedisClient(url, redisOptions)
  client.on('error', (err) => {
    onError?.(err)
  })

  return {
    client,
    close: async () => {
      await client.quit()
    },
  }
}
