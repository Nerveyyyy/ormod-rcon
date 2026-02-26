import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import { computeOrigins } from '../config.js';

export default fp(async function corsPlugin(fastify) {
  await fastify.register(cors, {
    origin:      computeOrigins(fastify.config.PUBLIC_URL, fastify.config.WEB_HOST, fastify.config.WEB_PORT),
    credentials: true,
  });
}, { name: 'cors', dependencies: ['env'] });
