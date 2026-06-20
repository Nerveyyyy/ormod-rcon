import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

const rootPkg = JSON.parse(
  readFileSync(path.resolve(here, '../../package.json'), 'utf8')
) as { version: string }

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(here, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
