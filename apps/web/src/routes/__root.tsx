import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import type { JSX } from 'react'
import type { AuthState } from '@/lib/auth'

interface RouterContext {
  auth: AuthState
  queryClient: QueryClient
}

const RootComponent = (): JSX.Element => {
  return <Outlet />
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})
