export const DEFAULT_SITE_TIME_ZONE = 'America/New_York'
export const ACTIVE_WORK_STATUSES = new Set(['Present', 'Training', 'Indirect'])
export const INACTIVE_STATUSES = new Set(['PTO', 'LOA', 'VTO', 'Absent'])
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function clean(value) {
  return String(value || '').trim()
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function makeId(prefix = 'schedule') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function localDateFromDateOnly(dateOnly) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(dateOnly))
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

function addCalendarDays(dateOnly, amount) {
  const parts = localDateFromDateOnly(dateOnly)
  if (!parts) return dateOnly
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount, 12, 0, 0))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function parseTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(clean(value))
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute, totalMinutes: hour * 60 + minute }
}

function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const values = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

export function zonedDateTimeToUtc(local, timeZone = DEFAULT_SITE_TIME_ZONE) {
  const desiredUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second || 0, 0)
  let guess = desiredUtc
  for (let index = 0; index < 4; index += 1) {
    const observed = getZonedParts(new Date(guess), timeZone)
    const observedUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second || 0, 0)
    const delta = desiredUtc - observedUtc
    if (delta === 0) break
    guess += delta
  }
  const result = new Date(guess)
  const verified = getZonedParts(result, timeZone)
  if (
    verified.year !== local.year ||
    verified.month !== local.month ||
    verified.day !== local.day ||
    verified.hour !== local.hour ||
    verified.minute !== local.minute
  ) {
    throw new Error(`The selected local time does not exist in ${timeZone}, likely because of daylight saving time.`)
  }
  return result
}

