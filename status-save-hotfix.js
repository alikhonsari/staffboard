import {
  appendHistory, config, enqueue, getObjectJson, historyEntryForEvent, putObjectJson,
  reconcilePersistedState, runtime, scheduleNext, validateAndRepairState,
} from './guarded-server-runtime.js'
import {
  assertClosedDayDataUnchanged, closureStatusPayload, preserveServerManagedClosures,
  reconcileClosedDaySchedules,
} from './day-closures-core.js'
import { getNextPendingTransitionAt, reconcileIncomingManualChanges } from './scheduled-transitions-core.js'
import { completeDirectStateSave, prepareDirectStateSave } from './recovery-direct-save.js'
import { recordError, recordReconciliation } from './platform/diagnostics.js'

const BOARD_SCOPED_KEYS = [
  'boardTitle', 'boardShift', 'selectedDay', 'areaDefs', 'weekStartDate',
  'weeklyData', 'weeklyBoards', 'weeklyHistory', 'lockedWeeks',
  'commentsBoard', 'dayTemplates', 'auditLog',
]
const clean = (value) => String(value || '').trim()
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
let installed = false
let postSaveQueue = Promise.resolve()

function hasMeaningfulValue(value) {
  if (Array.isArray(value)) return value.length > 0
  if (isObject(value)) return Object.values(value).some(hasMeaningfulValue)
  return clean(value) !== ''
}

function hasDayData(day = {}) {
  return isObject(day) && (
    Object.keys(day.assignments || {}).length > 0 ||
    (Array.isArray(day.movementLog) && day.movementLog.length > 0) ||
    (Array.isArray(day.attendanceLog) && day.attendanceLog.length > 0) ||
    hasMeaningfulValue(day.opsMetrics || {}) || hasMeaningfulValue(day.rackLists || {}) ||
    hasMeaningfulValue(day.snapshots || {})
  )
}

const hasWeekData = (weeklyData = {}) => isObject(weeklyData) && Object.values(weeklyData).some(hasDayData)
const hasBoardData = (board = {}) => isObject(board) && (
  hasWeekData(board.weeklyData) || hasMeaningfulValue(board.weeklyBoards || {}) ||
  hasMeaningfulValue(board.weeklyHistory || {}) || hasMeaningfulValue(board.commentsBoard || {})
)

function takeBoardScopedState(state = {}) {
  return Object.fromEntries(BOARD_SCOPED_KEYS.filter((key) => state[key] !== undefined).map((key) => [key, clone(state[key])]))
}

function mergeBoardScoped(existingBoard = {}, incomingBoard = {}) {
  const existing = isObject(existingBoard) ? existingBoard : {}
  const incoming = isObject(incomingBoard) ? incomingBoard : {}
  if (hasBoardData(existing) && !hasBoardData(incoming)) return existing
  return {
    ...existing,
    ...incoming,
    weeklyBoards: { ...(existing.weeklyBoards || {}), ...(incoming.weeklyBoards || {}) },
    weeklyHistory: { ...(existing.weeklyHistory || {}), ...(incoming.weeklyHistory || {}) },
    lockedWeeks: { ...(existing.lockedWeeks || {}), ...(incoming.lockedWeeks || {}) },
  }
}

export function mergeIncomingState(existingState = {}, incomingState = {}) {
  const existing = isObject(existingState) ? existingState : {}
  const incoming = isObject(incomingState) ? incomingState : {}
  const boardId = clean(incoming.currentBoardId || existing.currentBoardId || 'speed_day') || 'speed_day'
  const existingStore = isObject(existing.boardStore) ? existing.boardStore : {}
  const incomingStore = isObject(incoming.boardStore) ? incoming.boardStore : {}
  const mergedStore = { ...existingStore }
  for (const [id, board] of Object.entries(incomingStore)) mergedStore[id] = mergeBoardScoped(existingStore[id], board)
  mergedStore[boardId] = mergeBoardScoped(mergedStore[boardId], takeBoardScopedState(incoming))
  const merged = { ...existing, ...incoming, currentBoardId: boardId, boardStore: mergedStore }
  const activeBoard = mergedStore[boardId]
  if (activeBoard) for (const key of BOARD_SCOPED_KEYS) if (activeBoard[key] !== undefined) merged[key] = clone(activeBoard[key])
  return merged
}

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

function queuePostSave(task) {
  const job = postSaveQueue.catch(() => {}).then(task)
  postSaveQueue = job.catch((error) => {
    recordError(error)
    console.warn('StaffBoard post-save maintenance failed:', error.message)
  })
  return job
}

function autoSaveHistory(payload, req) {
  const state = payload.state || {}
  return {
    id: `autosave-${payload.stateRevision}-${Date.now()}`,
    at: payload.updatedAt,
    user: req.user?.username || 'unknown',
    action: 'Auto saved board',
    boardTitle: state.boardTitle || '',
    boardId: state.currentBoardId || '',
    weekStartDate: state.weekStartDate || '',
    selectedDay: state.selectedDay || '',
    source: 'fast-state-save',
  }
}

export function wrapFastStateGet() {
  return function fastStateGet(req, res) {
    enqueue(async () => {
      const reconciled = await reconcilePersistedState('state-get')
      recordReconciliation({ revision: reconciled.payload.stateRevision || reconciled.payload.state?.stateRevision || 0 })
      return res.json(reconciled.payload)
    }).catch((error) => {
      recordError(error)
      console.error('Fast state load failed:', error)
      if (!res.headersSent) res.status(503).json({ error: 'The shared board is temporarily unavailable. Retry shortly.', requestId: req.requestId || null })
    })
  }
}

