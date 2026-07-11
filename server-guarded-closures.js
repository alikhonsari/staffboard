import express from 'express'
import { config, enqueue, reconcilePersistedState, runtime } from './guarded-server-runtime.js'
import { installGuardedRoutes, wrapStateGet, wrapStateSave } from './guarded-server-routes.js'
import { installRecoveryRoutes } from './recovery-routes.js'
import { installRecoveryStatusRoute } from './recovery-status-routes.js'

const originalGet = express.application.get
const originalPut = express.application.put
const originalPost = express.application.post
const originalListen = express.application.listen

function patchRoute(method, original) {
  express.application[method] = function patchedRoute(path, ...handlers) {
    if (String(path).startsWith('/api/')) {
      installGuardedRoutes(this)
      installRecoveryRoutes(this)
      installRecoveryStatusRoute(this)
    }
    if (path === '/api/state' && handlers.length) {
      const index = handlers.length - 1
      handlers[index] = method === 'get' ? wrapStateGet(handlers[index]) : wrapStateSave(handlers[index])
    }
    return original.call(this, path, ...handlers)
  }
}

patchRoute('get', originalGet)
patchRoute('put', originalPut)
patchRoute('post', originalPost)

express.application.listen = function guardedListen(...args) {
  const server = originalListen.call(this, ...args)
  enqueue(() => reconcilePersistedState('startup')).catch((error) => console.error('Startup reconciliation failed:', error))
  if (!runtime.fallbackTimer) {
    runtime.fallbackTimer = setInterval(() => enqueue(() => reconcilePersistedState('fallback-sweep')).catch((error) => console.error('Fallback schedule sweep failed:', error)), 30_000)
    runtime.fallbackTimer.unref?.()
  }
  console.log(`Scheduled transitions, day closures, and data recovery use ${config.timeZone} with server-authoritative reconciliation on port ${config.port}.`)
  return server
}

await import('./server.js')
