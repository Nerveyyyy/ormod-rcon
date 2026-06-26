import {
  createFileRoute,
  Outlet,
  redirect,
  isRedirect,
} from '@tanstack/react-router'
import type { JSX } from 'react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { meQueryOptions } from '@/features/auth/queries'

const isRedirectError = (error: unknown): boolean => {
  return isRedirect(error)
}

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
        throw redirect({ to: '/change-password' })
      }
    } catch (error) {
      if (error instanceof Response || isRedirectError(error)) {
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
