export function weekIsolationPlugin() {
  return {
    name: 'staffboard-week-isolation',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null

      let next = code

      if (!next.includes('function repairWeek28Leak(saved)')) {
        const helper = `function repairWeek28Leak(saved) {
  if (!saved || saved.week28LeakRepairV2) return saved

  const repaired = clone(saved)
  const weekKey = '2026-07-06'
  const blankWeek = () => blankWeekData()

  repaired.weeklyBoards = {
    ...(repaired.weeklyBoards || {}),
    [weekKey]: blankWeek(),
  }

  if (toMonday(repaired.weekStartDate || defaultState.weekStartDate) === weekKey) {
    repaired.weeklyData = blankWeek()
  }

  if (repaired.weeklyHistory && typeof repaired.weeklyHistory === 'object') {
    const history = { ...repaired.weeklyHistory }
    delete history[weekKey]
    repaired.weeklyHistory = history
  }

  if (repaired.lockedWeeks && typeof repaired.lockedWeeks === 'object') {
    const locked = { ...repaired.lockedWeeks }
    delete locked[weekKey]
    repaired.lockedWeeks = locked
  }

  const nextBoardStore = {}
  Object.entries(repaired.boardStore || {}).forEach(([boardId, board]) => {
    const nextBoard = { ...(board || {}) }
    nextBoard.weeklyBoards = {
      ...(nextBoard.weeklyBoards || {}),
      [weekKey]: blankWeek(),
    }

    if (nextBoard.weekStartDate && toMonday(nextBoard.weekStartDate) === weekKey) {
      nextBoard.weeklyData = blankWeek()
    }

    if (nextBoard.weeklyHistory && typeof nextBoard.weeklyHistory === 'object') {
      const history = { ...nextBoard.weeklyHistory }
      delete history[weekKey]
      nextBoard.weeklyHistory = history
    }

    if (nextBoard.lockedWeeks && typeof nextBoard.lockedWeeks === 'object') {
      const locked = { ...nextBoard.lockedWeeks }
      delete locked[weekKey]
      nextBoard.lockedWeeks = locked
    }

    nextBoardStore[boardId] = nextBoard
  })
  repaired.boardStore = nextBoardStore
  repaired.week28LeakRepairV2 = true
  return repaired
}

`
        next = next.replace('function normalizeState(saved) {', helper + 'function normalizeState(saved) {\n  saved = repairWeek28Leak(saved)')
      }

      const oldNormalize = `  state.weeklyData = normalizeWeekData(saved?.weeklyData || {})

  const rawBoards = saved?.weeklyBoards && typeof saved.weeklyBoards === 'object'
    ? saved.weeklyBoards
    : { [state.weekStartDate]: saved?.weeklyData || {} }

  const normalizedBoards = {}
  Object.entries(rawBoards).forEach(([k, v]) => {
    normalizedBoards[typeof toMonday === 'function' ? toMonday(k) : k] = normalizeWeekData(v || {})
  })
  normalizedBoards[state.weekStartDate] = normalizeWeekData(saved?.weeklyData || normalizedBoards[state.weekStartDate] || {})
  state.weeklyBoards = normalizedBoards`

      const newNormalize = `  const rawBoards = saved?.weeklyBoards && typeof saved.weeklyBoards === 'object'
    ? saved.weeklyBoards
    : {}

  const normalizedBoards = {}
  Object.entries(rawBoards).forEach(([k, v]) => {
    normalizedBoards[typeof toMonday === 'function' ? toMonday(k) : k] = normalizeWeekData(v || {})
  })

  const activeWeekKey = state.weekStartDate
  if (!Object.prototype.hasOwnProperty.call(normalizedBoards, activeWeekKey)) {
    normalizedBoards[activeWeekKey] = normalizeWeekData(saved?.weeklyData || {})
  }

  const leakSourceKey = '2026-06-29'
  const leakedFutureKeys = ['2026-07-06', '2026-07-13']
  const sourceWeekJson = normalizedBoards[leakSourceKey] ? JSON.stringify(normalizedBoards[leakSourceKey]) : ''
  leakedFutureKeys.forEach((weekKey) => {
    if (sourceWeekJson && normalizedBoards[weekKey] && JSON.stringify(normalizedBoards[weekKey]) === sourceWeekJson) {
      normalizedBoards[weekKey] = normalizeWeekData({})
    }
  })

  state.weeklyBoards = normalizedBoards
  state.weeklyData = clone(normalizedBoards[activeWeekKey] || normalizeWeekData({}))`

      next = next.replace(oldNormalize, newNormalize)

      const oldSwitchReturn = `      return {
        ...snapPrev,
        weeklyBoards: allBoards,
        weekStartDate: mondayTarget,
        weeklyData: targetWeekData,
        selectedDay: 'Monday',
        updatedAt: nowString(),
      }`

      const newSwitchReturn = `      const nextBoards = {
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

      next = next.replace(oldSwitchReturn, newSwitchReturn)

      return next === code ? null : { code: next, map: null }
    },
  }
}
