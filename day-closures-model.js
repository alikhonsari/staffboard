export const CLOSURE_SCOPES = Object.freeze({
  ENTIRE_DAY: 'entire_day',
  DAY_SHIFT: 'day_shift',
  NIGHT_SHIFT: 'night_shift',
})

export const CLOSURE_REASONS = Object.freeze([
  'Holiday', 'Building Closure', 'Severe Weather', 'Maintenance',
  'Emergency', 'Planned Shutdown', 'Other',
])

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const BOARD_KEYS = [
  'boardTitle', 'boardShift', 'selectedDay', 'areaDefs', 'weekStartDate',
  'weeklyData', 'weeklyBoards', 'weeklyHistory', 'lockedWeeks',
  'commentsBoard', 'dayTemplates', 'auditLog',
]

export const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value))
export const clean = (value) => String(value || '').trim()
export const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value)
export const makeId = (prefix = 'closure') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
export const trimArray = (value, limit) => (Array.isArray(value) ? value : []).slice(0, limit)

export function operationIdForBoard(boardId) {
  const value = clean(boardId).toLowerCase()
  if (!value) throw new Error('Select a valid operation board.')
  return value.replace(/_(day|night)$/, '')
}

export function boardIdsForClosure(boardId, scope) {
  const id = operationIdForBoard(boardId)
  if (scope === CLOSURE_SCOPES.ENTIRE_DAY) return [`${id}_day`, `${id}_night`]
  if (scope === CLOSURE_SCOPES.DAY_SHIFT) return [`${id}_day`]
  if (scope === CLOSURE_SCOPES.NIGHT_SHIFT) return [`${id}_night`]
  throw new Error('Choose Entire Day, Day Shift, or Night Shift.')
}

export function closureSlotForScope(scope) {
  if (scope === CLOSURE_SCOPES.ENTIRE_DAY) return 'entireDay'
  if (scope === CLOSURE_SCOPES.DAY_SHIFT) return 'dayShift'
  if (scope === CLOSURE_SCOPES.NIGHT_SHIFT) return 'nightShift'
  throw new Error('Choose Entire Day, Day Shift, or Night Shift.')
}

export const scopeForBoard = (boardId) => /_night$/i.test(clean(boardId)) ? CLOSURE_SCOPES.NIGHT_SHIFT : CLOSURE_SCOPES.DAY_SHIFT
export const closureDisplayReason = (closure) => !closure ? '' : closure.reason === 'Other' ? clean(closure.customReason) || 'Other' : clean(closure.reason)

export function normalizeClosures(state) {
  state.dayClosures = isObject(state.dayClosures) ? state.dayClosures : {}
  state.closureNotifications = Array.isArray(state.closureNotifications) ? state.closureNotifications : []
  state.closureRevision = Number(state.closureRevision || 0)
  state.auditLog = Array.isArray(state.auditLog) ? state.auditLog : []
  state.scheduleNotifications = Array.isArray(state.scheduleNotifications) ? state.scheduleNotifications : []
  state.scheduleRevision = Number(state.scheduleRevision || 0)
  return state
}

export function getOperationalClosure(state, input = {}) {
  const operationId = operationIdForBoard(input.boardId)
  const record = state?.dayClosures?.[operationId]?.[clean(input.weekStartDate)]?.[clean(input.day)]
  if (!record) return null
  if (record.entireDay?.closed) return { ...record.entireDay, scope: CLOSURE_SCOPES.ENTIRE_DAY, slot: 'entireDay', operationId }
  const slot = scopeForBoard(input.boardId) === CLOSURE_SCOPES.NIGHT_SHIFT ? 'nightShift' : 'dayShift'
  if (!record[slot]?.closed) return null
  return { ...record[slot], scope: slot === 'nightShift' ? CLOSURE_SCOPES.NIGHT_SHIFT : CLOSURE_SCOPES.DAY_SHIFT, slot, operationId }
}

export const isOperationalDayClosed = (state, input = {}) => !!getOperationalClosure(state, input)

