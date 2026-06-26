import { describe, expect, it } from 'vitest'
import { apiBase, apiUrl } from '@/lib/api'

describe('apiUrl', () => {
  it('uses a relative base when VITE_API_URL is unset', () => {
    expect(apiBase).toBe('')
    expect(apiUrl('/api/servers')).toBe('/api/servers')
  })

  it('adds a leading slash when the path is missing one', () => {
    expect(apiUrl('api/servers')).toBe('/api/servers')
  })
})
