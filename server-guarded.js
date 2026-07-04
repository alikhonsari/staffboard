import express from 'express'

let currentStateVersion = null
let saveQueue = Promise.resolve()

const originalGet = express.application.get
const originalPut = express.application.put
const originalPost = express.application.post

function versionFrom(payload) {
  return String(payload?.updatedAt || '')
}

function wrapStateGet(handler) {
  return function guardedStateGet(req, res, next) {
    const originalJson = res.json.bind(res)
    res.json = (payload) => {
      const version = versionFrom(payload)
      if (version || currentStateVersion === null) currentStateVersion = version
      return originalJson(payload)
    }
    return handler(req, res, next)
  }
}

function runQueued(handler, req, res, next) {
  const job = saveQueue.then(() => new Promise((resolve, reject) => {
    const originalJson = res.json.bind(res)
    res.json = (payload) => {
      const version = versionFrom(payload)
      if (version) currentStateVersion = version
      const result = originalJson(payload)
      resolve(result)
      return result
    }

    try {
      const result = handler(req, res, next)
      if (result && typeof result.then === 'function') result.catch(reject)
    } catch (error) {
      reject(error)
    }
  }))

  saveQueue = job.catch(() => {})
  job.catch((error) => {
    console.error('State save queue failed:', error)
    if (!res.headersSent) res.status(500).json({ error: 'Failed to save shared state.' })
  })
}

function wrapStateSave(handler) {
  return function guardedStateSave(req, res, next) {
    const hasBaseVersion = Object.prototype.hasOwnProperty.call(req.body || {}, 'baseUpdatedAt')
    const baseVersion = String(req.body?.baseUpdatedAt || '')

    if (!hasBaseVersion) {
      return res.status(409).json({
        error: 'This browser session is outdated. Refresh before editing.',
        conflict: true,
        currentUpdatedAt: currentStateVersion,
      })
    }

    if (currentStateVersion !== null && baseVersion !== currentStateVersion) {
      return res.status(409).json({
        error: 'The board changed in another session. Reload the latest version before editing.',
        conflict: true,
        currentUpdatedAt: currentStateVersion,
      })
    }

    return runQueued(handler, req, res, next)
  }
}

function patchRoute(methodName, originalMethod) {
  express.application[methodName] = function patchedRoute(path, ...handlers) {
    if (path === '/api/state' && handlers.length) {
      const last = handlers.length - 1
      if (methodName === 'get') handlers[last] = wrapStateGet(handlers[last])
      else handlers[last] = wrapStateSave(handlers[last])
    }
    return originalMethod.call(this, path, ...handlers)
  }
}

patchRoute('get', originalGet)
patchRoute('put', originalPut)
patchRoute('post', originalPost)

await import('./server.js')
