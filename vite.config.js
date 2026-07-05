import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { shiftCorePlugin } from './shift-core-plugin.js'
import { scheduledStatusPlugin } from './scheduled-status-plugin.js'
import { builderTagPlugin } from './builder-tag-plugin.js'
import { reportExportPlugin } from './report-export-plugin.js'

export default defineConfig({
  plugins: [shiftCorePlugin(), reportExportPlugin(), builderTagPlugin(), scheduledStatusPlugin(), react()],
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
