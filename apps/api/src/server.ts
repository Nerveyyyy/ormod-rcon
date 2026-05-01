import { createDatabase, createSingleKeyEncrypter, loadMasterKeyFromEnv } from '@ormod/database'
import { InMemoryEventBus } from '@ormod/eventing'
import { loadConfig } from './lib/config.js'
import { createLogger } from './lib/logger.js'
import { createSetupStatusTracker } from './lib/setup-status.js'
import { createApp } from './app.js'
import { createRconSupervisor } from './rcon/supervisor.js'
import { registerRuntimeSubscriber } from './rcon/runtime-subscriber.js'
import { createScheduler } from './scheduler/index.js'
import pkg from '../package.json' with { type: 'json' }

const bootstrap = async (): Promise<void> => {
  const config = loadConfig()
  const logger = createLogger(config)
  const version = pkg.version ?? '1.0.0'

  const masterKey = loadMasterKeyFromEnv(config.ORMOD_SECRET_KEY)
  const encrypter = createSingleKeyEncrypter(masterKey)
  const { pg, db } = await createDatabase({ connectionString: config.DATABASE_URL })
  const bus = new InMemoryEventBus(logger)

  const setupStatus = createSetupStatusTracker()
  const supervisor = createRconSupervisor({ logger, db, bus, encrypter })
  const scheduler = createScheduler({ logger })

  const unsubscribeRuntime = registerRuntimeSubscriber({ logger, bus, db })

  const { app } = await createApp({
    config,
    logger,
    db,
    bus,
    encrypter,
    supervisor,
    setupStatus,
    version,
  })

  await supervisor.start()
  await scheduler.start()

  const shutdown = async (signal: string): Promise<void> => {
    process.stderr.write('[server] shutdown requested via ' + signal + '\n')
    try {
      unsubscribeRuntime()
      await scheduler.stop()
      await supervisor.stop()
      await app.close()
      await pg.end({ timeout: 5 })
      process.stderr.write('[server] shutdown complete\n')
      process.exit(0)
    } catch (err) {
      const message = err instanceof Error ? err.stack ?? err.message : String(err)
      process.stderr.write('[server] shutdown failed: ' + message + '\n')
      process.exit(1)
    }
  }

  process.on('SIGINT', () => { void shutdown('SIGINT') })
  process.on('SIGTERM', () => { void shutdown('SIGTERM') })

  await app.listen({ host: config.HOST, port: config.PORT })
  logger.info({ host: config.HOST, port: config.PORT }, '[server] listening')
}

bootstrap().catch((err) => {
  // Logger isn't initialised yet at this point. Falling back to stderr
  // is the only signal a misconfigured deployment will get.
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
