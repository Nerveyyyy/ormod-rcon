import fp from 'fastify-plugin'
import helmet from '@fastify/helmet'

export default fp(
  async function helmetPlugin(fastify) {
    // Only enable HSTS when PUBLIC_URL uses HTTPS.
    // Sending HSTS over plain HTTP permanently breaks non-TLS access for clients.
    const tlsActive = fastify.config.PUBLIC_URL.startsWith('https')

    await fastify.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          imgSrc: ["'self'", 'data:'],
          frameAncestors: ["'none'"],
        },
      },
      hsts: tlsActive
        ? { maxAge: 63072000, includeSubDomains: true, preload: true }
        : false,
      // Prevent clickjacking
      frameguard: { action: 'deny' },
      // Control Referer header leakage
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })

    // Prevent search engine indexing — this is a private dashboard
    fastify.addHook('onSend', async (_request, reply) => {
      reply.header('X-Robots-Tag', 'noindex, nofollow')
    })
  },
  { name: 'helmet', dependencies: ['env'] }
)
