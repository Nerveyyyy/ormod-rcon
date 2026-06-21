import underPressure from '@fastify/under-pressure'

export const autoConfig = () => {
  return {
    maxEventLoopDelay: 1_000,
    maxEventLoopUtilization: 0.98,
    maxHeapUsedBytes: 500 * 1024 * 1024,
    maxRssBytes: 1_000_000_000,
    retryAfter: 10,
    message: 'Server under pressure - try again shortly',
    exposeStatusRoute: false,
  }
}

export default underPressure
