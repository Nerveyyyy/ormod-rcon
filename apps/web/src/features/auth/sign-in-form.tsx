import { useState, type FormEvent, type JSX } from 'react'
import { IconEye, IconEyeOff, IconLock, IconMail } from '@tabler/icons-react'
import { useSignIn } from './mutations'

interface Props {
  onTwoFactorRequired: () => void
  onComplete: () => void
}

export const SignInForm = ({
  onTwoFactorRequired,
  onComplete,
}: Props): JSX.Element => {
  const signIn = useSignIn()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    signIn.mutate(
      { email, password },
      {
        onSuccess: (data): void => {
          if (data.twoFactorRedirect) {
            onTwoFactorRequired()
            return
          }
          onComplete()
        },
      }
    )
  }

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      {signIn.error && <div className="auth-error">{signIn.error.message}</div>}

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

      <button type="submit" className="auth-submit" disabled={signIn.isPending}>
        {signIn.isPending ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  )
}
