import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { RootLayout } from './routes/__root.js'
import { SetupPage } from './routes/setup.js'
import { LoginPage } from './routes/login.js'
import { ServersListPage } from './routes/servers.index.js'
import { NewServerPage } from './routes/servers.new.js'
import { ServerDetailPage } from './routes/servers.$id.js'
import { IndexRedirect } from './routes/index.js'

const rootRoute = createRootRoute({ component: RootLayout })

const indexRoute = createRoute({
  getParentRoute: () => { return rootRoute },
  path: '/',
  component: IndexRedirect,
})

const setupRoute = createRoute({
  getParentRoute: () => { return rootRoute },
  path: '/setup',
  component: SetupPage,
})

const loginRoute = createRoute({
  getParentRoute: () => { return rootRoute },
  path: '/login',
  component: LoginPage,
})

const serversListRoute = createRoute({
  getParentRoute: () => { return rootRoute },
  path: '/servers',
  component: ServersListPage,
})

const newServerRoute = createRoute({
  getParentRoute: () => { return rootRoute },
  path: '/servers/new',
  component: NewServerPage,
})

const serverDetailRoute = createRoute({
  getParentRoute: () => { return rootRoute },
  path: '/servers/$id',
  component: ServerDetailPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  setupRoute,
  loginRoute,
  serversListRoute,
  newServerRoute,
  serverDetailRoute,
])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
