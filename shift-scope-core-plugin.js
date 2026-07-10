export function shiftScopeCorePlugin() {
  return {
    name: 'staffboard-shift-scope-core',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      next = next.replace(
        "const BOARD_SCOPED_KEYS = ['boardTitle', 'boardShift', 'selectedDay', 'areaDefs', 'weeklyData', 'weeklyBoards', 'weeklyHistory', 'lockedWeeks', 'commentsBoard']",
        "const BOARD_SCOPED_KEYS = ['boardTitle', 'boardShift', 'selectedDay', 'areaDefs', 'weeklyData', 'weeklyBoards', 'weeklyHistory', 'lockedWeeks', 'commentsBoard', 'dayTemplates', 'auditLog', 'handoffNotes']"
      )

      next = next.replace(
        "  commentsBoard: {\n    safetyObservations: '',",
        "  dayTemplates: [],\n  globalDayTemplates: [],\n  auditLog: [],\n  handoffNotes: '',\n  commentsBoard: {\n    safetyObservations: '',"
      )

      if (!next.includes('function repairShiftScopedState(saved)')) {
        const marker = 'function normalizeState(saved) {'
        const helper = `function repairShiftScopedState(saved) {\n  if (!saved || typeof saved !== 'object') return saved\n  const repaired = clone(saved)\n  const warnings = []\n  const boardId = BOARD_PRESETS[repaired.currentBoardId] ? repaired.currentBoardId : 'speed_day'\n  const preset = BOARD_PRESETS[boardId]\n  repaired.currentBoardId = boardId\n  if (repaired.boardShift && repaired.boardShift !== preset.shift) warnings.push('Shift label repaired to match active board.')\n  if (repaired.boardTitle && repaired.boardTitle !== preset.title) warnings.push('Board title repaired to match active board.')\n  repaired.boardShift = preset.shift\n  repaired.boardTitle = preset.title\n\n  const nextStore = {}\n  Object.entries(repaired.boardStore || {}).forEach(([storedId, stored]) => {\n    if (!stored || typeof stored !== 'object') return\n    if (!BOARD_PRESETS[storedId]) { nextStore[storedId] = clone(stored); return }\n    const storedPreset = BOARD_PRESETS[storedId]\n    const nextBoard = clone(stored)\n    if (nextBoard.boardShift && nextBoard.boardShift !== storedPreset.shift) warnings.push(storedId + ' shift label repaired.')\n    nextBoard.boardShift = storedPreset.shift\n    nextBoard.boardTitle = storedPreset.title\n    nextBoard.dayTemplates = Array.isArray(nextBoard.dayTemplates) ? nextBoard.dayTemplates : []\n    nextBoard.auditLog = Array.isArray(nextBoard.auditLog) ? nextBoard.auditLog : []\n    nextBoard.handoffNotes = String(nextBoard.handoffNotes || '')\n    nextStore[storedId] = nextBoard\n  })\n  repaired.boardStore = nextStore\n  repaired.dayTemplates = Array.isArray(repaired.dayTemplates) ? repaired.dayTemplates : []\n  repaired.globalDayTemplates = Array.isArray(repaired.globalDayTemplates) ? repaired.globalDayTemplates : []\n  repaired.auditLog = Array.isArray(repaired.auditLog) ? repaired.auditLog : []\n  repaired.handoffNotes = String(repaired.handoffNotes || '')\n  repaired.scopeWarnings = warnings\n  if (warnings.length) console.warn('[StaffBoard scope validation]', warnings.join('; '))\n  return repaired\n}\n\n`
        next = next.replace(marker, helper + 'function normalizeState(saved) {\n  saved = repairShiftScopedState(saved)')
      }

      next = next.replace(
        '  state.boardTitle = saved?.boardTitle || activePreset.title\n  state.boardShift = saved?.boardShift || activePreset.shift',
        '  state.boardTitle = activePreset.title\n  state.boardShift = activePreset.shift'
      )

      next = next.replace(
        '  state.commentsBoard = { ...defaultState.commentsBoard, ...(saved?.commentsBoard || {}) }',
        "  state.commentsBoard = { ...defaultState.commentsBoard, ...(saved?.commentsBoard || {}) }\n  state.dayTemplates = Array.isArray(saved?.dayTemplates) ? saved.dayTemplates : []\n  state.globalDayTemplates = Array.isArray(saved?.globalDayTemplates) ? saved.globalDayTemplates : []\n  state.auditLog = Array.isArray(saved?.auditLog) ? saved.auditLog : []\n  state.handoffNotes = String(saved?.handoffNotes || '')\n  state.scopeWarnings = Array.isArray(saved?.scopeWarnings) ? saved.scopeWarnings : []"
      )

      next = next.replace(
        "        commentsBoard: stored.commentsBoard || defaultState.commentsBoard,",
        "        commentsBoard: stored.commentsBoard || defaultState.commentsBoard,\n        dayTemplates: Array.isArray(stored.dayTemplates) ? stored.dayTemplates : [],\n        auditLog: Array.isArray(stored.auditLog) ? stored.auditLog : [],\n        handoffNotes: String(stored.handoffNotes || ''),"
      )

      next = next.replace(
        '      return syncCurrentBoardStore(applyWeekHistory(withBoards))',
        '      return syncCurrentBoardStore(applyWeekHistory(repairShiftScopedState(withBoards)))'
      )

      return next === code ? null : { code: next, map: null }
    },
  }
}
