import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { JSX, ReactNode } from 'react'

const { signInEmail, verifyTotp } = vi.hoisted(() => {
  return { signInEmail: vi.fn(), verifyTotp: vi.fn() }
})

vi.mock('@/lib/auth-client', () => {
  return {
    authClient: {
      signIn: { email: signInEmail },
      twoFactor: { verifyTotp, verifyBackupCode: vi.fn() },
      changePassword: vi.fn(),
      signOut: vi.fn(),
    },
  }
})

import { useSignIn, useVerifyTotp } from '@/features/auth/mutations'

const makeWrapper = (
  client: QueryClient
): ((props: { children: ReactNode }) => JSX.Element) => {
  return ({ children }): JSX.Element => {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('auth mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('useSignIn returns the 2FA challenge flag', async () => {
    signInEmail.mockResolvedValue({
      data: { twoFactorRedirect: true },
      error: null,
    })
    const client = new QueryClient()
    const { result } = renderHook(
      () => {
        return useSignIn()
      },
      { wrapper: makeWrapper(client) }
    )

    result.current.mutate({ email: 'a@b.co', password: 'pw' })

    await waitFor(() => {
      expect(result.current.data).toEqual({ twoFactorRedirect: true })
    })
  })

  it('useSignIn throws ApiError on an auth error', async () => {
    signInEmail.mockResolvedValue({
      data: null,
      error: { status: 401, code: 'INVALID', message: 'bad creds' },
    })
    const client = new QueryClient()
    const { result } = renderHook(
      () => {
        return useSignIn()
      },
      { wrapper: makeWrapper(client) }
    )

    result.current.mutate({ email: 'a@b.co', password: 'pw' })

    await waitFor(() => {
      expect(result.current.error).toMatchObject({
        name: 'ApiError',
        status: 401,
        message: 'bad creds',
      })
    })
  })

  it('useVerifyTotp invalidates the me query on success', async () => {
    verifyTotp.mockResolvedValue({ data: { token: 't' }, error: null })
    const client = new QueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(
      () => {
        return useVerifyTotp()
      },
      { wrapper: makeWrapper(client) }
    )

    result.current.mutate({ code: '123456', trustDevice: true })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['me'] })
    expect(verifyTotp).toHaveBeenCalledWith({
      code: '123456',
      trustDevice: true,
    })
  })
})
