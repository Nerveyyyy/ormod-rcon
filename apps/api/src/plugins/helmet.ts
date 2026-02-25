import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';

export default fp(async function helmetPlugin(fastify) {
  await fastify.register(helmet, {
    // CSP disabled — Vite SPA build injects inline scripts that CSP would block.
    // Enable with nonces if/when we add server-side HTML rendering.
    contentSecurityPolicy: false,
    // HSTS: tell browsers to only use HTTPS for this domain
    hsts: {
      maxAge:            63072000, // 2 years
      includeSubDomains: true,
      preload:           true,
    },
    // Prevent clickjacking
    frameguard: { action: 'deny' },
    // Control Referer header leakage
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
}, { name: 'helmet', dependencies: ['env'] });