export function formatInTimeZone(value, timeZone = DEFAULT_SITE_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

function isNightBoard(boardShift, boardId) {
  return `${boardShift || ''} ${boardId || ''}`.toLowerCase().includes('night')
}

function boardShiftFor(board, boardId) {
  if (clean(board?.boardShift)) return board.boardShift
  return isNightBoard('', boardId) ? 'Night Shift' : 'Day Shift'
}

function validateTimeWithinShift(time, boardShift, boardId) {
  const parsed = parseTime(time)
  if (!parsed) throw new Error('Enter a valid time in HH:MM format.')
  if (isNightBoard(boardShift, boardId)) {
    const valid = parsed.totalMinutes >= 17 * 60 || parsed.totalMinutes <= 90
    if (!valid) throw new Error('Night Shift scheduled times must be between 5:00 PM and 1:30 AM.')
  } else if (parsed.totalMinutes < 8 * 60 || parsed.totalMinutes > (16 * 60 + 30)) {
    throw new Error('Day Shift scheduled times must be between 8:00 AM and 4:30 PM.')
  }
  return parsed
}

function operationalDateFor(weekStartDate, dayName) {
  const index = WEEKDAYS.indexOf(dayName)
  if (index < 0) throw new Error('Select a valid operational day.')
  return addCalendarDays(weekStartDate, index)
}

export function buildScheduledTimestamp({ weekStartDate, day, time, boardShift, boardId, timeZone = DEFAULT_SITE_TIME_ZONE }) {
  const parsed = validateTimeWithinShift(time, boardShift, boardId)
  const operationalDate = operationalDateFor(weekStartDate, day)
  const calendarDate = isNightBoard(boardShift, boardId) && parsed.totalMinutes <= 90
    ? addCalendarDays(operationalDate, 1)
    : operationalDate
  const parts = localDateFromDateOnly(calendarDate)
  if (!parts) throw new Error('The selected week start date is invalid.')
  const scheduled = zonedDateTimeToUtc({ ...parts, hour: parsed.hour, minute: parsed.minute, second: 0 }, timeZone)
  return { scheduledAt: scheduled.toISOString(), operationalDate, calendarDate }
}

function normalizeDay(day) {
  return {
    ...(isObject(day) ? day : {}),
    assignments: isObject(day?.assignments) ? day.assignments : {},
    movementLog: Array.isArray(day?.movementLog) ? day.movementLog : [],
    attendanceLog: Array.isArray(day?.attendanceLog) ? day.attendanceLog : [],
  }
}

function boardScopedSnapshot(state) {
  return {
    boardTitle: state.boardTitle,
    boardShift: state.boardShift,
    selectedDay: state.selectedDay,
    areaDefs: state.areaDefs,
    weekStartDate: state.weekStartDate,
    weeklyData: state.weeklyData,
    weeklyBoards: state.weeklyBoards,
    weeklyHistory: state.weeklyHistory,
    lockedWeeks: state.lockedWeeks,
    commentsBoard: state.commentsBoard,
  }
}

function getBoard(state, boardId) {
  if ((state.currentBoardId || 'speed_day') === boardId) return state
  return state.boardStore?.[boardId] || null
}

function writeBoard(state, boardId, board) {
  const activeId = state.currentBoardId || 'speed_day'
  state.boardStore = isObject(state.boardStore) ? state.boardStore : {}
  state.boardStore[boardId] = clone(board)
  if (boardId === activeId) {
    Object.assign(state, boardScopedSnapshot(board))
    state.boardStore[boardId] = clone(boardScopedSnapshot(state))
  }
}

function ensureBoard(state, boardId) {
  const existing = getBoard(state, boardId)
  if (!existing) throw new Error('The selected board could not be found.')
  const board = clone(existing)
  board.weeklyBoards = isObject(board.weeklyBoards) ? board.weeklyBoards : {}
  board.weeklyData = isObject(board.weeklyData) ? board.weeklyData : {}
  board.lockedWeeks = isObject(board.lockedWeeks) ? board.lockedWeeks : {}
  return board
}

function ensureWeekDay(board, weekStartDate, dayName) {
  const currentWeek = clean(board.weekStartDate)
  let weekData = board.weeklyBoards?.[weekStartDate]
  if (!isObject(weekData) && currentWeek === weekStartDate) weekData = board.weeklyData
  weekData = isObject(weekData) ? clone(weekData) : {}
  const day = normalizeDay(weekData[dayName])
  weekData[dayName] = day
  board.weeklyBoards = { ...(board.weeklyBoards || {}), [weekStartDate]: weekData }
  if (currentWeek === weekStartDate) board.weeklyData = weekData
  return { weekData, day }
}

function builderName(state, builderId) {
  return state.builderPool?.find((builder) => builder.id === builderId)?.name || builderId
}

function trimArray(value, limit) {
  return (Array.isArray(value) ? value : []).slice(0, limit)
}

function pushScheduleHistory(assignment, event) {
  assignment.scheduleHistory = [event, ...trimArray(assignment.scheduleHistory, 49)]
}

function addAudit(state, context, entry) {
  const row = {
    id: entry.id || makeId('audit'),
    timestamp: entry.timestamp,
    admin: entry.admin || 'System',
    board: context.boardTitle || context.boardId,
    boardId: context.boardId,
    shift: context.boardShift,
    week: context.weekStartDate,
    day: context.day,
    builder: entry.builder || '',
    builderId: context.builderId || '',
    action: entry.action || 'Scheduled transition',
    oldValue: entry.oldValue || '',
    newValue: entry.newValue || '',
    transitionId: entry.transitionId || '',
    effectiveAt: entry.effectiveAt || '',
    processedAt: entry.processedAt || '',
    delayed: !!entry.delayed,
    source: entry.source || 'Scheduling System',
  }
  state.auditLog = [row, ...trimArray(state.auditLog, 499)]
  return row
}

function addMovement(day, context, entry) {
  const row = {
    id: entry.id || makeId('move'),
    timestamp: entry.timestamp,
    admin: entry.admin || 'System',
    builder: entry.builder,
    builderId: context.builderId,
    from: entry.from,
    to: entry.to,
    fromArea: entry.fromArea || '',
    toArea: entry.toArea || '',
    fromStatus: entry.fromStatus || '',
    toStatus: entry.toStatus || '',
    note: entry.note,
    action: entry.action,
    transitionId: entry.transitionId || '',
    effectiveAt: entry.effectiveAt || '',
    processedAt: entry.processedAt || '',
    delayed: !!entry.delayed,
  }
  const existing = day.movementLog || []
  if (row.transitionId && existing.some((item) => item.transitionId === row.transitionId && item.action === row.action)) return null
  day.movementLog = [row, ...existing].slice(0, 1000)
  return row
}

function addNotification(state, notification) {
  const currentRevision = Number(state.scheduleRevision || 0)
  state.scheduleRevision = currentRevision + 1
  const item = { ...notification, revision: state.scheduleRevision }
  state.scheduleNotifications = [item, ...trimArray(state.scheduleNotifications, 39)]
  return item
}

function closeOpenAreaSession(assignment, effectiveAt) {
  const history = Array.isArray(assignment.areaHistory) ? clone(assignment.areaHistory) : []
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index]
    if (item?.startIso && !item.endIso) {
      history[index] = { ...item, endIso: effectiveAt }
      break
    }
  }
  assignment.areaHistory = history
}

