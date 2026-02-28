import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { authClient } from '../lib/auth-client.js'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: authErr } = await authClient.signIn.email({ email, password })
      if (authErr) {
        setError(authErr.message ?? 'Login failed. Check your credentials.')
      } else {
        navigate('/dashboard', { replace: true })
      }
    } catch {
      setError('Network error — is the API running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg0)',
      }}
    >
      <div className="card fadein" style={{ width: '380px' }}>
        <div className="card-header">
          <span className="card-title">ORMOD: Directive</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--dim)' }}>
            RCON Dashboard
          </span>
        </div>
        <form
          className="card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          onSubmit={submit}
        >
          <div
            style={{
              color: 'var(--muted)',
              fontFamily: 'var(--mono)',
              fontSize: '11px',
              marginBottom: '4px',
            }}
          >
            Sign in to continue
          </div>

          <div className="setting-row" style={{ padding: 0 }}>
            <div className="setting-info">
              <div className="setting-name">Email</div>
            </div>
            <input
              className="text-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
            />
          </div>

          <div className="setting-row" style={{ padding: 0 }}>
            <div className="setting-info">
              <div className="setting-name">Password</div>
            </div>
            <input
              className="text-input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '11px',
                color: 'var(--red)',
                background: 'rgba(var(--red-rgb),0.08)',
                padding: '8px 10px',
                border: '1px solid var(--red)',
              }}
            >
              {error}
            </div>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ marginTop: '4px' }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
