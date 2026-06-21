import closeWithGrace from 'close-with-grace'
import { buildApp } from './app.js'

const app = await buildApp()

closeWithGrace({ delay: 500 }, async ({ signal, err }) => {
  if (err) {
    app.log.error({ err }, 'shutting down after error')
  } else {
    app.log.info(`received ${signal}, shutting down`)
  }
  await app.close()
})

try {
  await app.listen({
    host: app.config.HOST,
    port: app.config.PORT,
  })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
