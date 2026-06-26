import type { JSX } from 'react'
import {
  createFileRoute,
  isRedirect,
  redirect,
  useNavigate,
} from '@tanstack/react-router'
import { AuthLayout } from '@/components/auth/auth-layout'
import { AuthForegroundCard } from '@/components/auth/auth-foreground-card'
import { ChangePasswordForm } from '@/features/auth/change-password-form'
import { meQueryOptions } from '@/features/auth/queries'

const ChangePasswordPage = (): JSX.Element => {
  const navigate = useNavigate()

  return (
    <AuthLayout>
      <AuthForegroundCard
        title="Update your password"
        subtitle="Set a new password before continuing to the dashboard."
      >
        <ChangePasswordForm
          onComplete={() => {
            void navigate({ to: '/' })
          }}
        />
      </AuthForegroundCard>
    </AuthLayout>
  )
}

export const Route = createFileRoute('/change-password')({
  beforeLoad: async ({ context }) => {
    try {
      const me = await context.queryClient.ensureQueryData(meQueryOptions)
      if (!me.mustChangePassword) {
        throw redirect({ to: '/' })
      }
    } catch (error) {
      if (isRedirect(error)) {
        throw error
      }
      throw redirect({ to: '/login' })
    }
  },
  component: ChangePasswordPage,
})
