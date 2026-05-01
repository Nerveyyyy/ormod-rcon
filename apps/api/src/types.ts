import '@fastify/request-context'
import type { DbClient, SecretEncrypter } from '@ormod/database'
import type { EventBus } from '@ormod/eventing'
import type { AppConfig } from './lib/config.js'
import type { Auth } from './lib/auth.js'
import type { SetupStatusTracker } from './lib/setup-status.js'
import type { RconSupervisor } from './rcon/supervisor.js'

/**
 * App-level services are attached to the Fastify instance via
 * `app.decorate(...)` in the bootstrap so autoloaded plugins and
 * routes can read them off `app.xxx` / `request.server.xxx` without
 * closure-based dependency injection.
 */
declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig
    db: DbClient
    bus: EventBus
    encrypter: SecretEncrypter
    auth: Auth
    supervisor: RconSupervisor
    setupStatus: SetupStatusTracker
    appVersion: string
  }
}

/**
 * Per-request state resolved in the request-context plugin and read
 * throughout routes. `tenantId` is null for unauthenticated requests
 * or users without an active organization — handlers that touch
 * tenant-scoped tables must guard on it before carrying it into
 * writes.
 */
export interface RequestUser {
  id: string
  email: string
  name: string
}

declare module '@fastify/request-context' {
  interface RequestContextData {
    user: RequestUser | null
    tenantId: string | null
    sessionId: string | null
  }
}
