import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiBase, apiFetch, apiUrl } from '@/lib/api'

describe('apiUrl', () => {
  it('uses a relative base when VITE_API_URL is unset', () => {
    expect(apiBase).toBe('')
    expect(apiUrl('/api/servers')).toBe('/api/servers')
  })

  it('adds a leading slash when the path is missing one', () => {
    expect(apiUrl('api/servers')).toBe('/api/servers')
  })
})

describe('apiFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns parsed json and sends credentials', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const body = await apiFetch<{ ok: boolean }>('/api/me')

    expect(body).toEqual({ ok: true })
    const init = (
      fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    )[1]
    expect(init.credentials).toBe('include')
  })

  it('throws ApiError with status and code on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({ code: 'UNAUTHORIZED', message: 'nope' }),
          { status: 401, headers: { 'content-type': 'application/json' } }
        )
      })
    )

    await expect(apiFetch('/api/me')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'nope',
    })
  })
})
