import {
  applyImmediateTransition, applyManualAssignmentOverride, cancelScheduledTransition,
  createScheduledTransition, getNextPendingTransitionAt, reconcileIncomingManualChanges,
} from './scheduled-transitions-core.js'
import {
  assertClosedDayDataUnchanged, assertOperationalDayOpen, closeOperationalDay,
  closureStatusPayload, preserveServerManagedClosures, reconcileClosedDaySchedules,
  reopenOperationalDay,
} from './day-closures-core.js'
import {
  appendHistory, config, enqueue, historyEntryForEvent, persistState,
  reconcilePersistedState, requireAdminAuth, runtime, scheduleNext, validateAndRepairState,
} from './guarded-server-runtime.js'
import { completeDirectStateSave, prepareDirectStateSave } from './recovery-direct-save.js'

const clean = (value) => String(value || '').trim()
let routesInstalled = false

function conflict(res, message) {
  return res.status(409).json({ error: message, conflict: true, currentUpdatedAt: runtime.currentStateVersion })
}

function requireFields(body, fields) {
  for (const key of fields) if (!clean(body?.[key])) throw new Error(`Missing ${key}.`)
}

async function scheduleAction(req, res) {
  try {
    if (!config.spacesConfigured) return res.status(500).json({ error: 'Spaces is not configured' })
    const body = req.body || {}
    requireFields(body, ['boardId', 'weekStartDate', 'day', 'builderId'])
    const actor = req.user?.username || 'System'
    const response = await enqueue(async () => {
      const reconciled = await reconcilePersistedState('pre-action-reconciliation')
      const state = reconciled.payload.state || {}
      let result
      if (body.action === 'schedule') {
        assertOperationalDayOpen(state, body)
        if (!['clock_in', 'clock_out'].includes(body.type) || !clean(body.time)) throw new Error('Choose a valid scheduled transition and time.')
        result = createScheduledTransition(state, body, { actor, timeZone: config.timeZone, now: new Date() })
      } else if (body.action === 'cancel') {
        if (!['clock_in', 'clock_out', 'all'].includes(body.type)) throw new Error('Choose a transition to cancel.')
        result = cancelScheduledTransition(state, body, { actor, timeZone: config.timeZone, now: new Date() })
      } else if (body.action === 'immediate') {
        assertOperationalDayOpen(state, body)
        if (!['clock_in', 'clock_out'].includes(body.type)) throw new Error('Choose clock_in or clock_out.')
        result = applyImmediateTransition(state, body, { actor, timeZone: config.timeZone, now: new Date() })
      } else if (body.action === 'override') {
        assertOperationalDayOpen(state, body)
        result = applyManualAssignmentOverride(state, body, { actor, timeZone: config.timeZone, now: new Date() })
      } else throw new Error('Unknown scheduled transition action.')
      const payload = result.changed ? await persistState(result.state, actor, `schedule-${body.action}`, result.events || []) : reconciled.payload
      return { payload, result }
    })
    const state = response.payload.state || {}
    const notification = state.scheduleNotifications?.[0] || null
    return res.json({ ...response.payload, changed: !!response.result.changed, scheduleRevision: Number(state.scheduleRevision || 0), closureRevision: Number(state.closureRevision || 0), recoveryRevision: Number(state.recoveryRevision || 0), notification, message: notification?.message || 'Scheduled transition updated.', timeZone: config.timeZone })
  } catch (error) {
    console.error('Scheduled transition action failed:', error)
    return res.status(400).json({ error: error.message || 'Scheduled transition action failed.' })
  }
}

async function scheduleStatus(req, res) {
  try {
    const result = await enqueue(() => reconcilePersistedState('status-poll'))
    const state = result.payload.state || {}
    return res.json({ updatedAt: result.payload.updatedAt || '', updatedBy: result.payload.updatedBy || '', scheduleRevision: Number(state.scheduleRevision || 0), closureRevision: Number(state.closureRevision || 0), recoveryRevision: Number(state.recoveryRevision || 0), notifications: (state.scheduleNotifications || []).slice(0, 10), nextDueAt: getNextPendingTransitionAt(state), timeZone: config.timeZone })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to reconcile scheduled transitions.' })
  }
}

