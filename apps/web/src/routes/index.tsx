import type { JSX } from 'react'

/**
 * Placeholder for "/". The root guard in __root.tsx redirects away from
 * this path based on setup + session state, so it's never visible
 * for long. The bare panel here keeps the flash minimal.
 */
export const IndexRedirect = (): JSX.Element => {
  return (
    <div className="auth-page">
      <div className="muted">Routing…</div>
    </div>
  )
}
