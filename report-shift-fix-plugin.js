export function reportShiftFixPlugin() {
  return {
    name: 'staffboard-report-shift-fix',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code
      const activeShift = "BOARD_PRESETS[state.currentBoardId]?.shift || state.boardShift || 'Day Shift'"

      next = next.replace(
        "  const reportShiftWindow = isNightShiftLabel(state.boardShift) ? '5:00 PM - 1:30 AM' : '8:00 AM - 4:30 PM'",
        `  const reportShiftName = ${activeShift}\n  const reportShiftWindow = isNightShiftLabel(reportShiftName) ? '5:00 PM - 1:30 AM' : '8:00 AM - 4:30 PM'`
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

      next = next.replaceAll(
        'shiftStartForDay(state.selectedDay, state.weekStartDate, state.boardShift)',
        `shiftStartForDay(state.selectedDay, state.weekStartDate, ${activeShift})`
      )
      next = next.replaceAll(
        'shiftEndForDay(state.selectedDay, state.weekStartDate, state.boardShift)',
        `shiftEndForDay(state.selectedDay, state.weekStartDate, ${activeShift})`
      )
      next = next.replaceAll(
        'isNightShiftLabel(state.boardShift)',
        `isNightShiftLabel(${activeShift})`
      )
      next = next.replaceAll(
        'computeHoursForAssignment(assignment, day, state.weekStartDate, state.boardShift)',
        `computeHoursForAssignment(assignment, day, state.weekStartDate, ${activeShift})`
      )
      next = next.replace(
        '[state.selectedDay, state.weekStartDate, state.boardShift, tick]',
        '[state.selectedDay, state.weekStartDate, state.currentBoardId, state.boardShift, tick]'
      )

      return next === code ? null : { code: next, map: null }
    },
  }
}