export function wrapFastStateSave() {
  return function fastStateSave(req, res) {
    const hasTimestampBase = Object.prototype.hasOwnProperty.call(req.body || {}, 'baseUpdatedAt')
    const hasRevisionBase = Object.prototype.hasOwnProperty.call(req.body || {}, 'baseStateRevision')
    if (!hasTimestampBase && !hasRevisionBase) return conflict(res, 'This browser session is outdated. Refresh before editing.')
    const baseVersion = String(req.body?.baseUpdatedAt || '')
    const baseRevision = Number(req.body?.baseStateRevision || 0)

    enqueue(async () => {
      const reconciled = await reconcilePersistedState('pre-save-reconciliation')
      const currentRevision = Number(reconciled.payload.stateRevision || reconciled.payload.state?.stateRevision || runtime.currentStateRevision || 0)
      if (hasRevisionBase && baseRevision !== currentRevision) return conflict(res, 'The board changed in another session. Reload the latest version before editing.')
      if (!hasRevisionBase && runtime.currentStateVersion !== null && baseVersion !== runtime.currentStateVersion) return conflict(res, 'The board changed in another session. Reload the latest version before editing.')

      const existing = reconciled.payload.state || {}
      const incoming = req.body?.state || {}
      assertClosedDayDataUnchanged(existing, incoming)
      await prepareDirectStateSave(existing, incoming, {
        actor: req.user?.username || 'System', source: 'state-save', stateRevision: currentRevision,
      })
      const schedules = reconcileIncomingManualChanges(existing, incoming, {
        actor: req.user?.username || 'System', timeZone: config.timeZone, now: new Date(),
      })
      const protectedState = preserveServerManagedClosures(existing, schedules.state)
      const closureSweep = reconcileClosedDaySchedules(protectedState, { actor: 'System', now: new Date() })
      closureSweep.state.stateRevision = currentRevision + 1
      req.body.state = closureSweep.state
      if (!validateAndRepairState(req, res)) return

      const mergedState = mergeIncomingState(existing, req.body.state)
      const savedAt = new Date().toISOString()
      const nextRevision = currentRevision + 1
      mergedState.stateRevision = nextRevision
      mergedState.updatedAt = savedAt
      const payload = {
        state: mergedState,
        updatedAt: savedAt,
        stateRevision: nextRevision,
        updatedBy: req.user?.username || 'unknown',
      }
      await putObjectJson(config.key, payload)
      runtime.currentStateVersion = savedAt
      runtime.currentStateRevision = nextRevision
      scheduleNext(mergedState)
      res.json(payload)

      queuePostSave(async () => {
        await completeDirectStateSave(existing, mergedState, {
          actor: req.user?.username || 'System', source: 'state-save', stateRevision: nextRevision,
        })
        await appendHistory(autoSaveHistory(payload, req))
        for (const event of closureSweep.events || []) await appendHistory(historyEntryForEvent(event, mergedState, 'closed-day-save-reconciliation'))
      })
    }).catch((error) => {
      recordError(error)
      console.error('Fast state save failed:', error)
      if (!res.headersSent) res.status(/closed|reopen|locked|changed in another|outdated/i.test(error.message || '') ? 409 : 503).json({
        error: error.message || 'The board save timed out before reaching storage. Retry the change.',
        requestId: req.requestId || null,
      })
    })
  }
}

async function readStatusState() {
  const payload = await getObjectJson(config.key, { state: {}, updatedAt: '', stateRevision: 0 })
  runtime.currentStateVersion = String(payload.updatedAt || runtime.currentStateVersion || '')
  runtime.currentStateRevision = Number(payload.stateRevision || payload.state?.stateRevision || runtime.currentStateRevision || 0)
  return payload
}

export function installStatusSaveHotfix(app) {
  if (installed) return
  installed = true
  app.get('/api/scheduled-transitions/status', async (req, res) => {
    try {
      const payload = await readStatusState()
      const state = payload.state || {}
      res.json({
        updatedAt: payload.updatedAt || '', updatedBy: payload.updatedBy || '',
        stateRevision: Number(payload.stateRevision || state.stateRevision || 0),
        scheduleRevision: Number(state.scheduleRevision || 0), closureRevision: Number(state.closureRevision || 0),
        recoveryRevision: Number(state.recoveryRevision || 0), notifications: (state.scheduleNotifications || []).slice(0, 10),
        nextDueAt: getNextPendingTransitionAt(state), timeZone: config.timeZone,
      })
    } catch (error) {
      recordError(error)
      res.status(503).json({ error: 'Scheduled-transition status is temporarily unavailable.', requestId: req.requestId || null })
    }
  })
  app.get('/api/day-closures/status', async (req, res) => {
    try {
      const payload = await readStatusState()
      const state = payload.state || {}
      res.json({
        updatedAt: payload.updatedAt || '', updatedBy: payload.updatedBy || '',
        stateRevision: Number(payload.stateRevision || state.stateRevision || 0),
        scheduleRevision: Number(state.scheduleRevision || 0), recoveryRevision: Number(state.recoveryRevision || 0),
        ...closureStatusPayload(state), timeZone: config.timeZone,
      })
    } catch (error) {
      recordError(error)
      res.status(503).json({ error: 'Day-closure status is temporarily unavailable.', requestId: req.requestId || null })
    }
  })
}

export const __test = { hasBoardData, mergeBoardScoped, queuePostSave }
