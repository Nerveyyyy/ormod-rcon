import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
import { authClient } from '@/lib/auth-client'
import { ApiError } from '@/lib/api'
import { meKey } from './queries'

interface AuthResult {
  data: unknown
  error: { status?: number; code?: string; message?: string } | null
}

const unwrap = <T>(res: AuthResult): T => {
  if (res.error) {
    throw new ApiError(
      res.error.status ?? 0,
      res.error.message ?? 'Request failed',
      res.error.code
    )
  }
  return res.data as T
}

export const useSignIn = (): UseMutationResult<
  { twoFactorRedirect?: boolean },
  Error,
  { email: string; password: string }
> => {
  return useMutation({
    mutationFn: async ({
      email,
      password,
    }): Promise<{
      twoFactorRedirect?: boolean
    }> => {
      return unwrap(await authClient.signIn.email({ email, password }))
    },
  })
}

export const useVerifyTotp = (): UseMutationResult<
  unknown,
  Error,
  { code: string; trustDevice: boolean }
> => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ code, trustDevice }): Promise<unknown> => {
      return unwrap(
        await authClient.twoFactor.verifyTotp({ code, trustDevice })
      )
    },
    onSuccess: (): void => {
      void queryClient.invalidateQueries({ queryKey: meKey })
    },
  })
}

export const useVerifyBackupCode = (): UseMutationResult<
  unknown,
  Error,
  { code: string }
> => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ code }): Promise<unknown> => {
      return unwrap(await authClient.twoFactor.verifyBackupCode({ code }))
    },
    onSuccess: (): void => {
      void queryClient.invalidateQueries({ queryKey: meKey })
    },
  })
}

export const useChangePassword = (): UseMutationResult<
  unknown,
  Error,
  { currentPassword: string; newPassword: string }
> => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ currentPassword, newPassword }): Promise<unknown> => {
      return unwrap(
        await authClient.changePassword({ currentPassword, newPassword })
      )
    },
    onSuccess: (): void => {
      void queryClient.invalidateQueries({ queryKey: meKey })
    },
  })
}

export const useSignOut = (): UseMutationResult<unknown, Error, void> => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<unknown> => {
      return unwrap(await authClient.signOut())
    },
    onSuccess: (): void => {
      void queryClient.invalidateQueries({ queryKey: meKey })
    },
  })
}