function openAreaSession(assignment, area, effectiveAt) {
  if (!area || area === 'Unassigned') return
  assignment.areaHistory = Array.isArray(assignment.areaHistory) ? clone(assignment.areaHistory) : []
  assignment.areaHistory.push({ area, startIso: effectiveAt, endIso: '' })
}

function scheduleField(type) {
  return type === 'clock_in' ? 'scheduledClockIn' : 'scheduledClockOut'
}

function timeField(type) {
  return type === 'clock_in' ? 'clockInTime' : 'leaveTime'
}

function friendlyType(type) {
  return type === 'clock_in' ? 'clock in' : 'clock out'
}

function transitionContext(board, input) {
  return {
    boardId: input.boardId,
    boardTitle: board.boardTitle || input.boardId,
    boardShift: boardShiftFor(board, input.boardId),
    weekStartDate: input.weekStartDate,
    day: input.day,
    builderId: input.builderId,
  }
}

function lockedWeek(board, weekStartDate) {
  return !!board.lockedWeeks?.[weekStartDate]
}

function validateBuilderAssignment(state, day, builderId) {
  if (!state.builderPool?.some((builder) => builder.id === builderId)) throw new Error('The selected builder is not in the permanent Builder Master List.')
  const assignment = day.assignments?.[builderId]
  if (!isObject(assignment)) throw new Error('The selected builder is not assigned to this operational day.')
  return assignment
}

function cancelPendingOnAssignment(assignment, field, actor, nowIso, reason) {
  const pending = assignment[field]
  if (!pending || pending.status !== 'pending') return null
  const canceled = {
    ...pending,
    status: 'canceled',
    canceledAt: nowIso,
    canceledBy: actor,
    cancelReason: reason,
  }
  pushScheduleHistory(assignment, canceled)
  assignment[field] = null
  return canceled
}

