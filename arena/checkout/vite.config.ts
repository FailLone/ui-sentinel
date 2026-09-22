import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  preview: {
    host: '127.0.0.1',
    strictPort: true,
    port: Number(process.env.ARENA_PORT ?? 4173),
    proxy: { '/api': `http://127.0.0.1:${process.env.ARENA_API_PORT ?? 4174}` },
  },
  server: {
    host: '127.0.0.1',
    strictPort: true,
    port: Number(process.env.ARENA_PORT ?? 4173),
    proxy: {
      '/api': `http://127.0.0.1:${process.env.ARENA_API_PORT ?? 4174}`,
    },
  },
})
