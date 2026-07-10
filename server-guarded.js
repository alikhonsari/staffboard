import express from 'express'

let currentStateVersion = null
let saveQueue = Promise.resolve()

const BOARD_RULES = {
  speed_day: { shift: 'Day Shift', title: 'SPEED Staffing Board' },
  speed_night: { shift: 'Night Shift', title: 'SPEED Staffing Board' },
  fa_day: { shift: 'Day Shift', title: 'FA Lab Staffing Board' },
  fa_night: { shift: 'Night Shift', title: 'FA Lab Staffing Board' },
  bodega_day: { shift: 'Day Shift', title: 'Bodega Staffing Board' },
  bodega_night: { shift: 'Night Shift', title: 'Bodega Staffing Board' },
}

const originalGet = express.application.get
const originalPut = express.application.put
const originalPost = express.application.post

function versionFrom(payload) {
  return String(payload?.updatedAt || '')
}

function conflict(res, message) {
  return res.status(409).json({
    error: message,
    conflict: true,
    currentUpdatedAt: currentStateVersion,
  })
}

function invalidState(res, message) {
  return res.status(400).json({
    error: message,
    invalidState: true,
  })
}

function validateAndRepairScope(req, res) {
  const state = req.body?.state
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    invalidState(res, 'Shared state payload is missing or invalid.')
    return false
  }

  const boardId = String(state.currentBoardId || '')
  const activeRule = BOARD_RULES[boardId]
  if (!activeRule) {
    invalidState(res, 'Unknown active board ID. Refresh before saving.')
    return false
  }

  const repairs = []
  if (state.boardShift !== activeRule.shift) {
    state.boardShift = activeRule.shift
    repairs.push(`active shift -> ${activeRule.shift}`)
  }
  if (state.boardTitle !== activeRule.title) {
    state.boardTitle = activeRule.title
    repairs.push(`active title -> ${activeRule.title}`)
  }

  if (!state.weekStartDate || typeof state.weekStartDate !== 'string') {
    invalidState(res, 'Active week is missing. Refresh before saving.')
    return false
  }
  if (!state.weeklyData || typeof state.weeklyData !== 'object' || Array.isArray(state.weeklyData)) {
    invalidState(res, 'Active weekly data is invalid. Refresh before saving.')
    return false
  }
  if (!state.weeklyBoards || typeof state.weeklyBoards !== 'object' || Array.isArray(state.weeklyBoards)) {
    state.weeklyBoards = {}
    repairs.push('initialized weeklyBoards')
  }
  if (!state.boardStore || typeof state.boardStore !== 'object' || Array.isArray(state.boardStore)) {
    state.boardStore = {}
    repairs.push('initialized boardStore')
  }

  Object.entries(state.boardStore).forEach(([storedId, stored]) => {
    const rule = BOARD_RULES[storedId]
    if (!rule || !stored || typeof stored !== 'object' || Array.isArray(stored)) return
    if (stored.boardShift !== rule.shift) {
      stored.boardShift = rule.shift
      repairs.push(`${storedId} shift -> ${rule.shift}`)
    }
    if (stored.boardTitle !== rule.title) {
      stored.boardTitle = rule.title
      repairs.push(`${storedId} title -> ${rule.title}`)
    }
    if (!stored.weeklyBoards || typeof stored.weeklyBoards !== 'object' || Array.isArray(stored.weeklyBoards)) {
      stored.weeklyBoards = {}
      repairs.push(`${storedId} initialized weeklyBoards`)
    }
    if (!Array.isArray(stored.dayTemplates)) stored.dayTemplates = []
    if (!Array.isArray(stored.auditLog)) stored.auditLog = []
  })

  if (repairs.length) {
    console.warn('[StaffBoard scope validation] Safe repairs applied:', repairs.join('; '))
  }
  return true
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

function runQueued(handler, req, res, next, baseVersion) {
  const job = saveQueue.then(() => new Promise((resolve, reject) => {
    if (currentStateVersion !== null && baseVersion !== currentStateVersion) {
      conflict(res, 'The board changed in another session. Reload the latest version before editing.')
      resolve()
      return
    }

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
      return conflict(res, 'This browser session is outdated. Refresh before editing.')
    }
    if (!validateAndRepairScope(req, res)) return undefined

    return runQueued(handler, req, res, next, baseVersion)
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
