import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { JSX, ReactNode } from 'react'
import { AuthProvider, useAuth } from '@/lib/auth'

const wrapper = ({ children }: { children: ReactNode }): JSX.Element => {
  return <AuthProvider>{children}</AuthProvider>
}

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts unauthenticated when storage is empty', () => {
    const { result } = renderHook(
      () => {
        return useAuth()
      },
      { wrapper }
    )
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('login persists to storage and flips state', () => {
    const { result } = renderHook(
      () => {
        return useAuth()
      },
      { wrapper }
    )
    act(() => {
      result.current.login()
    })
    expect(result.current.isAuthenticated).toBe(true)
    expect(localStorage.getItem('ormod.authed')).toBe('true')
  })

  it('logout clears storage and state', () => {
    const { result } = renderHook(
      () => {
        return useAuth()
      },
      { wrapper }
    )
    act(() => {
      result.current.login()
    })
    act(() => {
      result.current.logout()
    })
    expect(result.current.isAuthenticated).toBe(false)
    expect(localStorage.getItem('ormod.authed')).toBeNull()
  })

  it('reads initial state from existing storage', () => {
    localStorage.setItem('ormod.authed', 'true')
    const { result } = renderHook(
      () => {
        return useAuth()
      },
      { wrapper }
    )
    expect(result.current.isAuthenticated).toBe(true)
  })
})
