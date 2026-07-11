export function shiftCorePlugin() {
  return {
    name: 'staffboard-shift-core',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null

      let next = code

      next = next.replace(
        "  if (isNightShiftLabel(boardShift)) d.setHours(20, 0, 0, 0)",
        "  if (isNightShiftLabel(boardShift)) d.setHours(17, 0, 0, 0)"
      )

      next = next.replace(
        "    d.setHours(4, SHIFT_END_MINUTE, 0, 0)",
        "    d.setHours(1, 30, 0, 0)"
      )

      const oldHours = `function computeHoursForAssignment(assignment, dayName, weekStartDate) {
  const hist = Array.isArray(assignment.areaHistory) ? assignment.areaHistory : []
  const totals = {}
  hist.forEach((session) => {
    if (!session?.area || session.area === 'Unassigned') return
    const startHours = isoToHours(session.startIso)
    const endHours = session.endIso ? isoToHours(session.endIso) : 16.5
    if (startHours == null || endHours == null) return
    const hours = Math.max(0, endHours - startHours)
    totals[session.area] = (totals[session.area] || 0) + hours
  })
  if (!hist.length) {
    const area = assignment.area || ''
    if (area && area !== 'Unassigned' && staffedStatuses().includes(assignment.status || 'Present')) {
      const startHours = parseTimeToHours(assignment.clockInTime) ?? SHIFT_START_HOUR
      const endHours = parseTimeToHours(assignment.leaveTime) ?? 16.5
      totals[area] = Math.max(0, endHours - startHours)
    }
  }
  return totals
}`

      const newHours = `function computeHoursForAssignment(assignment, dayName, weekStartDate, boardShift = 'Day Shift') {
  const hist = Array.isArray(assignment.areaHistory)
    ? assignment.areaHistory.filter((session) => session?.area && session?.startIso)
    : []
  const totals = {}
  hist.forEach((session) => {
    if (session.area === 'Unassigned') return
    const start = new Date(session.startIso)
    const end = session.endIso ? new Date(session.endIso) : shiftEndForDay(dayName, weekStartDate, boardShift)
    if (Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) return
    const hours = Math.max(0, (end - start) / 3600000)
    totals[session.area] = (totals[session.area] || 0) + hours
  })
  if (!hist.length) {
    const area = assignment.area || assignment.lastAreaBeforeClockOut || ''
    const hasCompletedScheduledShift = !!assignment.effectiveClockOutIso
    if (area && area !== 'Unassigned' && (staffedStatuses().includes(assignment.status || 'Present') || hasCompletedScheduledShift)) {
      const effectiveStart = assignment.effectiveClockInIso || assignment.sessionStartIso
      const effectiveEnd = assignment.effectiveClockOutIso
      const startDate = effectiveStart ? new Date(effectiveStart) : null
      const endDate = effectiveEnd ? new Date(effectiveEnd) : null
      if (startDate && endDate && !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
        totals[area] = Math.max(0, (endDate - startDate) / 3600000)
      } else {
        const night = isNightShiftLabel(boardShift)
        const startHours = parseTimeToHours(assignment.clockInTime) ?? (night ? 17 : SHIFT_START_HOUR)
        let endHours = parseTimeToHours(assignment.leaveTime) ?? (night ? 1.5 : 16.5)
        if (night && endHours <= startHours) endHours += 24
        totals[area] = Math.max(0, endHours - startHours)
      }
    }
  }
  return totals
}`

      next = next.replace(oldHours, newHours)
      next = next.replaceAll(
        'computeHoursForAssignment(assignment, day, state.weekStartDate)',
        'computeHoursForAssignment(assignment, day, state.weekStartDate, state.boardShift)'
      )

      next = next.replace(
        `    if (isNightShiftLabel(state.boardShift)) {
      breakStart.setDate(breakStart.getDate() + 1)
      breakStart.setHours(0, 0, 0, 0)
    } else {
      breakStart.setHours(12, 0, 0, 0)
    }`,
        `    if (isNightShiftLabel(state.boardShift)) {
      breakStart.setHours(21, 0, 0, 0)
    } else {
      breakStart.setHours(12, 0, 0, 0)
    }`
      )

      next = next.replace(
        '              computeHoursForAssignment,\n              areaDefs: AREA_DEFS,',
        '              computeHoursForAssignment: (assignment, day, weekStartDate) => computeHoursForAssignment(assignment, day, weekStartDate, state.boardShift),\n              areaDefs: AREA_DEFS,'
      )

      return next === code ? null : { code: next, map: null }
    },
  }
}
