import fp from 'fastify-plugin'
import cors from '@fastify/cors'

export default fp(
  async function corsPlugin(fastify) {
    const publicUrl = fastify.config.PUBLIC_URL
    await fastify.register(cors, {
      origin: publicUrl
        ? [publicUrl]
        : (origin, cb) => {
            // Local dev: accept any localhost/127.0.0.1 origin regardless of port
            if (
              !origin ||
              origin.startsWith('http://localhost') ||
              origin.startsWith('http://127.0.0.1')
            ) {
              cb(null, true)
            } else {
              cb(new Error('Not allowed by CORS'), false)
            }
          },
      credentials: true,
    })
  },
  { name: 'cors', dependencies: ['env'] }
)
