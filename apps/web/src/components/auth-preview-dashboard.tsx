import type { JSX } from 'react'

interface Props {
  variant?: 'default' | 'subtle'
}

export const AuthPreviewDashboard = (
  { variant = 'default' }: Props,
): JSX.Element => {
  return (
    <div
      className={`auth-preview auth-preview--${ variant }`}
      aria-hidden="true"
    >
      <div className="auth-preview-window">
        <div className="auth-preview-chrome">
          <span className="light r" />
          <span className="light y" />
          <span className="light g" />
          <span className="url">your-community.ormod.gg</span>
        </div>
        <img
          className="auth-preview-img"
          src="/dashboard.png"
          alt=""
          width={3387}
          height={2044}
          draggable={false}
        />
      </div>
    </div>
  )
}
