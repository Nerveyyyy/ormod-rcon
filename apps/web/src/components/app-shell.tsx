import type { JSX, ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  IconDashboard,
  IconServer,
  IconUsers,
  IconTrophy,
  IconCalendar,
  IconGavel,
  IconFile,
  IconSettings,
  IconUserCog,
  IconGauge,
} from './icons.js'
import { authClient } from '@/lib/auth-client'

interface NavItem {
  id: string
  label: string
  icon: (p: { size?: number }) => JSX.Element
  to?: string
  disabled?: boolean
}

const communityNav: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: IconDashboard, disabled: true },
  { id: 'players', label: 'Players', icon: IconUsers, disabled: true },
  { id: 'leaderboards', label: 'Leaderboards', icon: IconTrophy, disabled: true },
  { id: 'schedules', label: 'Schedules', icon: IconCalendar, disabled: true },
  { id: 'bans', label: 'Bans', icon: IconGavel, disabled: true },
  { id: 'audit', label: 'Audit Log', icon: IconFile, disabled: true },
]

const serverNav: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: IconGauge, disabled: true },
  { id: 'settings', label: 'Settings', icon: IconSettings, disabled: true },
]

const adminNav: NavItem[] = [
  { id: 'servers', label: 'Servers', icon: IconServer, to: '/servers' },
  { id: 'users', label: 'Users', icon: IconUserCog, disabled: true },
]

const NavRow = ({
  item,
  active,
}: {
  item: NavItem
  active: boolean
}): JSX.Element => {
  const Icon = item.icon
  const className = `nav-item ${ active ? 'active' : '' } ${ item.disabled ? 'disabled' : '' }`.trim()
  const content = (
    <>
      <span className="nav-icon">
        <Icon size={16} />
      </span>
      {item.label}
    </>
  )
  if (item.disabled || !item.to) {
    return <div className={className}>{content}</div>
  }
  return (
    <Link to={item.to} className={className}>
      {content}
    </Link>
  )
}

interface ShellProps {
  children: ReactNode
}

export const AppShell = ({ children }: ShellProps): JSX.Element => {
  const session = authClient.useSession()
  const matches = useRouterState({ select: (s) => { return s.location.pathname } })
  const isActive = (to?: string): boolean => {
    if (!to) return false
    if (to === '/servers') return matches === '/servers' || matches.startsWith('/servers/')
    return matches === to
  }

  const user = session.data?.user
  const initial = user?.name
    ? user.name.charAt(0).toUpperCase()
    : user?.email?.charAt(0).toUpperCase() ?? 'A'

  const onSignOut = async (): Promise<void> => {
    try {
      await authClient.signOut()
    } finally {
      window.location.href = '/login'
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">
            <span className="o">ORMOD:</span>
            <span className="r">RCON</span>
          </div>
          <div className="tagline">Dashboard</div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-group">
            <div className="nav-label">Community</div>
            {communityNav.map((it) => {
              return <NavRow key={it.id} item={it} active={isActive(it.to)} />
            })}
          </div>
          <hr className="nav-separator" />
          <div className="nav-group">
            <div className="nav-label">Server</div>
            {serverNav.map((it) => {
              return <NavRow key={it.id} item={it} active={isActive(it.to)} />
            })}
          </div>
          <hr className="nav-separator" />
          <div className="nav-group">
            <div className="nav-label">Admin</div>
            {adminNav.map((it) => {
              return <NavRow key={it.id} item={it} active={isActive(it.to)} />
            })}
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="user-pill">
            <div className="avatar">{initial}</div>
            <div className="user-info">
              <div className="name">{user?.name ?? user?.email ?? 'Operator'}</div>
              <div className="role">Owner</div>
            </div>
          </div>
          <button
            type="button"
            className="user-logout"
            onClick={() => { void onSignOut() }}
            style={{ marginTop: 8, width: '100%' }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  )
}
