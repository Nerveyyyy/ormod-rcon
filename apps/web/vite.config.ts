import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '')

  const webHost = env.WEB_HOST || 'localhost'
  const webPort = env.WEB_PORT || '3000'
  const apiHost = env.API_HOST || 'localhost'
  const apiPort = env.API_PORT || '3001'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: webPort,
      host: webHost,
      proxy: {
        '/api': `http://${apiHost}:${apiPort}`,
        '/ws': {
          target: `ws://${apiHost}:${apiPort}`,
          ws: true,
        },
      },
    },
  }
})
