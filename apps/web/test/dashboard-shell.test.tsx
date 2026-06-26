import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const signOut = vi.fn()
const navigate = vi.hoisted(() => {
  return vi.fn()
})

interface MutateOptions {
  onSuccess?: () => void
}

vi.mock('@/features/auth/mutations', () => {
  return {
    useSignOut: (): {
      mutate: (vars: undefined, opts?: MutateOptions) => void
    } => {
      return {
        mutate: (vars: undefined, opts?: MutateOptions): void => {
          signOut(vars)
          opts?.onSuccess?.()
        },
      }
    },
  }
})

vi.mock('@tanstack/react-router', () => {
  return {
    Link: ({ children }: { children: React.ReactNode }): React.ReactNode => {
      return children
    },
    useNavigate: (): typeof navigate => {
      return navigate
    },
  }
})

import { DashboardShell } from '@/components/layout/dashboard-shell'

describe('DashboardShell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('signs out and redirects to login when the button is clicked', () => {
    render(<DashboardShell>body</DashboardShell>)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(signOut).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith({ to: '/login' })
  })
})
