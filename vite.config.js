import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { scheduledStatusPlugin } from './scheduled-status-plugin.js'
import { builderTagPlugin } from './builder-tag-plugin.js'

export default defineConfig({
  plugins: [builderTagPlugin(), scheduledStatusPlugin(), react()],
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
