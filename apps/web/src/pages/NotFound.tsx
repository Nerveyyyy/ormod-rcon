import { useNavigate } from 'react-router'

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        minHeight: '100vh',
        background: 'var(--bg0)',
        gap: '16px',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: '48px',
          fontWeight: 700,
          color: 'var(--text-bright)',
          letterSpacing: '0.05em',
        }}
      >
        404
      </div>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: '12px',
          color: 'var(--muted)',
        }}
      >
        Page not found
      </div>
      <button
        className="btn btn-primary"
        style={{ marginTop: '8px' }}
        onClick={() => navigate('/dashboard')}
      >
        Go to Dashboard
      </button>
    </div>
  )
}
