import { useState, type FormEvent, type JSX } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { IconEye, IconEyeOff, IconLock, IconMail } from '@tabler/icons-react'
import { AuthLayout } from '@/components/auth/auth-layout'
import { AuthForegroundCard } from '@/components/auth/auth-foreground-card'
import { useAuth } from '@/lib/auth'

interface LoginSearch {
  redirect?: string
}

const LoginPage = (): JSX.Element => {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { redirect: redirectTo } = Route.useSearch()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    login()
    void navigate({ to: redirectTo ?? '/' })
  }

  return (
    <AuthLayout>
      <AuthForegroundCard
        title="Welcome back"
        subtitle="Sign in to your operator dashboard."
      >
        <form className="auth-form" onSubmit={onSubmit}>
          <div className="auth-field">
            <label className="sr-only" htmlFor="login-email">
              Email
            </label>
            <span className="auth-field-icon" aria-hidden="true">
              <IconMail size={16} stroke={1.75} />
            </span>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
              }}
            />
          </div>

          <div className="auth-field">
            <label className="sr-only" htmlFor="login-password">
              Password
            </label>
            <span className="auth-field-icon" aria-hidden="true">
              <IconLock size={16} stroke={1.75} />
            </span>
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
              }}
            />
            <button
              type="button"
              className="auth-field-toggle"
              onClick={() => {
                setShowPassword((v) => {
                  return !v
                })
              }}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <IconEyeOff size={18} stroke={1.75} />
              ) : (
                <IconEye size={18} stroke={1.75} />
              )}
            </button>
          </div>

          <button type="submit" className="auth-submit">
            Sign in
          </button>
        </form>
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
  beforeLoad: ({ context, search }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: search.redirect ?? '/' })
    }
  },
  component: LoginPage,
})
