const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const ACTIVE_STATUSES = new Set(['Present', 'PTO'])

function parseClock(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ''))) return null
  const [h, m] = String(value).split(':').map(Number)
  return (h * 60) + m
}

function isNight(label, boardId = '') {
  return `${label || ''} ${boardId || ''}`.toLowerCase().includes('night')
}

function localDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function mondayKey(value) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  const day = date.getDay()
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day))
  return localDateKey(date)
}

function workDateForShift(boardShift, boardId, now) {
  const date = new Date(now)
  if (isNight(boardShift, boardId)) {
    const mins = now.getHours() * 60 + now.getMinutes()
    if (mins <= 90) date.setDate(date.getDate() - 1)
  }
  return date
}

function wantedStatus(assignment, boardShift, boardId, now) {
  const clockIn = parseClock(assignment.clockInTime)
  const clockOut = parseClock(assignment.leaveTime)
  if (clockIn == null && clockOut == null) return null

  const currentStatus = assignment.status || 'Present'
  if (!ACTIVE_STATUSES.has(currentStatus)) return null

  const night = isNight(boardShift, boardId)
  let start = clockIn == null ? (night ? 17 * 60 : 8 * 60) : clockIn
  let end = clockOut == null ? (night ? (24 * 60) + 90 : (16 * 60) + 30) : clockOut
  let current = now.getHours() * 60 + now.getMinutes()

  if (night) {
    if (current <= 90) current += 24 * 60
    if (start <= 90) start += 24 * 60
    if (end <= start) end += 24 * 60
  }

  return current >= start && current < end ? 'Present' : 'PTO'
}

function applyBoard(board, boardId, now, builderNames) {
  if (!board?.weeklyData) return board

  const boardShift = board.boardShift || (String(boardId).includes('night') ? 'Night Shift' : 'Day Shift')
  const workDate = workDateForShift(boardShift, boardId, now)
  const weekday = workDate.getDay()
  if (weekday < 1 || weekday > 5) return board

  const dayName = DAYS[weekday - 1]
  const currentWeek = mondayKey(localDateKey(workDate))
  const boardWeek = mondayKey(board.weekStartDate || currentWeek)
  if (boardWeek !== currentWeek) return board

  const currentDay = board.weeklyData[dayName]
  if (!currentDay?.assignments) return board

  let changed = false
  const timestamp = new Date().toISOString()
  const assignments = { ...currentDay.assignments }
  const movementLog = Array.isArray(currentDay.movementLog) ? [...currentDay.movementLog] : []

  Object.entries(currentDay.assignments).forEach(([builderId, assignment]) => {
    const nextStatus = wantedStatus(assignment, boardShift, boardId, now)
    const currentStatus = assignment.status || 'Present'
    if (!nextStatus || nextStatus === currentStatus) return

    changed = true
    const area = assignment.area || 'Unassigned'
    assignments[builderId] = { ...assignment, status: nextStatus, updatedAt: timestamp }
    movementLog.unshift({
      timestamp,
      builder: builderNames.get(builderId) || builderId,
      from: `${area} / ${currentStatus}`,
      to: `${area} / ${nextStatus}`,
      note: 'Automatic status by scheduled Clock In / Clock Out',
    })
  })

  if (!changed) return board

  const weeklyData = {
    ...board.weeklyData,
    [dayName]: {
      ...currentDay,
      assignments,
      movementLog,
      updatedAt: timestamp,
    },
  }

  return {
    ...board,
    weeklyData,
    weeklyBoards: {
      ...(board.weeklyBoards || {}),
      [boardWeek]: weeklyData,
    },
    updatedAt: timestamp,
  }
}

export function applyScheduledStatuses(state, now = new Date()) {
  if (!state || typeof state !== 'object') return state

  const builderNames = new Map((state.builderPool || []).map((builder) => [builder.id, builder.name]))
  const activeId = state.currentBoardId || 'speed_day'
  const active = applyBoard(state, activeId, now, builderNames)
  let changed = active !== state
  let boardStore = active.boardStore || state.boardStore || {}

  Object.entries(boardStore).forEach(([boardId, board]) => {
    if (boardId === activeId) return
    const nextBoard = applyBoard(board, boardId, now, builderNames)
    if (nextBoard === board) return
    if (boardStore === (active.boardStore || state.boardStore || {})) boardStore = { ...boardStore }
    boardStore[boardId] = nextBoard
    changed = true
  })

  if (active !== state) {
    if (boardStore === (active.boardStore || state.boardStore || {})) boardStore = { ...boardStore }
    boardStore[activeId] = {
      ...(boardStore[activeId] || {}),
      boardTitle: active.boardTitle,
      boardShift: active.boardShift,
      selectedDay: active.selectedDay,
      areaDefs: active.areaDefs,
      weekStartDate: active.weekStartDate,
      weeklyData: active.weeklyData,
      weeklyBoards: active.weeklyBoards,
      weeklyHistory: active.weeklyHistory,
      lockedWeeks: active.lockedWeeks,
      commentsBoard: active.commentsBoard,
    }
  }

  return changed ? { ...active, boardStore, updatedAt: new Date().toISOString() } : state
}
