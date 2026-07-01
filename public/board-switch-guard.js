(() => {
  const KEY = 'staffing_board_redo_complete_v2_weekly'
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const BOARDS = {
    speed_day: ['SPEED Staffing Board', 'Day Shift'],
    speed_night: ['SPEED Staffing Board', 'Night Shift'],
    fa_day: ['FA Lab Staffing Board', 'Day Shift'],
    fa_night: ['FA Lab Staffing Board', 'Night Shift'],
    bodega_day: ['Bodega Staffing Board', 'Day Shift'],
    bodega_night: ['Bodega Staffing Board', 'Night Shift'],
  }

  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
  }

  function safeCopy(value, fallback) {
    try { return JSON.parse(JSON.stringify(value ?? fallback)) } catch { return fallback }
  }

  function monday(value) {
    const raw = /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : new Date().toISOString().slice(0, 10)
    const d = new Date(raw + 'T00:00:00')
    if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10)
    const day = d.getDay()
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
    return d.toISOString().slice(0, 10)
  }

  function blankDay() {
    return {
      updatedAt: '', assignments: {}, movementLog: [], attendanceLog: [],
      snapshots: { q1: null, q2: null, q3: null },
      opsMetrics: { targetRackMediaRecovery: '', racksProcessed: '', targetRackPrep: '', racksPrepped: '', recoveredRackPrep: '', totalMediaCount: '', mediaProcessed: '', manualHeadCount: '' },
      rackLists: { prepped: '', processed: '' },
    }
  }

  function cleanWeek(input) {
    const src = isObject(input) ? input : {}
    const out = {}
    DAYS.forEach((day) => {
      const d = isObject(src[day]) ? src[day] : {}
      out[day] = {
        ...blankDay(), ...d,
        assignments: isObject(d.assignments) ? d.assignments : {},
        movementLog: Array.isArray(d.movementLog) ? d.movementLog : [],
        attendanceLog: Array.isArray(d.attendanceLog) ? d.attendanceLog : [],
        snapshots: { q1: null, q2: null, q3: null, ...(isObject(d.snapshots) ? d.snapshots : {}) },
        opsMetrics: { ...blankDay().opsMetrics, ...(isObject(d.opsMetrics) ? d.opsMetrics : {}) },
        rackLists: { ...blankDay().rackLists, ...(isObject(d.rackLists) ? d.rackLists : {}) },
      }
    })
    return out
  }

  function cleanWeekMap(input) {
    const out = {}
    if (!isObject(input)) return out
    Object.entries(input).forEach(([key, value]) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) out[monday(key)] = cleanWeek(value)
    })
    return out
  }

  function hasWeekData(week) {
    return DAYS.some((day) => {
      const d = week?.[day] || {}
      return Object.keys(d.assignments || {}).length ||
        Object.values(d.opsMetrics || {}).some((v) => String(v ?? '').trim()) ||
        Object.values(d.rackLists || {}).some((v) => String(v ?? '').trim())
    })
  }

  function makeBoard(state, id) {
    const preset = BOARDS[id] || BOARDS.speed_day
    const weekStartDate = monday(state.weekStartDate)
    const weeklyData = cleanWeek(state.weeklyData)
    const weeklyBoards = cleanWeekMap(state.weeklyBoards)
    if (hasWeekData(weeklyData)) weeklyBoards[weekStartDate] = weeklyData
    return {
      boardTitle: state.boardTitle || preset[0],
      boardShift: state.boardShift || preset[1],
      selectedDay: DAYS.includes(state.selectedDay) ? state.selectedDay : 'Monday',
      areaDefs: Array.isArray(state.areaDefs) ? state.areaDefs : [],
      weekStartDate,
      weeklyData,
      weeklyBoards,
      weeklyHistory: isObject(state.weeklyHistory) ? state.weeklyHistory : {},
      lockedWeeks: isObject(state.lockedWeeks) ? state.lockedWeeks : {},
      commentsBoard: isObject(state.commentsBoard) ? state.commentsBoard : {},
    }
  }

  function cleanBoard(board, id, fallbackWeek) {
    const preset = BOARDS[id] || BOARDS.speed_day
    const src = isObject(board) ? board : {}
    const weekStartDate = monday(src.weekStartDate || fallbackWeek)
    const weeklyData = cleanWeek(src.weeklyData)
    const weeklyBoards = cleanWeekMap(src.weeklyBoards)
    if (hasWeekData(weeklyData)) weeklyBoards[weekStartDate] = weeklyData
    return {
      ...src,
      boardTitle: src.boardTitle || preset[0],
      boardShift: src.boardShift || preset[1],
      selectedDay: DAYS.includes(src.selectedDay) ? src.selectedDay : 'Monday',
      weekStartDate,
      weeklyData,
      weeklyBoards,
      weeklyHistory: isObject(src.weeklyHistory) ? src.weeklyHistory : {},
      lockedWeeks: isObject(src.lockedWeeks) ? src.lockedWeeks : {},
      commentsBoard: isObject(src.commentsBoard) ? src.commentsBoard : {},
    }
  }

  function sanitize() {
    const raw = localStorage.getItem(KEY)
    if (!raw) return
    try {
      const state = JSON.parse(raw)
      const boardId = BOARDS[state.currentBoardId] ? state.currentBoardId : 'speed_day'
      const weekStartDate = monday(state.weekStartDate)
      const store = isObject(state.boardStore) ? safeCopy(state.boardStore, {}) : {}
      if (!store[boardId]) store[boardId] = makeBoard(state, boardId)
      Object.keys(BOARDS).forEach((id) => { store[id] = cleanBoard(store[id], id, weekStartDate) })
      const active = store[boardId]
      const next = {
        ...state, ...active,
        currentBoardId: boardId,
        boardStore: store,
        builderPool: Array.isArray(state.builderPool) ? state.builderPool : [],
        builderGroups: Array.isArray(state.builderGroups) ? state.builderGroups : [],
      }
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      localStorage.setItem(KEY + '_bad_backup_' + Date.now(), raw)
      localStorage.removeItem(KEY)
    }
  }

  sanitize()
})()
