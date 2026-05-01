import { useState, type FormEvent, type JSX } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { AuthLayout } from '@/components/auth-layout'
import { AuthForegroundCard } from '@/components/auth-foreground-card'
import { submitSetup, ApiError } from '@/lib/api'
import { authClient } from '@/lib/auth-client'

export const SetupPage = (): JSX.Element => {
  const navigate = useNavigate()
  const [ name, setName ] = useState('')
  const [ orgName, setOrgName ] = useState('')
  const [ email, setEmail ] = useState('')
  const [ password, setPassword ] = useState('')
  const [ err, setErr ] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: submitSetup,
    onSuccess: async () => {
      // Refresh the session so the root guard sees the new
      // (setupRequired-less) payload before navigating.
      await authClient.getSession({ query: { disableCookieCache: true } })
      void navigate({ to: '/login', replace: true })
    },
    onError: (e) => {
      if (e instanceof ApiError) setErr(e.message)
      else setErr('Setup failed — check the API logs.')
    },
  })

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    setErr(null)
    mutation.mutate({ name, orgName, email, password })
  }

  return (
    <AuthLayout>
      <AuthForegroundCard
        title="First-run setup"
        subtitle="Create the operator account and the community this deployment runs under."
      >
        <form className="auth-form auth-form--stacked" onSubmit={onSubmit}>
          <div className="auth-form-group">
            <label className="auth-form-label" htmlFor="setup-name">
              Your name
            </label>
            <div className="auth-field">
              <input
                id="setup-name"
                type="text"
                autoComplete="name"
                value={name}
                required
                minLength={1}
                maxLength={128}
                onChange={(e) => { setName(e.target.value) }}
              />
            </div>
          </div>

          <div className="auth-form-group">
            <label className="auth-form-label" htmlFor="setup-org">
              Community name
              <span className="auth-form-hint">displayed in the dashboard header</span>
            </label>
            <div className="auth-field">
              <input
                id="setup-org"
                type="text"
                value={orgName}
                required
                minLength={1}
                maxLength={128}
                onChange={(e) => { setOrgName(e.target.value) }}
              />
            </div>
          </div>

          <div className="auth-form-group">
            <label className="auth-form-label" htmlFor="setup-email">
              Email
            </label>
            <div className="auth-field">
              <input
                id="setup-email"
                type="email"
                autoComplete="email"
                value={email}
                required
                onChange={(e) => { setEmail(e.target.value) }}
              />
            </div>
          </div>

          <div className="auth-form-group">
            <label className="auth-form-label" htmlFor="setup-password">
              Password
              <span className="auth-form-hint">minimum 8 characters</span>
            </label>
            <div className="auth-field">
              <input
                id="setup-password"
                type="password"
                autoComplete="new-password"
                value={password}
                required
                minLength={8}
                maxLength={256}
                onChange={(e) => { setPassword(e.target.value) }}
              />
            </div>
          </div>

          {err && <div className="auth-error">{err}</div>}

          <button
            type="submit"
            className="auth-submit"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Creating…' : 'Create account'}
          </button>
        </form>
      </AuthForegroundCard>
    </AuthLayout>
  )
}
