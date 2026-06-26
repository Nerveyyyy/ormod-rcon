import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { JSX, ReactNode } from 'react'

const { signInEmail } = vi.hoisted(() => {
  return { signInEmail: vi.fn() }
})

vi.mock('@/lib/auth-client', () => {
  return {
    authClient: {
      signIn: { email: signInEmail },
      twoFactor: { verifyTotp: vi.fn(), verifyBackupCode: vi.fn() },
    },
  }
})

import { SignInForm } from '@/features/auth/sign-in-form'

const wrap = (node: ReactNode): JSX.Element => {
  return (
    <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
  )
}

describe('SignInForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const fill = (): void => {
    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: 'a@b.co' },
    })
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: 'pw' },
    })
  }

  it('calls onTwoFactorRequired when sign-in returns a 2FA challenge', async () => {
    signInEmail.mockResolvedValue({
      data: { twoFactorRedirect: true },
      error: null,
    })
    const onTwoFactorRequired = vi.fn()
    const onComplete = vi.fn()
    render(
      wrap(
        <SignInForm
          onTwoFactorRequired={onTwoFactorRequired}
          onComplete={onComplete}
        />
      )
    )
    fill()
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(onTwoFactorRequired).toHaveBeenCalledOnce()
    })
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('calls onComplete when no 2FA is required', async () => {
    signInEmail.mockResolvedValue({ data: {}, error: null })
    const onComplete = vi.fn()
    render(
      wrap(<SignInForm onTwoFactorRequired={vi.fn()} onComplete={onComplete} />)
    )
    fill()
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledOnce()
    })
  })

  it('shows an inline error message on failure', async () => {
    signInEmail.mockResolvedValue({
      data: null,
      error: { status: 401, message: 'Invalid email or password' },
    })
    render(
      wrap(<SignInForm onTwoFactorRequired={vi.fn()} onComplete={vi.fn()} />)
    )
    fill()
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText(/invalid email or password/i)).toBeDefined()
  })
})
