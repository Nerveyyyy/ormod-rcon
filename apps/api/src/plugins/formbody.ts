import fp from 'fastify-plugin';
import formbody from '@fastify/formbody';

export default fp(async function formbodyPlugin(fastify) {
  await fastify.register(formbody);
}, { name: 'formbody' });
