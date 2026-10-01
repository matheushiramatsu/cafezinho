import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: { '/api': process.env.API_TARGET ?? 'http://127.0.0.1:3001' },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
})
