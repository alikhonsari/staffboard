export function weekMetadataScopePlugin() {
  return {
    name: 'staffboard-week-metadata-scope',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      next = next.replace(
        "const BOARD_SCOPED_KEYS = ['boardTitle', 'boardShift', 'selectedDay', 'areaDefs', 'weeklyData', 'weeklyBoards', 'weeklyHistory', 'lockedWeeks', 'commentsBoard', 'dayTemplates', 'auditLog', 'handoffNotes']",
        "const BOARD_SCOPED_KEYS = ['boardTitle', 'boardShift', 'selectedDay', 'areaDefs', 'weeklyData', 'weeklyBoards', 'weeklyHistory', 'lockedWeeks', 'commentsBoard', 'commentsBoards', 'dayTemplates', 'auditLog', 'handoffNotes', 'handoffNotesByWeek']"
      )

      next = next.replace(
        "  handoffNotes: '',\n  commentsBoard: {",
        "  handoffNotes: '',\n  handoffNotesByWeek: {},\n  commentsBoards: {},\n  commentsBoard: {"
      )

      next = next.replace(
        "  state.commentsBoard = { ...defaultState.commentsBoard, ...(saved?.commentsBoard || {}) }\n  state.dayTemplates = Array.isArray(saved?.dayTemplates) ? saved.dayTemplates : []\n  state.globalDayTemplates = Array.isArray(saved?.globalDayTemplates) ? saved.globalDayTemplates : []\n  state.auditLog = Array.isArray(saved?.auditLog) ? saved.auditLog : []\n  state.handoffNotes = String(saved?.handoffNotes || '')",
        "  state.commentsBoards = saved?.commentsBoards && typeof saved.commentsBoards === 'object' ? saved.commentsBoards : {}\n  if (!state.commentsBoards[state.weekStartDate] && saved?.commentsBoard) state.commentsBoards[state.weekStartDate] = saved.commentsBoard\n  state.commentsBoard = { ...defaultState.commentsBoard, ...(state.commentsBoards[state.weekStartDate] || {}) }\n  state.dayTemplates = Array.isArray(saved?.dayTemplates) ? saved.dayTemplates : []\n  state.globalDayTemplates = Array.isArray(saved?.globalDayTemplates) ? saved.globalDayTemplates : []\n  state.auditLog = Array.isArray(saved?.auditLog) ? saved.auditLog : []\n  state.handoffNotesByWeek = saved?.handoffNotesByWeek && typeof saved.handoffNotesByWeek === 'object' ? saved.handoffNotesByWeek : {}\n  if (!Object.prototype.hasOwnProperty.call(state.handoffNotesByWeek, state.weekStartDate) && saved?.handoffNotes) state.handoffNotesByWeek[state.weekStartDate] = saved.handoffNotes\n  state.handoffNotes = String(state.handoffNotesByWeek[state.weekStartDate] || '')"
      )

      const oldSwitch = `      const nextBoards = {
        ...allBoards,
        [mondayTarget]: targetWeekData,
      }
      return syncCurrentBoardStore({
        ...snapPrev,
        weeklyBoards: nextBoards,
        weekStartDate: mondayTarget,
        weeklyData: targetWeekData,
        selectedDay: 'Monday',
        updatedAt: nowString(),
      })`
      const newSwitch = `      const nextBoards = {
        ...allBoards,
        [mondayTarget]: targetWeekData,
      }
      const commentsBoards = { ...(snapPrev.commentsBoards || {}), [currentWeekKey]: snapPrev.commentsBoard || defaultState.commentsBoard }
      const handoffNotesByWeek = { ...(snapPrev.handoffNotesByWeek || {}), [currentWeekKey]: String(snapPrev.handoffNotes || '') }
      return syncCurrentBoardStore({
        ...snapPrev,
        weeklyBoards: nextBoards,
        commentsBoards,
        handoffNotesByWeek,
        weekStartDate: mondayTarget,
        weeklyData: targetWeekData,
        commentsBoard: { ...defaultState.commentsBoard, ...(commentsBoards[mondayTarget] || {}) },
        handoffNotes: String(handoffNotesByWeek[mondayTarget] || ''),
        selectedDay: 'Monday',
        updatedAt: nowString(),
      })`
      next = next.replace(oldSwitch, newSwitch)

      next = next.replace(
        '      return syncCurrentBoardStore(applyWeekHistory(repairShiftScopedState(withBoards)))',
        "      const withWeekMetadata = { ...withBoards, commentsBoards: { ...(withBoards.commentsBoards || {}), [currentWeekKey]: withBoards.commentsBoard || defaultState.commentsBoard }, handoffNotesByWeek: { ...(withBoards.handoffNotesByWeek || {}), [currentWeekKey]: String(withBoards.handoffNotes || '') } }\n      return syncCurrentBoardStore(applyWeekHistory(repairShiftScopedState(withWeekMetadata)))"
      )

      next = next.replace(
        "        commentsBoard: stored.commentsBoard || defaultState.commentsBoard,\n        dayTemplates: Array.isArray(stored.dayTemplates) ? stored.dayTemplates : [],\n        auditLog: Array.isArray(stored.auditLog) ? stored.auditLog : [],\n        handoffNotes: String(stored.handoffNotes || ''),",
        "        commentsBoard: stored.commentsBoard || defaultState.commentsBoard,\n        commentsBoards: stored.commentsBoards && typeof stored.commentsBoards === 'object' ? stored.commentsBoards : {},\n        dayTemplates: Array.isArray(stored.dayTemplates) ? stored.dayTemplates : [],\n        auditLog: Array.isArray(stored.auditLog) ? stored.auditLog : [],\n        handoffNotes: String(stored.handoffNotes || ''),\n        handoffNotesByWeek: stored.handoffNotesByWeek && typeof stored.handoffNotesByWeek === 'object' ? stored.handoffNotesByWeek : {},"
      )

      return next === code ? null : { code: next, map: null }
    },
  }
}
