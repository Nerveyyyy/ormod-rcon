import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { JSX, ReactNode } from 'react'

const { verifyTotp, verifyBackupCode } = vi.hoisted(() => {
  return { verifyTotp: vi.fn(), verifyBackupCode: vi.fn() }
})

vi.mock('@/lib/auth-client', () => {
  return {
    authClient: {
      twoFactor: { verifyTotp, verifyBackupCode },
    },
  }
})

import { TwoFactorForm } from '@/features/auth/two-factor-form'

const wrap = (node: ReactNode): JSX.Element => {
  return (
    <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
  )
}

describe('TwoFactorForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('verifies a TOTP code with the trust-device flag and completes', async () => {
    verifyTotp.mockResolvedValue({ data: {}, error: null })
    const onComplete = vi.fn()
    render(wrap(<TwoFactorForm onComplete={onComplete} />))

    fireEvent.change(screen.getByLabelText(/authentication code/i), {
      target: { value: '123456' },
    })
    fireEvent.click(screen.getByLabelText(/trust this device/i))
    fireEvent.click(screen.getByRole('button', { name: /verify/i }))

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledOnce()
    })
    expect(verifyTotp).toHaveBeenCalledWith({
      code: '123456',
      trustDevice: true,
    })
  })

  it('uses the backup-code path when toggled', async () => {
    verifyBackupCode.mockResolvedValue({ data: {}, error: null })
    render(wrap(<TwoFactorForm onComplete={vi.fn()} />))

    fireEvent.click(screen.getByRole('button', { name: /use a backup code/i }))
    fireEvent.change(screen.getByLabelText(/backup code/i), {
      target: { value: 'abcd-efgh' },
    })
    fireEvent.click(screen.getByRole('button', { name: /verify/i }))

    await waitFor(() => {
      expect(verifyBackupCode).toHaveBeenCalledWith({ code: 'abcd-efgh' })
    })
  })
})
