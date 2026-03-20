import { useState, useEffect } from 'react'
import { Outlet } from 'react-router'
import NavTabs from './NavTabs.js'
import ServerSwitcher from './ServerSwitcher.js'
import ChangePasswordModal from '../ui/ChangePasswordModal.js'
import { useServerContext as useServer } from '../../context/ServerContext.js'
import { useAuth } from '../../context/AuthContext.js'
import { roleToClass } from '../../lib/constants.js'

function Clock() {
  const [t, setT] = useState(new Date())
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(i)
  }, [])
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <span className="clock mono">
      {pad(t.getUTCHours())}:{pad(t.getUTCMinutes())}:{pad(t.getUTCSeconds())} UTC
    </span>
  )
}

export default function AppShell() {
  const { activeServer } = useServer()
  const { user, signOut, rateLimitMsg, dismissRateLimit } = useAuth()
  const running = activeServer?.running ?? false
  const [showPwModal, setShowPwModal] = useState(false)

  const roleCls = roleToClass(user?.role ?? '')

  // Rate-limited before user was loaded (e.g. page refresh while throttled).
  // Show a full-page message instead of a broken shell with no user info.
  if (!user && rateLimitMsg) {
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
        <div className="card fadein" style={{ width: '400px' }}>
          <div className="card-header">
            <span className="card-title">Rate Limited</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="warn-banner" style={{ fontFamily: 'var(--mono)' }}>
              {rateLimitMsg}
            </div>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="header">
        <div className="logo-area">
          <div className="logo-icon">☢</div>
          <div className="logo-text">
            ORMOD<span>:</span>Directive{' '}
            <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '13px' }}>RCON</span>
          </div>
        </div>
        <div className="header-divider" />
        <div className="header-pills">
          <span className={`pill ${running ? 'pill-green' : 'pill-muted'}`}>
            {running && <span className="dot dot-green pulse" />}
            {running ? 'Online' : 'Offline'}
          </span>
          <ServerSwitcher />
          {activeServer && (
            <span className="pill pill-orange" style={{ fontSize: '10px' }}>
              {activeServer.mode}
            </span>
          )}
        </div>
        <div className="spacer" />
        <div className="header-right">
          {user && (
            <div className="header-user">
              <span className="header-user-name">{user.name}</span>
              <span className={`role-badge ${roleCls}`}>[{user.role.toLowerCase()}]</span>
              <button className="btn btn-ghost btn-xs" onClick={() => setShowPwModal(true)}>
                Password
              </button>
              <button className="btn btn-ghost btn-xs" onClick={signOut}>
                Sign Out
              </button>
            </div>
          )}
          <div className="header-divider" />
          <Clock />
        </div>
      </div>
      <NavTabs />
      {rateLimitMsg && (
        <div className="warn-banner" style={{ margin: '16px 24px 0', fontFamily: 'var(--mono)' }}>
          {rateLimitMsg}
          <button
            className="btn btn-ghost btn-xs"
            style={{ marginLeft: 'auto' }}
            onClick={dismissRateLimit}
          >
            Dismiss
          </button>
        </div>
      )}
      <Outlet />
      {showPwModal && <ChangePasswordModal onClose={() => setShowPwModal(false)} />}
    </div>
  )
}
