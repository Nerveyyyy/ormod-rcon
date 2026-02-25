import fp from 'fastify-plugin';
import underPressure from '@fastify/under-pressure';

export default fp(async function underpressurePlugin(fastify) {
  await fastify.register(underPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes:  500 * 1024 * 1024, // 500 MB
    message:           'Server under pressure — try again shortly',
    retryAfter:        10,
  });
}, { name: 'underpressure' });
