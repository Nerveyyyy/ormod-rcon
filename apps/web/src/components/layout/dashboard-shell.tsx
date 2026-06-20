import type { ComponentType, JSX, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { IconLayoutDashboard, IconUsers } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ size?: number }>
}

const NAV: NavItem[] = [
  {
    to: '/',
    label: 'Home',
    icon: IconLayoutDashboard,
  },
  {
    to: '/users',
    label: 'Users',
    icon: IconUsers,
  },
]

export const DashboardShell = ({ children }: { children: ReactNode }): JSX.Element => {
  const { logout } = useAuth()

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-border bg-card">
        <div className="flex h-14 items-center border-b border-border px-5 font-mono text-base font-bold tracking-wide text-foreground">
          ORMOD<span className="text-primary">:</span>&nbsp;RCON
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === '/' }}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&.active]:bg-accent [&.active]:text-foreground"
              >
                <Icon size={16} />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-border p-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={() => { logout() }}
          >
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  )
}
