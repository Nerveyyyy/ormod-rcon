import { describe, expect, it } from 'vitest'
import { createDatabase } from '../src/client.js'

describe('createDatabase', () => {
  it('throws a clear error when postgres is unreachable', async () => {
    await expect(
      createDatabase({
        connectionString: 'postgres://user:pass@127.0.0.1:1/none',
        max: 1,
      })
    ).rejects.toThrow(/cannot connect to postgres/)
  })
})
