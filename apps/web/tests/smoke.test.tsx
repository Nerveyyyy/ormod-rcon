import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { LoginPage } from '../src/routes/login.js'

/**
 * Smoke test: the login form renders its heading. The real setup vs.
 * login guard lives in RootLayout + needs network (setup status, session);
 * exercising the page standalone keeps the test hermetic.
 */

const buildRouter = () => {
  const rootRoute = createRootRoute()
  const loginRoute = createRoute({
    getParentRoute: () => { return rootRoute },
    path: '/login',
    component: LoginPage,
  })
  const routeTree = rootRoute.addChildren([ loginRoute ])
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [ '/login' ] }),
  })
}

let queryClient: QueryClient

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 0, staleTime: Infinity } },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LoginPage', () => {
  it('renders the sign-in page heading', async () => {
    const router = buildRouter()
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    expect(
      await screen.findByRole('heading', { name: /server\s*control/i }),
    ).toBeInTheDocument()
    expect(
      await screen.findByPlaceholderText(/email address/i),
    ).toBeInTheDocument()
  })
})