export function assertOperationalDayOpen(state, input = {}) {
  const closure = getOperationalClosure(state, input)
  if (!closure) return true
  const scope = closure.scope === CLOSURE_SCOPES.ENTIRE_DAY ? 'entire operational day' : closure.scope.replace('_', ' ')
  const reason = closureDisplayReason(closure)
  throw new Error(`This ${scope} is closed${reason ? ` for ${reason}` : ''}. Reopen it before changing staffing or scheduling.`)
}

export function validateCommonInput(input) {
  if (!clean(input?.boardId)) throw new Error('Missing boardId.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(input?.weekStartDate))) throw new Error('Choose a valid week start date.')
  if (!WEEKDAYS.includes(clean(input?.day))) throw new Error('Choose a valid operational day.')
  if (!Object.values(CLOSURE_SCOPES).includes(input?.scope)) throw new Error('Choose Entire Day, Day Shift, or Night Shift.')
}

export function validateCloseRequest(input) {
  validateCommonInput(input)
  if (!CLOSURE_REASONS.includes(input.reason)) throw new Error('Choose a valid closure reason.')
  if (input.reason === 'Other' && !clean(input.customReason)) throw new Error('Enter a custom reason when Other is selected.')
  if (clean(input.note).length > 1000) throw new Error('Closure note must be 1,000 characters or fewer.')
}

export const boardFor = (state, boardId) => (state.currentBoardId || 'speed_day') === boardId ? state : state.boardStore?.[boardId] || null

export function dayRefs(board, weekStartDate, dayName) {
  if (!board) return []
  const refs = []
  const archived = board.weeklyBoards?.[weekStartDate]?.[dayName]
  if (isObject(archived)) refs.push(archived)
  if (clean(board.weekStartDate) === weekStartDate) {
    const active = board.weeklyData?.[dayName]
    if (isObject(active) && !refs.includes(active)) refs.push(active)
  }
  return refs
}

export function syncActiveBoardStore(state, boardId) {
  if ((state.currentBoardId || 'speed_day') !== boardId) return
  state.boardStore = isObject(state.boardStore) ? state.boardStore : {}
  state.boardStore[boardId] = Object.fromEntries(BOARD_KEYS.filter((key) => state[key] !== undefined).map((key) => [key, clone(state[key])]))
}

export function assertClosureWeeksUnlocked(state, input) {
  const locked = boardIdsForClosure(input.boardId, input.scope).some((id) => !!boardFor(state, id)?.lockedWeeks?.[input.weekStartDate])
  if (locked) throw new Error('This week is locked. Unlock it before closing or reopening the operational day.')
}

export function addAudit(state, row) {
  const id = row.id || makeId('audit')
  if (state.auditLog.some((item) => item.id === id)) return
  state.auditLog = [{
    id, timestamp: row.timestamp, admin: row.admin || 'System',
    board: row.board || row.boardId || '', boardId: row.boardId || '', shift: row.shift || '',
    week: row.weekStartDate || '', day: row.day || '', builder: row.builder || '', builderId: row.builderId || '',
    action: row.action, actionType: row.actionType || row.action, oldValue: row.oldValue || '', newValue: row.newValue || '',
    closureId: row.closureId || '', transitionId: row.transitionId || '', source: row.source || 'Day Closure System',
  }, ...trimArray(state.auditLog, 499)]
}

const builderName = (state, id) => state.builderPool?.find((builder) => builder.id === id)?.name || id
const addMovement = (day, row) => {
  day.movementLog = Array.isArray(day.movementLog) ? day.movementLog : []
  if (!day.movementLog.some((item) => item.id === row.id)) day.movementLog = [row, ...day.movementLog].slice(0, 1000)
}

export function hasHistoricalDayData(day) {
  if (!isObject(day)) return false
  return Object.keys(day.assignments || {}).length > 0 || (day.movementLog || []).length > 0 ||
    (day.attendanceLog || []).length > 0 || Object.values(day.opsMetrics || {}).some(clean) || Object.values(day.rackLists || {}).some(clean)
}

export function cancelPendingTransitionsForScope(state, input, actor, nowIso, closureId) {
  const events = []
  const seen = new Set()
  for (const boardId of boardIdsForClosure(input.boardId, input.scope)) {
    const board = boardFor(state, boardId)
    if (!board) continue
    const days = dayRefs(board, input.weekStartDate, input.day)
    const builderIds = new Set(days.flatMap((day) => Object.keys(day.assignments || {})))
    for (const builderId of builderIds) {
      const assignments = days.map((day) => day.assignments?.[builderId]).filter(isObject)
      for (const type of ['clock_in', 'clock_out']) {
        const field = type === 'clock_in' ? 'scheduledClockIn' : 'scheduledClockOut'
        const timeField = type === 'clock_in' ? 'clockInTime' : 'leaveTime'
        const pending = assignments.map((item) => item[field]).find((event) => event?.status === 'pending')
        if (!pending) continue
        const id = pending.id || `${boardId}-${input.weekStartDate}-${input.day}-${builderId}-${type}`
        const canceled = { ...pending, id, status: 'canceled', canceledAt: nowIso, canceledBy: actor, cancelReason: 'Operational day closed', closureId }
        for (const assignment of assignments) {
          if (assignment[field]?.status !== 'pending') continue
          assignment.scheduleHistory = Array.isArray(assignment.scheduleHistory) ? assignment.scheduleHistory : []
          if (!assignment.scheduleHistory.some((item) => item.id === id && item.status === 'canceled')) assignment.scheduleHistory.unshift(canceled)
          assignment.scheduleHistory = assignment.scheduleHistory.slice(0, 50)
          assignment[field] = null
          assignment[timeField] = ''
          assignment.updatedAt = nowIso
        }
        for (const day of days) {
          day.updatedAt = nowIso
          addMovement(day, {
            id: `closure-cancel-${id}`, timestamp: nowIso, admin: actor, builder: builderName(state, builderId), builderId,
            from: `${type === 'clock_in' ? 'clock in' : 'clock out'} ${pending.localTime || ''}`.trim(),
            to: 'Canceled — operational day closed', note: 'Pending scheduled transition canceled because the operational day or shift was closed.',
            action: 'SCHEDULE_CANCELED_BY_CLOSURE', transitionId: id, closureId,
          })
        }
        if (seen.has(id)) continue
        seen.add(id)
        const event = {
          ...canceled, kind: 'closure', actionType: 'SCHEDULE_CANCELED_BY_CLOSURE', boardId,
          boardShift: /_night$/i.test(boardId) ? 'Night Shift' : 'Day Shift', weekStartDate: input.weekStartDate,
          day: input.day, builderId, builder: builderName(state, builderId),
        }
        events.push(event)
        addAudit(state, {
          id: `closure-cancel-${id}`, timestamp: nowIso, admin: actor, board: board.boardTitle || boardId, boardId,
          shift: event.boardShift, weekStartDate: input.weekStartDate, day: input.day, builder: event.builder, builderId,
          action: event.actionType, actionType: event.actionType, oldValue: `${type} ${pending.localTime || pending.scheduledAt || ''}`.trim(),
          newValue: 'Canceled — operational day closed', closureId, transitionId: id,
        })
      }
    }
    syncActiveBoardStore(state, boardId)
  }
  if (events.length) {
    state.scheduleRevision += 1
    state.scheduleNotifications = [{
      id: `closure-schedule-summary-${closureId}`, at: nowIso, type: 'canceled',
      message: `${events.length} pending scheduled transition${events.length === 1 ? '' : 's'} canceled because the operational day was closed.`,
      boardId: input.boardId, weekStartDate: input.weekStartDate, day: input.day, closureId, revision: state.scheduleRevision,
    }, ...trimArray(state.scheduleNotifications, 39)]
  }
  return events
}

export function writeClosureRecord(state, operationId, weekStartDate, day, slot, record) {
  state.dayClosures[operationId] ||= {}
  state.dayClosures[operationId][weekStartDate] ||= {}
  state.dayClosures[operationId][weekStartDate][day] = { ...(state.dayClosures[operationId][weekStartDate][day] || {}), [slot]: record }
}

export function addClosureNotification(state, event) {
  state.closureRevision += 1
  state.closureNotifications = [{
    id: event.id, at: event.timestamp, actionType: event.actionType, message: event.message,
    operationId: event.operationId, boardId: event.boardId, weekStartDate: event.weekStartDate,
    day: event.day, scope: event.scope, revision: state.closureRevision,
  }, ...trimArray(state.closureNotifications, 39)]
}
