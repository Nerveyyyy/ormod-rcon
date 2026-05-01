import type { JSX, ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: ReactNode
  children: ReactNode
}

export const AuthForegroundCard = (
  { title, subtitle, children }: Props,
): JSX.Element => {
  return (
    <div className="auth-card">
      <header className="auth-card-head">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </header>
      <div className="auth-card-body">{children}</div>
    </div>
  )
}
