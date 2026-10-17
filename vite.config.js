import { defineConfig } from 'vite'

export default defineConfig({
  base: '/CapJS/',
  build: {
    rollupOptions: {
      input: { main: 'index.html', frame: 'frame.html' },
    },
  },
  worker: { format: 'es' },
})
