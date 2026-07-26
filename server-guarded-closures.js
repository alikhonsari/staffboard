import express from 'express'
import {
  config, enqueue, getObjectJson, putObjectJson, reconcilePersistedState,
  requireAdminAuth, runtime,
} from './guarded-server-runtime.js'
import { installGuardedRoutes } from './guarded-server-routes.js'
import { installRecoveryRoutes } from './recovery-routes.js'
import { installRecoveryStatusRoute } from './recovery-status-routes.js'
import { loadBackup, recoveryKeys } from './recovery-store.js'
import { installPlatformRoutes } from './platform/routes.js'
import { logEvent } from './platform/logger.js'
import { safeConfigSummary, validateEnvironment } from './platform/config.js'
import { installStatusSaveHotfix, wrapFastStateGet, wrapFastStateSave } from './status-save-hotfix.js'
import { installProtectedStatusGate } from './protected-status-gate.js'
import { installTrainingRoutes } from './training-routes.js'
import { closeTrainingStore } from './training-store.js'

const originalUse = express.application.use
const originalGet = express.application.get
const originalPut = express.application.put
const originalPost = express.application.post
const originalListen = express.application.listen

function installPlatform(app) {
  installPlatformRoutes(app, { use: originalUse, get: originalGet, post: originalPost }, {
    config, runtime, getObjectJson, putObjectJson, requireAdminAuth, recoveryKeys, loadBackup,
  })
}

function installTraining(app) {
  installTrainingRoutes(app, { authSecret: config.authSecret, authToken: config.authToken })
}

function patchRoute(method, original) {
  express.application[method] = function patchedRoute(path, ...handlers) {
    if (String(path).startsWith('/api/')) {
      installPlatform(this)
      installProtectedStatusGate(this)
      installStatusSaveHotfix(this)
      installGuardedRoutes(this)
      installRecoveryRoutes(this)
      installRecoveryStatusRoute(this)
      installTraining(this)
    }
    if (path === '/api/state' && handlers.length) {
      const index = handlers.length - 1
      handlers[index] = method === 'get' ? wrapFastStateGet(handlers[index]) : wrapFastStateSave(handlers[index])
    }
    return original.call(this, path, ...handlers)
  }
}

patchRoute('get', originalGet)
patchRoute('put', originalPut)
patchRoute('post', originalPost)

express.application.listen = function guardedListen(...args) {
  const environment = validateEnvironment(config)
  if (!environment.ok) {
    logEvent('error', 'startup_configuration_invalid', { errors: environment.errors, warnings: environment.warnings, config: safeConfigSummary(config) })
    throw new Error(`StaffBoard production configuration is invalid: ${environment.errors.join(' ')}`)
  }

  const server = originalListen.call(this, ...args)
  enqueue(() => reconcilePersistedState('startup')).catch((error) => logEvent('error', 'startup_reconciliation_failed', { error: error.message }))
  if (!runtime.fallbackTimer) {
    runtime.fallbackTimer = setInterval(() => enqueue(() => reconcilePersistedState('fallback-sweep')).catch((error) => logEvent('error', 'fallback_reconciliation_failed', { error: error.message })), 30_000)
    runtime.fallbackTimer.unref?.()
  }

  let shuttingDown = false
  const shutdown = async (signal) => {
    if (shuttingDown) return
    shuttingDown = true
    logEvent('info', 'shutdown_started', { signal })
    if (runtime.scheduleTimer) clearTimeout(runtime.scheduleTimer)
    if (runtime.fallbackTimer) clearInterval(runtime.fallbackTimer)
    server.close(() => logEvent('info', 'shutdown_http_closed', { signal }))
    const timeout = setTimeout(() => process.exit(1), 10_000)
    timeout.unref?.()
    try {
      await runtime.queue.catch(() => {})
      await closeTrainingStore().catch((error) => logEvent('warn', 'training_store_shutdown_failed', { error: error.message }))
      clearTimeout(timeout)
      logEvent('info', 'shutdown_complete', { signal })
      process.exit(0)
    } catch (error) {
      logEvent('error', 'shutdown_failed', { signal, error: error.message })
      process.exit(1)
    }
  }
  process.once('SIGTERM', () => shutdown('SIGTERM'))
  process.once('SIGINT', () => shutdown('SIGINT'))

  logEvent('info', 'startup_complete', { config: safeConfigSummary(config), warnings: environment.warnings })
  return server
}

await import('./server.js')
