import { useState, type JSX } from 'react'
import {
  createFileRoute,
  isRedirect,
  redirect,
  useNavigate,
} from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/auth/auth-layout'
import { AuthForegroundCard } from '@/components/auth/auth-foreground-card'
import { SignInForm } from '@/features/auth/sign-in-form'
import { TwoFactorForm } from '@/features/auth/two-factor-form'
import { ChangePasswordForm } from '@/features/auth/change-password-form'
import { type Me, meKey, meQueryOptions } from '@/features/auth/queries'

type Step = 'credentials' | 'twoFactor' | 'changePassword'

interface LoginSearch {
  redirect?: string
}

const LoginPage = (): JSX.Element => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { redirect: redirectTo } = Route.useSearch()
  const [step, setStep] = useState<Step>(() => {
    const me = queryClient.getQueryData<Me>(meKey)
    return me?.mustChangePassword ? 'changePassword' : 'credentials'
  })

  const finish = (): void => {
    void navigate({ to: redirectTo ?? '/' })
  }

  // sign-in / 2FA have refreshed the me query by now; a forced account moves to
  // the change-password step, everyone else goes through to the dashboard
  const afterAuth = (): void => {
    const me = queryClient.getQueryData<Me>(meKey)
    if (me?.mustChangePassword) {
      setStep('changePassword')
      return
    }
    finish()
  }

  if (step === 'changePassword') {
    return (
      <AuthLayout>
        <AuthForegroundCard
          title="Update your password"
          subtitle="Set a new password before continuing to the dashboard."
        >
          <ChangePasswordForm
            onComplete={() => {
              toast.success('Password updated')
              finish()
            }}
          />
        </AuthForegroundCard>
      </AuthLayout>
    )
  }

  if (step === 'twoFactor') {
    return (
      <AuthLayout>
        <AuthForegroundCard
          title="Two-factor authentication"
          subtitle="Enter the code from your authenticator app."
        >
          <TwoFactorForm onComplete={afterAuth} />
        </AuthForegroundCard>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthForegroundCard
        title="Welcome back"
        subtitle="Sign in to your operator dashboard."
      >
        <SignInForm
          onTwoFactorRequired={() => {
            setStep('twoFactor')
          }}
          onComplete={afterAuth}
        />
      </AuthForegroundCard>
    </AuthLayout>
  )
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const target =
      typeof search.redirect === 'string' ? search.redirect : undefined
    const isInternal =
      !!target && target.startsWith('/') && !target.startsWith('//')
    return { redirect: isInternal ? target : undefined }
  },
  beforeLoad: async ({ context, search }) => {
    try {
      const me = await context.queryClient.ensureQueryData(meQueryOptions)
      // a forced account stays on /login to render the change-password step
      if (!me.mustChangePassword) {
        throw redirect({ to: search.redirect ?? '/' })
      }
    } catch (error) {
      if (isRedirect(error)) {
        throw error
      }
      // no session: stay on the login page
    }
  },
  component: LoginPage,
})
