import { useState, type FormEvent, type JSX } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AuthLayout } from '@/components/auth-layout'
import { AuthForegroundCard } from '@/components/auth-foreground-card'
import { authClient } from '@/lib/auth-client'

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const EyeIcon = (): JSX.Element => (
  <svg {...iconProps}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
)

const EyeOffIcon = (): JSX.Element => (
  <svg {...iconProps}>
    <path d="M10.585 10.587a2 2 0 0 0 2.829 2.828" />
    <path d="M16.681 16.673a8.717 8.717 0 0 1-4.681 1.327c-3.6 0-6.6-2-9-6 1.272-2.12 2.712-3.678 4.32-4.674m2.86-1.146a9.055 9.055 0 0 1 1.82-.18c3.6 0 6.6 2 9 6-.666 1.11-1.379 2.067-2.138 2.87" />
    <path d="M3 3l18 18" />
  </svg>
)

const MailIcon = (): JSX.Element => (
  <svg {...iconProps}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
)

const LockIcon = (): JSX.Element => (
  <svg {...iconProps}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
)

export const LoginPage = (): JSX.Element => {
  const navigate = useNavigate()
  const [ email, setEmail ] = useState('')
  const [ password, setPassword ] = useState('')
  const [ showPassword, setShowPassword ] = useState(false)
  const [ err, setErr ] = useState<string | null>(null)
  const [ pending, setPending ] = useState(false)

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setErr(null)
    setPending(true)
    try {
      const result = await authClient.signIn.email({ email, password })
      if (result.error) {
        setErr(result.error.message ?? 'Invalid credentials')
        return
      }
      void navigate({ to: '/servers', replace: true })
    } catch {
      setErr('Sign-in failed — check the API logs.')
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout>
      <AuthForegroundCard
        title="Welcome back"
        subtitle="Sign in to your operator dashboard."
      >
        {err && <div className="auth-error">{err}</div>}

        <form
          className="auth-form"
          onSubmit={(e) => { void onSubmit(e) }}
        >
          <div className="auth-field">
            <label className="sr-only" htmlFor="login-email">Email</label>
            <span className="auth-field-icon" aria-hidden="true">
              <MailIcon />
            </span>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="Email Address"
              value={email}
              required
              onChange={(e) => { setEmail(e.target.value) }}
            />
          </div>

          <div className="auth-field">
            <label className="sr-only" htmlFor="login-password">Password</label>
            <span className="auth-field-icon" aria-hidden="true">
              <LockIcon />
            </span>
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              required
              onChange={(e) => { setPassword(e.target.value) }}
            />
            <button
              type="button"
              className="auth-field-toggle"
              onClick={() => { setShowPassword((v) => { return !v }) }}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>

          <button type="submit" className="auth-submit" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </AuthForegroundCard>
    </AuthLayout>
  )
}
