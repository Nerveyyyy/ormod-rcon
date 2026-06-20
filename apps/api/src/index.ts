import { loadConfig } from './config.js'
import { buildServer } from './server.js'

const config = loadConfig()
const app = buildServer(config)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info(`received ${signal}, shutting down`)
    await app.close()
    process.exit(0)
  })
}

try {
  await app.listen({ host: config.host, port: config.port })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
