import { enqueue, reconcilePersistedState, requireAdminAuth } from './guarded-server-runtime.js'
import { installRecoveryObservers } from './recovery-store.js'

let installed = false

async function statusHandler(req, res) {
  try {
    const result = await enqueue(() => reconcilePersistedState('recovery-status-poll'))
    const state = result.payload.state || {}
    return res.json({
      updatedAt: result.payload.updatedAt || '',
      updatedBy: result.payload.updatedBy || '',
      recoveryRevision: Number(state.recoveryRevision || 0),
      notifications: (state.recoveryNotifications || []).slice(0, 10),
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load recovery status.' })
  }
}

export function installRecoveryStatusRoute(app) {
  installRecoveryObservers()
  if (installed) return
  installed = true
  app.get('/api/recovery/status', requireAdminAuth, statusHandler)
}
