import {
  type FastifyPluginAsyncTypebox,
  Type,
} from '@fastify/type-provider-typebox'

const me: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    '/api/me',
    {
      schema: {
        response: {
          200: Type.Object({
            id: Type.String(),
            email: Type.String(),
            name: Type.String(),
            emailVerified: Type.Boolean(),
            image: Type.Union([Type.String(), Type.Null()]),
            mustChangePassword: Type.Boolean(),
          }),
        },
        tags: ['user'],
      },
    },
    async (request, reply) => {
      const user = request.requestContext.get('user')
      if (!user) {
        return reply.unauthorized('not signed in')
      }
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        image: user.image ?? null,
        mustChangePassword: user.mustChangePassword ?? false,
      }
    }
  )
}

export default me
