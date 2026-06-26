import { useState, type JSX } from 'react'
import {
  createFileRoute,
  isRedirect,
  redirect,
  useNavigate,
} from '@tanstack/react-router'
import { AuthLayout } from '@/components/auth/auth-layout'
import { AuthForegroundCard } from '@/components/auth/auth-foreground-card'
import { SignInForm } from '@/features/auth/sign-in-form'
import { TwoFactorForm } from '@/features/auth/two-factor-form'
import { meQueryOptions } from '@/features/auth/queries'

interface LoginSearch {
  redirect?: string
}

const LoginPage = (): JSX.Element => {
  const navigate = useNavigate()
  const { redirect: redirectTo } = Route.useSearch()
  const [step, setStep] = useState<'credentials' | 'twoFactor'>('credentials')

  const onComplete = (): void => {
    void navigate({ to: redirectTo ?? '/' })
  }

  if (step === 'twoFactor') {
    return (
      <AuthLayout>
        <AuthForegroundCard
          title="Two-factor authentication"
          subtitle="Enter the code from your authenticator app."
        >
          <TwoFactorForm onComplete={onComplete} />
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
          onComplete={onComplete}
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
      throw redirect({
        to: me.mustChangePassword
          ? '/change-password'
          : (search.redirect ?? '/'),
      })
    } catch (error) {
      if (isRedirect(error)) {
        throw error
      }
      // no session: stay on the login page
    }
  },
  component: LoginPage,
})
