import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '')
  const apiPort = env.PORT || env.API_PORT || '3001'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 3000,
      host: 'localhost',
      proxy: {
        '/api': `http://localhost:${apiPort}`,
        '/ws': {
          target: `ws://localhost:${apiPort}`,
          ws: true,
        },
      },
    },
  }
})
