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
import { assertValidAction } from './platform/validation.js'
import { evaluateMutationRevision } from './platform/mutation-revision.js'
import { recordError, recordReconciliation } from './platform/diagnostics.js'

const clean = (value) => String(value || '').trim()
let routesInstalled = false

function conflict(res, message) {
  return res.status(409).json({
    error: message,
    conflict: true,
    currentUpdatedAt: runtime.currentStateVersion,
    currentStateRevision: Number(runtime.currentStateRevision || 0),
    errorDetail: {
      code: 'STATE_REVISION_CONFLICT', message, retryable: true,
      details: { currentUpdatedAt: runtime.currentStateVersion, currentStateRevision: Number(runtime.currentStateRevision || 0) },
      requestId: res.locals?.requestId || null,
    },
    requestId: res.locals?.requestId || null,
  })
}

async function scheduleAction(req, res) {
  try {
    if (!config.spacesConfigured) return res.status(500).json({ error: 'Spaces is not configured' })
    const body = req.body || {}
    assertValidAction('schedule', body)
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
    return res.json({ ...response.payload, stateRevision: Number(response.payload.stateRevision || state.stateRevision || 0), changed: !!response.result.changed, scheduleRevision: Number(state.scheduleRevision || 0), closureRevision: Number(state.closureRevision || 0), recoveryRevision: Number(state.recoveryRevision || 0), notification, message: notification?.message || 'Scheduled transition updated.', timeZone: config.timeZone })
  } catch (error) {
    recordError(error)
    console.error('Scheduled transition action failed:', error)
    return res.status(error.status || 400).json({ error: error.message || 'Scheduled transition action failed.', details: error.details || {}, requestId: req.requestId || null })
  }
}

async function scheduleStatus(req, res) {
  try {
    const result = await enqueue(() => reconcilePersistedState('status-poll'))
    const state = result.payload.state || {}
    return res.json({ updatedAt: result.payload.updatedAt || '', updatedBy: result.payload.updatedBy || '', stateRevision: Number(result.payload.stateRevision || state.stateRevision || 0), scheduleRevision: Number(state.scheduleRevision || 0), closureRevision: Number(state.closureRevision || 0), recoveryRevision: Number(state.recoveryRevision || 0), notifications: (state.scheduleNotifications || []).slice(0, 10), nextDueAt: getNextPendingTransitionAt(state), timeZone: config.timeZone })
  } catch (error) {
    recordError(error)
    return res.status(500).json({ error: error.message || 'Failed to reconcile scheduled transitions.' })
  }
}

async function closureAction(req, res) {
  try {
    if (!config.spacesConfigured) return res.status(500).json({ error: 'Spaces is not configured', requestId: req.requestId || null })
    const body = req.body || {}
    assertValidAction('closure', body)
    const actor = req.user?.username || 'System'
    const response = await enqueue(async () => {
      const reconciled = await reconcilePersistedState('pre-closure-reconciliation')
      const revision = evaluateMutationRevision(body, reconciled.payload)
      if (!revision.ok) {
        conflict(res, revision.message)
        return null
      }
      const state = reconciled.payload.state || {}
      const result = body.action === 'close'
        ? closeOperationalDay(state, body, { actor, now: new Date() })
        : body.action === 'reopen'
          ? reopenOperationalDay(state, body, { actor, now: new Date() })
          : (() => { throw new Error('Unknown day closure action.') })()
      const payload = result.changed ? await persistState(result.state, actor, `closure-${body.action}`, result.events || []) : reconciled.payload
      return { payload, result }
    })
    if (!response || res.headersSent) return
    const state = response.payload.state || {}
    const latest = state.closureNotifications?.[0] || null
    return res.json({ ...response.payload, stateRevision: Number(response.payload.stateRevision || state.stateRevision || 0), changed: !!response.result.changed, closureRevision: Number(state.closureRevision || 0), scheduleRevision: Number(state.scheduleRevision || 0), recoveryRevision: Number(state.recoveryRevision || 0), closure: response.result.closure || null, canceledTransitionCount: Number(response.result.canceledTransitionCount || 0), message: latest?.message || (body.action === 'reopen' ? 'Operational day reopened.' : 'Operational day marked closed.'), requestId: req.requestId || null, timeZone: config.timeZone })
  } catch (error) {
    recordError(error)
    console.error('Day closure action failed:', error)
    return res.status(error.status || 400).json({
      error: error.message || 'Day closure action failed.',
      errorDetail: {
        code: error.code || 'DAY_CLOSURE_FAILED',
        message: error.message || 'Day closure action failed.',
        retryable: false,
        details: error.details || {},
        requestId: req.requestId || null,
      },
      details: error.details || {},
      requestId: req.requestId || null,
    })
  }
}