export function createScheduledTransition(inputState, input, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now())
  const nowIso = now.toISOString()
  const timeZone = options.timeZone || DEFAULT_SITE_TIME_ZONE
  const actor = clean(options.actor || input.actor || 'System') || 'System'
  const state = clone(inputState)
  const board = ensureBoard(state, input.boardId)
  const context = transitionContext(board, input)
  if (lockedWeek(board, input.weekStartDate)) throw new Error('This week is locked. Unlock it before scheduling a transition.')
  const { day } = ensureWeekDay(board, input.weekStartDate, input.day)
  const assignment = validateBuilderAssignment(state, day, input.builderId)
  const currentStatus = assignment.status || 'Present'
  if (input.type === 'clock_in' && currentStatus !== 'PTO') throw new Error('Scheduled clock-in requires the builder to be in PTO status.')
  if (input.type === 'clock_out' && !ACTIVE_WORK_STATUSES.has(currentStatus)) throw new Error('Scheduled clock-out requires an active working status.')

  const { scheduledAt, operationalDate, calendarDate } = buildScheduledTimestamp({
    weekStartDate: input.weekStartDate,
    day: input.day,
    time: input.time,
    boardShift: context.boardShift,
    boardId: input.boardId,
    timeZone,
  })
  const otherField = scheduleField(input.type === 'clock_in' ? 'clock_out' : 'clock_in')
  const other = assignment[otherField]
  if (other?.status === 'pending' && other.scheduledAt === scheduledAt) throw new Error('Clock-in and clock-out cannot be scheduled for the same timestamp.')

  const field = scheduleField(input.type)
  const replaced = cancelPendingOnAssignment(assignment, field, actor, nowIso, 'Replaced by a newer scheduled time')
  const event = {
    id: makeId(input.type),
    type: input.type,
    status: 'pending',
    scheduledAt,
    effectiveAt: scheduledAt,
    localTime: input.time,
    timeZone,
    operationalDate,
    calendarDate,
    boardId: input.boardId,
    boardShift: context.boardShift,
    weekStartDate: input.weekStartDate,
    day: input.day,
    builderId: input.builderId,
    createdAt: nowIso,
    createdBy: actor,
  }
  assignment[field] = event
  assignment[timeField(input.type)] = input.time
  assignment.updatedAt = nowIso
  day.assignments[input.builderId] = assignment
  day.updatedAt = nowIso
  const name = builderName(state, input.builderId)
  addMovement(day, context, {
    timestamp: nowIso,
    admin: actor,
    builder: name,
    from: replaced ? `${friendlyType(input.type)} ${replaced.localTime}` : 'No pending schedule',
    to: `${friendlyType(input.type)} ${input.time}`,
    note: `${actor} scheduled ${name} to ${friendlyType(input.type)} at ${input.time}.`,
    action: replaced ? 'Edit Scheduled Transition' : 'Create Scheduled Transition',
    transitionId: event.id,
  })
  addAudit(state, context, {
    timestamp: nowIso,
    admin: actor,
    builder: name,
    action: replaced ? `Changed scheduled ${friendlyType(input.type)}` : `Scheduled ${friendlyType(input.type)}`,
    oldValue: replaced?.localTime || '',
    newValue: `${input.time} (${timeZone})`,
    transitionId: event.id,
    effectiveAt: scheduledAt,
  })
  const notification = addNotification(state, {
    id: event.id,
    at: nowIso,
    type: 'scheduled',
    message: `${name} is scheduled to ${friendlyType(input.type)} at ${input.time}.`,
    boardId: input.boardId,
    weekStartDate: input.weekStartDate,
    day: input.day,
    builderId: input.builderId,
  })
  writeBoard(state, input.boardId, board)

  const dueResult = new Date(scheduledAt).getTime() <= now.getTime()
    ? processDueScheduledTransitions(state, now, { timeZone, actor: 'System' })
    : { state, changed: true, events: [], nextDueAt: getNextPendingTransitionAt(state) }
  return {
    ...dueResult,
    scheduledEvent: event,
    notification,
    changed: true,
  }
}

export function cancelScheduledTransition(inputState, input, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now())
  const nowIso = now.toISOString()
  const actor = clean(options.actor || input.actor || 'System') || 'System'
  const state = clone(inputState)
  const board = ensureBoard(state, input.boardId)
  const context = transitionContext(board, input)
  if (lockedWeek(board, input.weekStartDate)) throw new Error('This week is locked. Unlock it before changing a schedule.')
  const { day } = ensureWeekDay(board, input.weekStartDate, input.day)
  const assignment = validateBuilderAssignment(state, day, input.builderId)
  const fields = input.type === 'all' ? ['scheduledClockIn', 'scheduledClockOut'] : [scheduleField(input.type)]
  const canceled = fields.map((field) => cancelPendingOnAssignment(assignment, field, actor, nowIso, input.reason || 'Canceled by admin')).filter(Boolean)
  if (!canceled.length) return { state: inputState, changed: false, events: [], nextDueAt: getNextPendingTransitionAt(inputState) }
  assignment.updatedAt = nowIso
  day.updatedAt = nowIso
  const name = builderName(state, input.builderId)
  canceled.forEach((event) => {
    addMovement(day, context, {
      timestamp: nowIso,
      admin: actor,
      builder: name,
      from: `${friendlyType(event.type)} ${event.localTime}`,
      to: 'Canceled',
      note: `${actor} canceled ${name}'s scheduled ${friendlyType(event.type)}.`,
      action: 'Cancel Scheduled Transition',
      transitionId: event.id,
    })
    addAudit(state, context, {
      timestamp: nowIso,
      admin: actor,
      builder: name,
      action: `Canceled scheduled ${friendlyType(event.type)}`,
      oldValue: event.localTime,
      newValue: input.reason || 'Canceled',
      transitionId: event.id,
      effectiveAt: event.scheduledAt,
    })
  })
  writeBoard(state, input.boardId, board)
  addNotification(state, {
    id: makeId('cancel'),
    at: nowIso,
    type: 'canceled',
    message: `${name}'s pending scheduled transition was canceled.`,
    boardId: input.boardId,
    weekStartDate: input.weekStartDate,
    day: input.day,
    builderId: input.builderId,
  })
  return { state, changed: true, events: canceled, nextDueAt: getNextPendingTransitionAt(state) }
}

