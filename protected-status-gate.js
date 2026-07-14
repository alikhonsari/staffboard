import { requireAdminAuth } from './guarded-server-runtime.js'

let installed = false

export function installProtectedStatusGate(app) {
  if (installed) return
  installed = true
  app.use('/api/scheduled-transitions/status', requireAdminAuth)
  app.use('/api/day-closures/status', requireAdminAuth)
}
