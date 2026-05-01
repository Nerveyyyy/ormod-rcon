import type { JSX, ReactNode } from 'react'
import { AuthSidebar } from './auth-sidebar.js'
import { AuthPreviewDashboard } from './auth-preview-dashboard.js'

interface Props {
  children: ReactNode
  previewVariant?: 'default' | 'subtle'
}

export const AuthLayout = (
  { children, previewVariant = 'default' }: Props,
): JSX.Element => {
  return (
    <div className="auth-shell">
      <div className="auth-shell-grid" aria-hidden="true" />
      <AuthSidebar />
      <section className="auth-shell-stage">
        <AuthPreviewDashboard variant={previewVariant} />
        <div className="auth-shell-foreground">{children}</div>
      </section>
    </div>
  )
}