function applyTransitionToAssignment(state, day, context, assignment, event, now, actor) {
  const nowIso = now.toISOString()
  const effectiveAt = event.scheduledAt || nowIso
  const processedMs = now.getTime()
  const effectiveMs = new Date(effectiveAt).getTime()
  const delayed = Number.isFinite(effectiveMs) && processedMs - effectiveMs > 5000
  const previousStatus = assignment.status || 'Present'
  const previousArea = assignment.area || 'Unassigned'
  const name = builderName(state, context.builderId)
  let nextStatus
  const nextArea = 'Unassigned'

  if (event.type === 'clock_out') {
    if (!ACTIVE_WORK_STATUSES.has(previousStatus)) return { applied: false, reason: `Builder is no longer in an active working status (${previousStatus}).` }
    closeOpenAreaSession(assignment, effectiveAt)
    assignment.status = 'PTO'
    assignment.area = ''
    assignment.subArea = ''
    assignment.role = ''
    assignment.lastAreaBeforeClockOut = previousArea === 'Unassigned' ? '' : previousArea
    assignment.effectiveClockOutIso = effectiveAt
    nextStatus = 'PTO'
  } else {
    if (previousStatus !== 'PTO') return { applied: false, reason: `Builder is no longer in PTO status (${previousStatus}).` }
    assignment.status = 'Present'
    assignment.area = ''
    assignment.subArea = ''
    assignment.role = ''
    assignment.sessionStartIso = effectiveAt
    assignment.effectiveClockInIso = effectiveAt
    nextStatus = 'Present'
  }

  const processed = {
    ...event,
    status: 'processed',
    processedAt: nowIso,
    effectiveAt,
    processedBy: actor,
    delayed,
    previousStatus,
    previousArea,
    newStatus: nextStatus,
    newArea: nextArea,
  }
  const field = scheduleField(event.type)
  assignment[field] = null
  pushScheduleHistory(assignment, processed)
  assignment.updatedAt = nowIso
  day.updatedAt = nowIso

  const message = event.type === 'clock_out'
    ? `${name} was automatically clocked out at ${event.localTime} and moved to PTO.`
    : `${name} was automatically clocked in at ${event.localTime} and moved to Unassigned.`
  addMovement(day, context, {
    timestamp: nowIso,
    admin: actor,
    builder: name,
    from: `${previousArea} / ${previousStatus}`,
    to: `${nextArea} / ${nextStatus}`,
    fromArea: previousArea,
    toArea: nextArea,
    fromStatus: previousStatus,
    toStatus: nextStatus,
    note: message,
    action: event.type === 'clock_out' ? 'Automatic Clock Out' : 'Automatic Clock In',
    transitionId: event.id,
    effectiveAt,
    processedAt: nowIso,
    delayed,
  })
  addAudit(state, context, {
    timestamp: nowIso,
    admin: actor,
    builder: name,
    action: event.type === 'clock_out' ? 'Automatic Clock Out' : 'Automatic Clock In',
    oldValue: `${previousArea} / ${previousStatus}`,
    newValue: `${nextArea} / ${nextStatus}`,
    transitionId: event.id,
    effectiveAt,
    processedAt: nowIso,
    delayed,
  })
  const notification = addNotification(state, {
    id: event.id,
    at: nowIso,
    effectiveAt,
    type: event.type,
    message,
    delayed,
    boardId: context.boardId,
    weekStartDate: context.weekStartDate,
    day: context.day,
    builderId: context.builderId,
  })
  return { applied: true, processed, notification }
}

