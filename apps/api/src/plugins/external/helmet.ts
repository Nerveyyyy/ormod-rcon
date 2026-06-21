import helmet from '@fastify/helmet'

export const autoConfig = () => {
  return {
    contentSecurityPolicy: {
      directives: {
        upgradeInsecureRequests: null,
      },
    },
  }
}

export default helmet
