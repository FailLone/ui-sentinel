import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The export arena owns its own ports so it never collides with the shopping arena: 4183 serves
// the built SPA, 4184 the public API, 4185 the private controller.
export default defineConfig({
  plugins: [react()],
  preview: {
    host: '127.0.0.1',
    strictPort: true,
    port: Number(process.env.EXPORT_ARENA_PORT ?? 4183),
    proxy: { '/api': `http://127.0.0.1:${process.env.EXPORT_API_PORT ?? 4184}` },
  },
  server: {
    host: '127.0.0.1',
    strictPort: true,
    port: Number(process.env.EXPORT_ARENA_PORT ?? 4183),
    proxy: { '/api': `http://127.0.0.1:${process.env.EXPORT_API_PORT ?? 4184}` },
  },
})
