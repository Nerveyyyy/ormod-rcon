import fp from 'fastify-plugin';
import cors from '@fastify/cors';

export default fp(async function corsPlugin(fastify) {
  await fastify.register(cors, {
    origin:      fastify.config.CORS_ORIGIN.split(',').map(o => o.trim()),
    credentials: true,
  });
}, { name: 'cors', dependencies: ['env'] });
