import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { authClient } from '../lib/auth-client.js'
import { api } from '../api/client.js'

export default function Setup() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      await api.post('/setup', { name, email, password })

      // Sign in automatically after account creation
      await authClient.signIn.email({ email, password })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error — is the API running?')
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
      <div className="card fadein" style={{ width: '420px' }}>
        <div className="card-header">
          <span className="card-title">First-Run Setup</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--orange)' }}>
            Create Owner Account
          </span>
        </div>
        <div className="card-body" style={{ marginBottom: '8px' }}>
          <p
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '11px',
              color: 'var(--muted)',
              lineHeight: '1.7',
              margin: 0,
            }}
          >
            No users exist yet. Create the <strong style={{ color: 'var(--orange)' }}>OWNER</strong>{' '}
            account — this account has full administrative access and can create additional users.
          </p>
        </div>
        <form
          className="card-body"
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          onSubmit={submit}
        >
          <div className="setting-row" style={{ padding: 0 }}>
            <div className="setting-info">
              <div className="setting-name">Display Name</div>
            </div>
            <input
              className="text-input"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Server Admin"
            />
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
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
            />
          </div>
          <div className="setting-row" style={{ padding: 0 }}>
            <div className="setting-info">
              <div className="setting-name">Confirm Password</div>
            </div>
            <input
              className="text-input"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
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
            {loading ? 'Creating account…' : 'Create Owner Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
