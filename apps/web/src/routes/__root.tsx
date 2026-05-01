import { useEffect, type JSX } from 'react'
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { authClient, isSetupRequired } from '@/lib/auth-client'

/**
 * Root guard. The session response carries everything we need:
 * `setupRequired` is present (and true) only while no organization
 * exists; the `data.user` field marks an active session. The 3-way
 * branch:
 *
 *   setupRequired present → /setup
 *   no session            → /login
 *   authed                → /servers
 *
 * Once setup is done the API drops `setupRequired` from the payload
 * entirely, so a returning visitor on `/setup` is bounced away.
 */
export const RootLayout = (): JSX.Element => {
  const pathname = useRouterState({ select: (s) => { return s.location.pathname } })
  const navigate = useNavigate()
  const session = authClient.useSession()

  const setupRequired = isSetupRequired(session.data)
  const sessionResolved = !session.isPending
  const isAuthed = !!session.data && !!(session.data as { user?: unknown }).user

  useEffect(() => {
    if (!sessionResolved) return

    if (setupRequired && pathname !== '/setup') {
      void navigate({ to: '/setup', replace: true })
      return
    }
    if (!setupRequired && pathname === '/setup') {
      void navigate({ to: isAuthed ? '/servers' : '/login', replace: true })
      return
    }
    if (!isAuthed && pathname !== '/login' && pathname !== '/setup') {
      void navigate({ to: '/login', replace: true })
      return
    }
    if (isAuthed && (pathname === '/login' || pathname === '/')) {
      void navigate({ to: '/servers', replace: true })
    }
  }, [ sessionResolved, setupRequired, isAuthed, pathname, navigate ])

  if (!sessionResolved) {
    return (
      <div className="auth-page">
        <div className="muted">Loading…</div>
      </div>
    )
  }

  return <Outlet />
}