function cancelStaleEvent(state, day, context, assignment, event, now, actor, reason) {
  const nowIso = now.toISOString()
  const field = scheduleField(event.type)
  const canceled = {
    ...event,
    status: 'canceled',
    canceledAt: nowIso,
    canceledBy: actor,
    cancelReason: reason,
  }
  assignment[field] = null
  pushScheduleHistory(assignment, canceled)
  assignment.updatedAt = nowIso
  day.updatedAt = nowIso
  const name = builderName(state, context.builderId)
  addMovement(day, context, {
    timestamp: nowIso,
    admin: actor,
    builder: name,
    from: `${friendlyType(event.type)} ${event.localTime}`,
    to: 'Canceled as stale',
    note: `Scheduled transition was canceled because ${reason}`,
    action: 'Cancel Stale Scheduled Transition',
    transitionId: event.id,
  })
  addAudit(state, context, {
    timestamp: nowIso,
    admin: actor,
    builder: name,
    action: 'Canceled stale scheduled transition',
    oldValue: `${friendlyType(event.type)} ${event.localTime}`,
    newValue: reason,
    transitionId: event.id,
    effectiveAt: event.scheduledAt,
  })
  addNotification(state, {
    id: event.id,
    at: nowIso,
    type: 'stale-canceled',
    message: `${name}'s scheduled ${friendlyType(event.type)} was canceled because a newer manual change took precedence.`,
    boardId: context.boardId,
    weekStartDate: context.weekStartDate,
    day: context.day,
    builderId: context.builderId,
  })
  return canceled
}

function boardIdsInState(state) {
  return Array.from(new Set([state.currentBoardId || 'speed_day', ...Object.keys(state.boardStore || {})]))
}

function weekEntriesForBoard(board) {
  const entries = new Map(Object.entries(isObject(board.weeklyBoards) ? board.weeklyBoards : {}))
  if (clean(board.weekStartDate) && isObject(board.weeklyData)) entries.set(board.weekStartDate, board.weeklyData)
  return entries
}

export function processDueScheduledTransitions(inputState, nowInput = new Date(), options = {}) {
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput)
  const nowMs = now.getTime()
  const actor = clean(options.actor || 'System') || 'System'
  const state = clone(inputState)
  const processedEvents = []
  let changed = false

  for (const boardId of boardIdsInState(state)) {
    const originalBoard = getBoard(state, boardId)
    if (!originalBoard) continue
    const board = clone(originalBoard)
    const boardShift = boardShiftFor(board, boardId)
    const entries = weekEntriesForBoard(board)
    let boardChanged = false

    for (const [weekStartDate, sourceWeek] of entries) {
      const weekData = clone(sourceWeek)
      let weekChanged = false
      for (const dayName of WEEKDAYS) {
        const day = normalizeDay(weekData?.[dayName])
        let dayChanged = false
        for (const [builderId, sourceAssignment] of Object.entries(day.assignments || {})) {
          const assignment = clone(sourceAssignment)
          let assignmentChanged = false
          for (const type of ['clock_in', 'clock_out']) {
            const field = scheduleField(type)
            const event = assignment[field]
            if (!event || event.status !== 'pending') continue
            const context = { boardId, boardTitle: board.boardTitle, boardShift, weekStartDate, day: dayName, builderId }
            if (
              event.boardId !== boardId ||
              event.weekStartDate !== weekStartDate ||
              event.day !== dayName ||
              event.builderId !== builderId
            ) {
              processedEvents.push(cancelStaleEvent(state, day, context, assignment, event, now, actor, 'its saved board, week, day, or builder context no longer matches'))
              assignmentChanged = true
              changed = true
              continue
            }
            const dueMs = new Date(event.scheduledAt).getTime()
            if (!Number.isFinite(dueMs) || nowMs < dueMs) continue
            const result = applyTransitionToAssignment(state, day, context, assignment, event, now, actor)
            if (result.applied) processedEvents.push(result.processed)
            else processedEvents.push(cancelStaleEvent(state, day, context, assignment, event, now, actor, result.reason))
            assignmentChanged = true
            changed = true
          }
          if (assignmentChanged) {
            day.assignments[builderId] = assignment
            dayChanged = true
          }
        }
        if (dayChanged) {
          weekData[dayName] = day
          weekChanged = true
        }
      }
      if (weekChanged) {
        board.weeklyBoards = { ...(board.weeklyBoards || {}), [weekStartDate]: weekData }
        if (board.weekStartDate === weekStartDate) board.weeklyData = weekData
        boardChanged = true
      }
    }
    if (boardChanged) {
      board.updatedAt = now.toISOString()
      writeBoard(state, boardId, board)
    }
  }

  if (changed) state.updatedAt = now.toISOString()
  return { state: changed ? state : inputState, changed, events: processedEvents, nextDueAt: getNextPendingTransitionAt(changed ? state : inputState) }
}

