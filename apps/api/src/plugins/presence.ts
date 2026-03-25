import fp from 'fastify-plugin'

export default fp(
  async function presencePlugin(fastify) {
    const tracker = new Map<string, { name: string; role: string; lastSeen: Date }>()
    fastify.decorate('presenceTracker', tracker)

    // Update presence on every authenticated request
    fastify.addHook('preHandler', async (request) => {
      if (!request.session?.user) return
      const { id, name, role } = request.session.user
      tracker.set(id, { name, role, lastSeen: new Date() })
    })

    // Periodic cleanup of stale entries (older than 10 minutes)
    const cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - 10 * 60 * 1000
      for (const [id, entry] of tracker) {
        if (entry.lastSeen.getTime() < cutoff) tracker.delete(id)
      }
    }, 60_000)

    fastify.addHook('onClose', async () => {
      clearInterval(cleanupInterval)
    })
  },
  { name: 'presence', dependencies: ['auth'] }
)
