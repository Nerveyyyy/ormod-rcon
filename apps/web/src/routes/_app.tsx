import {
  createFileRoute,
  Outlet,
  redirect,
  isRedirect,
} from '@tanstack/react-router'
import type { JSX } from 'react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { meQueryOptions } from '@/features/auth/queries'

const AppLayout = (): JSX.Element => {
  return (
    <DashboardShell>
      <Outlet />
    </DashboardShell>
  )
}

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    try {
      const me = await context.queryClient.ensureQueryData(meQueryOptions)
      if (me.mustChangePassword) {
        throw redirect({
          to: '/login',
          search: { redirect: location.href },
        })
      }
    } catch (error) {
      if (error instanceof Response || isRedirect(error)) {
        throw error
      }
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
  component: AppLayout,
})
