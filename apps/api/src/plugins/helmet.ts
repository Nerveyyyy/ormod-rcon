import fp from 'fastify-plugin'
import helmet from '@fastify/helmet'

export default fp(
  async function helmetPlugin(fastify) {
    await fastify.register(helmet, {
      // CSP disabled — Vite SPA build injects inline scripts that CSP would block.
      // Enable with nonces if/when we add server-side HTML rendering.
      contentSecurityPolicy: false,
      // HSTS: only send Strict-Transport-Security when TLS is active.
      // Sending HSTS over plain HTTP permanently breaks non-TLS access for clients.
      hsts: fastify.config.TLS_CERT_PATH
        ? { maxAge: 63072000, includeSubDomains: true, preload: true }
        : false,
      // Prevent clickjacking
      frameguard: { action: 'deny' },
      // Control Referer header leakage
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })
  },
  { name: 'helmet', dependencies: ['env'] }
)
