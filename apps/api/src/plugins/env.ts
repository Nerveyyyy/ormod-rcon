import fp from 'fastify-plugin';
import fastifyEnv from '@fastify/env';
import { envSchema } from '../config.js';

export default fp(async function envPlugin(fastify) {
  await fastify.register(fastifyEnv, {
    schema: envSchema,
    dotenv: { path: '../../.env' },
  });

  // Production safety check: require a real secret
  if (fastify.config.NODE_ENV === 'production') {
    const secret = fastify.config.BETTER_AUTH_SECRET;
    if (!secret || secret === 'change_this_to_something_very_random_and_long') {
      fastify.log.error(
        '[FATAL] BETTER_AUTH_SECRET must be set to a strong random value in production.\n' +
        '        Generate one with:  openssl rand -hex 32'
      );
      process.exit(1);
    }
  }
}, { name: 'env', dependencies: ['sensible'] });