async function closureStatus(req, res) {
  try {
    const result = await enqueue(() => reconcilePersistedState('closure-status-poll'))
    const state = result.payload.state || {}
    return res.json({ updatedAt: result.payload.updatedAt || '', updatedBy: result.payload.updatedBy || '', stateRevision: Number(result.payload.stateRevision || state.stateRevision || 0), scheduleRevision: Number(state.scheduleRevision || 0), recoveryRevision: Number(state.recoveryRevision || 0), ...closureStatusPayload(state), timeZone: config.timeZone })
  } catch (error) {
    recordError(error)
    return res.status(500).json({ error: error.message || 'Failed to load day closure status.' })
  }
}

export function installGuardedRoutes(app) {
  if (routesInstalled) return
  routesInstalled = true
  app.get('/api/scheduled-transitions/status', requireAdminAuth, scheduleStatus)
  app.post('/api/scheduled-transitions', requireAdminAuth, closurePermissionGuard, closureAction)
  app.get('/api/day-closures/status', requireAdminAuth, closureStatus)
  app.post('/api/day-closures', requireAdminAuth, closureAction)
}

function closurePermissionGuard(req, res, next) {
  next()
}

export function invokeHandler(handler, req, res, next) {
  return new Promise((resolve, reject) => {
    const originalJson = res.json.bind(res)
    res.json = (payload) => {
      if (payload?.updatedAt) runtime.currentStateVersion = String(payload.updatedAt)
      const revision = Number(payload?.stateRevision || payload?.state?.stateRevision || 0)
      if (revision) {
        runtime.currentStateRevision = revision
        payload.stateRevision = revision
      }
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
      const reconciled = await reconcilePersistedState('state-get')
      recordReconciliation({ revision: reconciled.payload.stateRevision || reconciled.payload.state?.stateRevision || 0 })
      return invokeHandler(handler, req, res, next)
    }).catch((error) => {
      recordError(error)
      console.error('State reconciliation failed:', error)
      if (!res.headersSent) res.status(500).json({ error: 'Failed to load shared state.', requestId: req.requestId || null })
    })
  }
}

export function wrapStateSave(handler) {
  return function guardedStateSave(req, res, next) {
    const hasTimestampBase = Object.prototype.hasOwnProperty.call(req.body || {}, 'baseUpdatedAt')
    const hasRevisionBase = Object.prototype.hasOwnProperty.call(req.body || {}, 'baseStateRevision')
    if (!hasTimestampBase && !hasRevisionBase) return conflict(res, 'This browser session is outdated. Refresh before editing.')
    const baseVersion = String(req.body?.baseUpdatedAt || '')
    const baseRevision = Number(req.body?.baseStateRevision || 0)
    enqueue(async () => {
      const reconciled = await reconcilePersistedState('pre-save-reconciliation')
      const currentRevision = Number(reconciled.payload.stateRevision || reconciled.payload.state?.stateRevision || runtime.currentStateRevision || 0)
      if (hasRevisionBase && baseRevision !== currentRevision) {
        conflict(res, 'The board changed in another session. Reload the latest version before editing.')
        return
      }
      if (!hasRevisionBase && runtime.currentStateVersion !== null && baseVersion !== runtime.currentStateVersion) {
        conflict(res, 'The board changed in another session. Reload the latest version before editing.')
        return
      }
      const existing = reconciled.payload.state || {}
      const incoming = req.body?.state || {}
      assertClosedDayDataUnchanged(existing, incoming)
      await prepareDirectStateSave(existing, incoming, {
        actor: req.user?.username || 'System',
        source: 'state-save',
        stateRevision: currentRevision,
      })
      const schedules = reconcileIncomingManualChanges(existing, incoming, { actor: req.user?.username || 'System', timeZone: config.timeZone, now: new Date() })
      const protectedState = preserveServerManagedClosures(existing, schedules.state)
      const closureSweep = reconcileClosedDaySchedules(protectedState, { actor: 'System', now: new Date() })
      closureSweep.state.stateRevision = currentRevision + 1
      req.body.state = closureSweep.state
      if (!validateAndRepairState(req, res)) return
      const payload = await invokeHandler(handler, req, res, next)
      runtime.currentStateRevision = Number(payload?.stateRevision || payload?.state?.stateRevision || currentRevision + 1)
      await completeDirectStateSave(existing, payload?.state || req.body.state, {
        actor: req.user?.username || 'System',
        source: 'state-save',
        stateRevision: runtime.currentStateRevision,
      })
      for (const event of closureSweep.events || []) await appendHistory(historyEntryForEvent(event, payload?.state || req.body.state, 'closed-day-save-reconciliation'))
      scheduleNext(payload?.state || req.body.state)
    }).catch((error) => {
      recordError(error)
      console.error('State save queue failed:', error)
      if (!res.headersSent) res.status(/closed|reopen|locked/i.test(error.message || '') ? 400 : 500).json({ error: error.message || 'Failed to save shared state.', requestId: req.requestId || null })
    })
  }
}
