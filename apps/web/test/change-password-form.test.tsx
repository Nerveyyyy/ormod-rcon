import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { JSX, ReactNode } from 'react'

const { changePassword } = vi.hoisted(() => {
  return { changePassword: vi.fn() }
})

vi.mock('@/lib/auth-client', () => {
  return {
    authClient: { changePassword },
  }
})

import { ChangePasswordForm } from '@/features/auth/change-password-form'

const wrap = (node: ReactNode): JSX.Element => {
  return (
    <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
  )
}

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits current and new password then completes', async () => {
    changePassword.mockResolvedValue({ data: {}, error: null })
    const onComplete = vi.fn()
    render(wrap(<ChangePasswordForm onComplete={onComplete} />))

    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: 'old-pw' },
    })
    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: 'new-pw-123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledOnce()
    })
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: 'old-pw',
      newPassword: 'new-pw-123',
    })
  })

  it('shows an inline error when the change fails', async () => {
    changePassword.mockResolvedValue({
      data: null,
      error: { status: 400, message: 'Password too weak' },
    })
    render(wrap(<ChangePasswordForm onComplete={vi.fn()} />))

    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: 'old-pw' },
    })
    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: 'x' },
    })
    fireEvent.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByText(/password too weak/i)).toBeDefined()
  })
})
