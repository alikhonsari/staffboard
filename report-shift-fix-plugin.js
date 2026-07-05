export function reportShiftFixPlugin() {
  return {
    name: 'staffboard-report-shift-fix',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code
      next = next.replace(
        "  const reportShiftWindow = isNightShiftLabel(state.boardShift) ? '5:00 PM - 1:30 AM' : '8:00 AM - 4:30 PM'",
        "  const reportShiftName = BOARD_PRESETS[state.currentBoardId]?.shift || state.boardShift || 'Day Shift'\n  const reportShiftWindow = isNightShiftLabel(reportShiftName) ? '5:00 PM - 1:30 AM' : '8:00 AM - 4:30 PM'"
      )
      next = next.replaceAll('{state.boardShift} · {reportShiftWindow}', '{reportShiftName} · {reportShiftWindow}')
      next = next.replaceAll('<strong>{state.boardShift}</strong>', '<strong>{reportShiftName}</strong>')
      next = next.replace(
        '              state,\n              dayState,',
        '              state: { ...state, boardShift: reportShiftName },\n              dayState,'
      )
      next = next.replace(
        '              state,\n              weekDays: WEEKDAYS,',
        '              state: { ...state, boardShift: reportShiftName },\n              weekDays: WEEKDAYS,'
      )
      return next === code ? null : { code: next, map: null }
    },
  }
}
