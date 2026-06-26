import { describe, expect, it } from 'vitest'
import { meKey, meQueryOptions } from '@/features/auth/queries'

describe('meQueryOptions', () => {
  it('keys on me and does not retry', () => {
    expect(meKey).toEqual(['me'])
    expect(meQueryOptions.queryKey).toEqual(['me'])
    expect(meQueryOptions.retry).toBe(false)
  })
})
