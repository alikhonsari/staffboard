export function weekIsolationPlugin() {
  return {
    name: 'staffboard-week-isolation',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null

      let next = code

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
