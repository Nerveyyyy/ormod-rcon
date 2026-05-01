import type { JSX } from 'react'

export const AuthSidebar = (): JSX.Element => {
  return (
    <aside className="auth-sidebar">
      <div className="auth-sidebar-logo">
        <div className="auth-sidebar-logo-mark">
          <img src="/logo.svg" alt="" />
        </div>
        <span className="auth-sidebar-logo-name">
          ORMOD<span className="sep">:</span> RCON
        </span>
      </div>

      <div className="auth-sidebar-headline">
        <h1 className="auth-sidebar-tagline">
          Self Hosted
          <span>Server</span>
          <span>Control.</span>
        </h1>

        <ul className="auth-sidebar-features">
          <li>Real-time server monitoring</li>
          <li>Player tracking &amp; admin tools</li>
          <li>Ban management &amp; audit logs</li>
          <li>Scheduled wipes and restarts</li>
        </ul>
      </div>

      <div className="auth-sidebar-version">v0.18.2</div>
    </aside>
  )
}