export function getNextPendingTransitionAt(state) {
  let next = null
  for (const boardId of boardIdsInState(state || {})) {
    const board = getBoard(state, boardId)
    if (!board) continue
    for (const [, weekData] of weekEntriesForBoard(board)) {
      for (const dayName of WEEKDAYS) {
        const assignments = weekData?.[dayName]?.assignments || {}
        for (const assignment of Object.values(assignments)) {
          for (const field of ['scheduledClockIn', 'scheduledClockOut']) {
            const event = assignment?.[field]
            if (!event || event.status !== 'pending') continue
            const ms = new Date(event.scheduledAt).getTime()
            if (!Number.isFinite(ms)) continue
            if (next == null || ms < next) next = ms
          }
        }
      }
    }
  }
  return next == null ? null : new Date(next).toISOString()
}

export function applyImmediateTransition(inputState, input, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now())
  const actor = clean(options.actor || input.actor || 'System') || 'System'
  const canceled = cancelScheduledTransition(inputState, { ...input, type: 'all', reason: `Manual ${friendlyType(input.type)} override` }, { now, actor })
  const state = clone(canceled.state)
  const board = ensureBoard(state, input.boardId)
  const context = transitionContext(board, input)
  if (lockedWeek(board, input.weekStartDate)) throw new Error('This week is locked. Unlock it before changing attendance.')
  const { day } = ensureWeekDay(board, input.weekStartDate, input.day)
  const assignment = validateBuilderAssignment(state, day, input.builderId)
  const event = {
    id: makeId(`manual-${input.type}`),
    type: input.type,
    status: 'pending',
    scheduledAt: now.toISOString(),
    effectiveAt: now.toISOString(),
    localTime: new Intl.DateTimeFormat('en-US', { timeZone: options.timeZone || DEFAULT_SITE_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now),
    timeZone: options.timeZone || DEFAULT_SITE_TIME_ZONE,
    boardId: input.boardId,
    boardShift: context.boardShift,
    weekStartDate: input.weekStartDate,
    day: input.day,
    builderId: input.builderId,
    createdAt: now.toISOString(),
    createdBy: actor,
    manual: true,
  }
  const applied = applyTransitionToAssignment(state, day, context, assignment, event, now, actor)
  if (!applied.applied) throw new Error(applied.reason)
  day.assignments[input.builderId] = assignment
  writeBoard(state, input.boardId, board)
  return { state, changed: true, events: [applied.processed], nextDueAt: getNextPendingTransitionAt(state) }
}

