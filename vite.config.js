import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: [
      'squid-app-wrvn7.ondigitalocean.app',
      '.ondigitalocean.app',
      'cloud-fronted.com',
    ],
  },
})
