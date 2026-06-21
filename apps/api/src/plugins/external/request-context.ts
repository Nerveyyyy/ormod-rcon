import { fastifyRequestContext } from '@fastify/request-context'
import type { Auth } from '@ormod/auth'

declare module '@fastify/request-context' {
  interface RequestContextData {
    user: Auth['$Infer']['Session']['user'] | null
    sessionId: string | null
    tenantId: string | null
  }
}

export const autoConfig = () => {
  return {
    defaultStoreValues: {
      user: null,
      tenantId: null,
      sessionId: null,
    },
  }
}

export default fastifyRequestContext
