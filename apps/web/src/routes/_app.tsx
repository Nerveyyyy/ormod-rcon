import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import type { JSX } from 'react'
import { DashboardShell } from '@/components/layout/dashboard-shell'

const AppLayout = (): JSX.Element => {
  return (
    <DashboardShell>
      <Outlet />
    </DashboardShell>
  )
}

export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
  component: AppLayout,
})
