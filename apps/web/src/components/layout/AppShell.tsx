import { useState, useEffect } from 'react'
import { Outlet } from 'react-router'
import NavTabs from './NavTabs.js'
import ServerSwitcher from './ServerSwitcher.js'
import ChangePasswordModal from '../ui/ChangePasswordModal.js'
import { useServer } from '../../hooks/useServer.js'
import { useAuth } from '../../context/AuthContext.js'

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
  const { user, signOut } = useAuth()
  const running = activeServer?.running ?? false
  const [showPwModal, setShowPwModal] = useState(false)

  const roleCls =
    user?.role === 'OWNER' ? 'role-owner' : user?.role === 'ADMIN' ? 'role-admin' : 'role-viewer'

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
      <Outlet />
      {showPwModal && <ChangePasswordModal onClose={() => setShowPwModal(false)} />}
    </div>
  )
}
