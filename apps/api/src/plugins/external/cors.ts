import cors from '@fastify/cors'

export const autoConfig = {
  origin: 'http://localhost:8080',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
}

export default cors
