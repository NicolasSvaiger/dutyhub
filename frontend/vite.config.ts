import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    // Só olha tests do src (evita rodar coisas de dist/node_modules por engano)
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