async function closureAction(req, res) {
  try {
    if (!config.spacesConfigured) return res.status(500).json({ error: 'Spaces is not configured' })
    const body = req.body || {}
    requireFields(body, ['boardId', 'weekStartDate', 'day', 'scope'])
    const actor = req.user?.username || 'System'
    const response = await enqueue(async () => {
      const reconciled = await reconcilePersistedState('pre-closure-reconciliation')
      const state = reconciled.payload.state || {}
      const result = body.action === 'close'
        ? closeOperationalDay(state, body, { actor, now: new Date() })
        : body.action === 'reopen'
          ? reopenOperationalDay(state, body, { actor, now: new Date() })
          : (() => { throw new Error('Unknown day closure action.') })()
      const payload = result.changed ? await persistState(result.state, actor, `closure-${body.action}`, result.events || []) : reconciled.payload
      return { payload, result }
    })
    const state = response.payload.state || {}
    const latest = state.closureNotifications?.[0] || null
    return res.json({ ...response.payload, changed: !!response.result.changed, closureRevision: Number(state.closureRevision || 0), scheduleRevision: Number(state.scheduleRevision || 0), recoveryRevision: Number(state.recoveryRevision || 0), closure: response.result.closure || null, canceledTransitionCount: Number(response.result.canceledTransitionCount || 0), message: latest?.message || (body.action === 'reopen' ? 'Operational day reopened.' : 'Operational day marked closed.'), timeZone: config.timeZone })
  } catch (error) {
    console.error('Day closure action failed:', error)
    return res.status(400).json({ error: error.message || 'Day closure action failed.' })
  }
}

async function closureStatus(req, res) {
  try {
    const result = await enqueue(() => reconcilePersistedState('closure-status-poll'))
    const state = result.payload.state || {}
    return res.json({ updatedAt: result.payload.updatedAt || '', updatedBy: result.payload.updatedBy || '', scheduleRevision: Number(state.scheduleRevision || 0), recoveryRevision: Number(state.recoveryRevision || 0), ...closureStatusPayload(state), timeZone: config.timeZone })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load day closure status.' })
  }
}

export function installGuardedRoutes(app) {
  if (routesInstalled) return
  routesInstalled = true
  app.get('/api/scheduled-transitions/status', requireAdminAuth, scheduleStatus)
  app.post('/api/scheduled-transitions', requireAdminAuth, scheduleAction)
  app.get('/api/day-closures/status', requireAdminAuth, closureStatus)
  app.post('/api/day-closures', requireAdminAuth, closureAction)
}

export function invokeHandler(handler, req, res, next) {
  return new Promise((resolve, reject) => {
    const originalJson = res.json.bind(res)
    res.json = (payload) => {
      if (payload?.updatedAt) runtime.currentStateVersion = String(payload.updatedAt)
      const output = originalJson(payload)
      resolve(payload)
      return output
    }
    try {
      const output = handler(req, res, next)
      if (output?.then) output.catch(reject)
    } catch (error) { reject(error) }
  })
}

export function wrapStateGet(handler) {
  return function guardedStateGet(req, res, next) {
    enqueue(async () => {
      await reconcilePersistedState('state-get')
      return invokeHandler(handler, req, res, next)
    }).catch((error) => {
      console.error('State reconciliation failed:', error)
      if (!res.headersSent) res.status(500).json({ error: 'Failed to load shared state.' })
    })
  }
}

export function wrapStateSave(handler) {
  return function guardedStateSave(req, res, next) {
    const hasBase = Object.prototype.hasOwnProperty.call(req.body || {}, 'baseUpdatedAt')
    if (!hasBase) return conflict(res, 'This browser session is outdated. Refresh before editing.')
    const baseVersion = String(req.body?.baseUpdatedAt || '')
    enqueue(async () => {
      const reconciled = await reconcilePersistedState('pre-save-reconciliation')
      if (runtime.currentStateVersion !== null && baseVersion !== runtime.currentStateVersion) {
        conflict(res, 'The board changed in another session. Reload the latest version before editing.')
        return
      }
      const existing = reconciled.payload.state || {}
      const incoming = req.body?.state || {}
      assertClosedDayDataUnchanged(existing, incoming)
      await prepareDirectStateSave(existing, incoming, {
        actor: req.user?.username || 'System',
        source: 'state-save',
        stateRevision: reconciled.payload.updatedAt || '',
      })
      const schedules = reconcileIncomingManualChanges(existing, incoming, { actor: req.user?.username || 'System', timeZone: config.timeZone, now: new Date() })
      const protectedState = preserveServerManagedClosures(existing, schedules.state)
      const closureSweep = reconcileClosedDaySchedules(protectedState, { actor: 'System', now: new Date() })
      req.body.state = closureSweep.state
      if (!validateAndRepairState(req, res)) return
      const payload = await invokeHandler(handler, req, res, next)
      await completeDirectStateSave(existing, payload?.state || req.body.state, {
        actor: req.user?.username || 'System',
        source: 'state-save',
        stateRevision: payload?.updatedAt || '',
      })
      for (const event of closureSweep.events || []) await appendHistory(historyEntryForEvent(event, payload?.state || req.body.state, 'closed-day-save-reconciliation'))
      scheduleNext(payload?.state || req.body.state)
    }).catch((error) => {
      console.error('State save queue failed:', error)
      if (!res.headersSent) res.status(/closed|reopen|locked/i.test(error.message || '') ? 400 : 500).json({ error: error.message || 'Failed to save shared state.' })
    })
  }
}
