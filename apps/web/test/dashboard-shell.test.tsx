import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const signOut = vi.fn()

vi.mock('@/features/auth/mutations', () => {
  return {
    useSignOut: (): { mutate: () => void } => {
      return { mutate: signOut }
    },
  }
})

vi.mock('@tanstack/react-router', () => {
  return {
    Link: ({ children }: { children: React.ReactNode }): React.ReactNode => {
      return children
    },
  }
})

import { DashboardShell } from '@/components/layout/dashboard-shell'

describe('DashboardShell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('signs out when the sign out button is clicked', () => {
    render(<DashboardShell>body</DashboardShell>)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(signOut).toHaveBeenCalledOnce()
  })
})