export function applyManualAssignmentOverride(inputState, input, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now())
  const actor = clean(options.actor || input.actor || 'System') || 'System'
  const canceled = cancelScheduledTransition(inputState, { ...input, type: 'all', reason: 'Canceled by manual status or area change' }, { now, actor })
  const state = clone(canceled.state)
  const board = ensureBoard(state, input.boardId)
  const context = transitionContext(board, input)
  if (lockedWeek(board, input.weekStartDate)) throw new Error('This week is locked. Unlock it before editing a builder.')
  const { day } = ensureWeekDay(board, input.weekStartDate, input.day)
  const assignment = validateBuilderAssignment(state, day, input.builderId)
  const beforeStatus = assignment.status || 'Present'
  const beforeArea = assignment.area || 'Unassigned'
  const nextStatus = input.patch?.status ?? beforeStatus
  let nextAreaRaw = input.patch?.area ?? assignment.area ?? ''
  if (INACTIVE_STATUSES.has(nextStatus)) nextAreaRaw = ''
  const nextArea = nextAreaRaw || 'Unassigned'
  if (beforeArea !== nextArea || beforeStatus !== nextStatus) {
    if (ACTIVE_WORK_STATUSES.has(beforeStatus) && beforeArea !== 'Unassigned') closeOpenAreaSession(assignment, now.toISOString())
    assignment.status = nextStatus
    assignment.area = nextArea === 'Unassigned' ? '' : nextArea
    if (ACTIVE_WORK_STATUSES.has(nextStatus) && nextArea !== 'Unassigned') openAreaSession(assignment, nextArea, now.toISOString())
    assignment.updatedAt = now.toISOString()
    day.updatedAt = now.toISOString()
    const name = builderName(state, input.builderId)
    addMovement(day, context, {
      timestamp: now.toISOString(),
      admin: actor,
      builder: name,
      from: `${beforeArea} / ${beforeStatus}`,
      to: `${nextArea} / ${nextStatus}`,
      fromArea: beforeArea,
      toArea: nextArea,
      fromStatus: beforeStatus,
      toStatus: nextStatus,
      note: 'Manual status or area change; pending schedules canceled.',
      action: 'Manual Assignment Override',
    })
    addAudit(state, context, {
      timestamp: now.toISOString(),
      admin: actor,
      builder: name,
      action: 'Manual Assignment Override',
      oldValue: `${beforeArea} / ${beforeStatus}`,
      newValue: `${nextArea} / ${nextStatus}`,
    })
  }
  day.assignments[input.builderId] = assignment
  writeBoard(state, input.boardId, board)
  return { state, changed: true, events: canceled.events || [], nextDueAt: getNextPendingTransitionAt(state) }
}

export function reconcileIncomingManualChanges(existingState, incomingState, options = {}) {
  const actor = clean(options.actor || 'System') || 'System'
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now())
  let resultState = clone(incomingState)
  let changed = false
  for (const boardId of boardIdsInState(existingState || {})) {
    const existingBoard = getBoard(existingState, boardId)
    const incomingBoard = getBoard(resultState, boardId)
    if (!existingBoard || !incomingBoard) continue
    for (const [weekStartDate, existingWeek] of weekEntriesForBoard(existingBoard)) {
      const incomingWeek = weekEntriesForBoard(incomingBoard).get(weekStartDate)
      if (!incomingWeek) continue
      for (const day of WEEKDAYS) {
        for (const [builderId, existingAssignment] of Object.entries(existingWeek?.[day]?.assignments || {})) {
          const incomingAssignment = incomingWeek?.[day]?.assignments?.[builderId]
          if (!incomingAssignment) continue
          const hasPending = existingAssignment.scheduledClockIn?.status === 'pending' || existingAssignment.scheduledClockOut?.status === 'pending'
          if (!hasPending) continue
          const statusChanged = (existingAssignment.status || 'Present') !== (incomingAssignment.status || 'Present')
          const areaChanged = (existingAssignment.area || '') !== (incomingAssignment.area || '')
          if (!statusChanged && !areaChanged) continue
          const override = applyManualAssignmentOverride(resultState, {
            boardId,
            weekStartDate,
            day,
            builderId,
            patch: { status: incomingAssignment.status || 'Present', area: incomingAssignment.area || '' },
          }, { now, actor })
          resultState = override.state
          changed = true
        }
      }
    }
  }
  return { state: changed ? resultState : incomingState, changed }
}
