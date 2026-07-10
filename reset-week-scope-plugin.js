export function resetWeekScopePlugin() {
  return {
    name: 'staffboard-reset-week-scope',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      const oldBlock = `  const resetWeek = () => {
    if (!confirm('Reset the full weekly staffing board?')) return
    const cleaned = {
      ...defaultState,
      builderPool: state.builderPool,
      storageConfig: state.storageConfig,
      darkMode: state.darkMode,
    }
    setState(cleaned)
    setSelectedBuilderId('')
  }`
      const newBlock = `  const resetWeek = () => {
    const weekKey = toMonday(state.weekStartDate)
    const scopeLabel = (BOARD_PRESETS[state.currentBoardId]?.label || state.boardShift) + ' · Week ' + String(weekInfo.week).padStart(2, '0')
    if (!confirm('Reset only ' + scopeLabel + '? Other boards, shifts, and weeks will remain unchanged.')) return
    saveState((prev) => {
      const blank = blankWeekData()
      const history = { ...(prev.weeklyHistory || {}) }
      const locked = { ...(prev.lockedWeeks || {}) }
      delete history[weekKey]
      delete locked[weekKey]
      return appendAudit({
        ...prev,
        weeklyData: blank,
        weeklyBoards: { ...(prev.weeklyBoards || {}), [weekKey]: blank },
        weeklyHistory: history,
        lockedWeeks: locked,
        selectedDay: 'Monday',
      }, { action: 'Reset Scoped Week', oldValue: scopeLabel, newValue: 'Blank active week only' })
    })
    setSelectedBuilderId('')
  }`
      const next = code.replace(oldBlock, newBlock)
      return next === code ? null : { code: next, map: null }
    },
  }
}
