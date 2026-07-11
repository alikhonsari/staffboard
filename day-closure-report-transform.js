const helpers = `

const reportingOperationId = (boardId) => String(boardId || 'speed_day').replace(/_(day|night)$/i, '')
function reportingClosureForState(state, day) {
  const record = state?.dayClosures?.[reportingOperationId(state?.currentBoardId)]?.[state?.weekStartDate]?.[day]
  if (!record) return null
  if (record.entireDay?.closed) return { ...record.entireDay, scope: 'Entire Day' }
  const night = /_night$/i.test(String(state?.currentBoardId || ''))
  const closure = night ? record.nightShift : record.dayShift
  return closure?.closed ? { ...closure, scope: night ? 'Night Shift' : 'Day Shift' } : null
}
const reportingClosureReason = (closure) => closure?.reason === 'Other' ? (closure.customReason || 'Other') : (closure?.reason || 'Closed')
const reportingClosureMeta = (closure) => !closure ? [] : [
  ['Operational Status', 'Excluded — Site Closed'], ['Closure Reason', reportingClosureReason(closure)],
  ['Closure Scope', closure.scope || ''], ['Closure Note', closure.note || ''],
  ['Closed By', closure.closedBy || ''], ['Applied', closure.closedAt ? new Date(closure.closedAt).toLocaleString() : ''],
]
`

export function injectReporting(code) {
  let next = code
  if (!next.includes('function reportingClosureForState')) next = next.replace('const RACK_WEIGHT = 6.4', 'const RACK_WEIGHT = 6.4' + helpers)
  next = next.replace(
    "  const reportAdmin = adminName || state.adminName || state.boardLead || 'Not set'\n  const calc = { ...opsMetrics(dayState, rackWeight, totalHeadCount, shift), ...metrics }",
    "  const reportAdmin = adminName || state.adminName || state.boardLead || 'Not set'\n  const closure = reportingClosureForState(state, selectedDay)\n  const calc = closure ? { ...opsMetrics(dayState, rackWeight, totalHeadCount, shift), ...metrics, targetTPH: 0, requiredTPH: 0, remainingWork: 0 } : { ...opsMetrics(dayState, rackWeight, totalHeadCount, shift), ...metrics }",
  )
  next = next.replace("  const meta = [\n    ['Board', state.boardTitle], ['Logged-in Admin', reportAdmin],", "  const meta = [\n    ['Board', state.boardTitle], ['Logged-in Admin', reportAdmin],\n    ...reportingClosureMeta(closure),")
  next = next.replace(
    "  appendDataSheet(wb, 'Attendance History', (dayState.attendanceLog || []).map((a) => ({ timestamp: a.timestamp, clock_time: a.clock_time, builder: a.builder, event: a.event, note: a.note })), { title: `${selectedDay} Attendance History`, meta, accent: COLORS.red })",
    "  appendDataSheet(wb, 'Attendance History', (dayState.attendanceLog || []).map((a) => ({ timestamp: a.timestamp, clock_time: a.clock_time, builder: a.builder, event: a.event, note: a.note })), { title: `${selectedDay} Attendance History`, meta, accent: COLORS.red })\n  if (closure) appendDataSheet(wb, 'Closure Status', [{ status: 'Excluded — Site Closed', reason: reportingClosureReason(closure), scope: closure.scope, note: closure.note || '', closed_by: closure.closedBy || '', applied_at: closure.closedAt || '', canceled_scheduled_transitions: closure.canceledTransitionCount || 0 }], { title: `${selectedDay} Closure Status`, subtitle: 'Historical staffing and production data is preserved; operational calculations are excluded.', meta, accent: COLORS.red })",
  )

  next = next.replace("  const dailySummary = weekDays.map((day) => {\n    const dayData = getDayData(day)", "  const dailySummary = weekDays.map((day) => {\n    const dayData = getDayData(day)\n    const closure = reportingClosureForState(state, day)")
  next = next.replace("    return {\n      day,\n      shift_start: shift.startLabel,", "    return {\n      day,\n      excluded: !!closure, closure_status: closure ? 'Excluded — Site Closed' : '',\n      closure_reason: closure ? reportingClosureReason(closure) : '', closure_scope: closure?.scope || '',\n      shift_start: shift.startLabel,")
  next = next.replace('      active_hc: hc.active,', '      active_hc: closure ? 0 : hc.active,')
  next = next.replace(
    "      total_goal_work: round(ops.totalWorkload),\n      completed_work: round(ops.completedWorkload),\n      remaining_work: round(ops.remainingWork),\n      required_tph: round(ops.requiredTPH),",
    "      total_goal_work: closure ? 0 : round(ops.totalWorkload),\n      completed_work: closure ? 0 : round(ops.completedWorkload),\n      remaining_work: closure ? 0 : round(ops.remainingWork),\n      required_tph: closure ? 0 : round(ops.requiredTPH),",
  )
  next = next.replace("  const totals = dailySummary.reduce((acc, row) => {\n    acc.recovery += row.recovery_done", "  const totals = dailySummary.reduce((acc, row) => {\n    if (row.excluded) return acc\n    acc.recovery += row.recovery_done")
  next = next.replace(
    '  const weeklyHours = weeklyHoursRows({ weekDays, getDayData, builderPool, computeHoursForAssignment, weekStartDate: state.weekStartDate })\n  const totalStaffedHours',
    '  const operatingWeekDays = weekDays.filter((day) => !reportingClosureForState(state, day))\n  const weeklyHours = weeklyHoursRows({ weekDays: operatingWeekDays, getDayData, builderPool, computeHoursForAssignment, weekStartDate: state.weekStartDate })\n  const totalStaffedHours',
  )
  next = next.replace('  const allRacks = weekDays.flatMap((day) => rackRowsForDay(getDayData(day), day))', '  const allRacks = operatingWeekDays.flatMap((day) => rackRowsForDay(getDayData(day), day))')
  next = next.replace("    ['Generated', new Date().toLocaleString()], ['Roster Size', builderPool.length],", "    ['Generated', new Date().toLocaleString()], ['Roster Size', builderPool.length],\n    ['Closed Days', dailySummary.filter((row) => row.excluded).map((row) => `${row.day}: ${row.closure_reason}`).join(' | ') || 'None'], ['Operating Days', operatingWeekDays.join(', ') || 'None'],")
  next = next.replace(
    '        rows: dailySummary.map((row) => [row.day, `${row.shift_start} - ${row.shift_end}`, row.active_hc, row.present, row.pto, row.recovery_done, row.prep_done, row.media_done]),',
    "        rows: dailySummary.map((row) => [row.day, row.excluded ? `${row.closure_status} — ${row.closure_reason}` : `${row.shift_start} - ${row.shift_end}`, row.active_hc, row.excluded ? 0 : row.present, row.excluded ? 0 : row.pto, row.excluded ? 'Excluded' : row.recovery_done, row.excluded ? 'Excluded' : row.prep_done, row.excluded ? 'Excluded' : row.media_done]),",
  )
  next = next.replace(
    '        rows: dailySummary.map((row) => [row.day, row.total_goal_work, row.completed_work, row.remaining_work, row.required_tph, row.unassigned, row.line_leads, row.updated_at]),',
    "        rows: dailySummary.map((row) => row.excluded ? [row.day, 'Excluded — Site Closed', row.closure_reason, row.closure_scope, '', '', '', row.updated_at] : [row.day, row.total_goal_work, row.completed_work, row.remaining_work, row.required_tph, row.unassigned, row.line_leads, row.updated_at]),",
  )
  next = next.replace(
    "  appendDataSheet(wb, 'Area Counts by Day', areaSummary, { title: 'Area Coverage by Day', subtitle: `${state.boardShift} · ${shiftWindow}`, meta, accent: COLORS.orange })",
    "  appendDataSheet(wb, 'Area Counts by Day', areaSummary.filter((row) => !reportingClosureForState(state, row.day)), { title: 'Area Coverage by Day', subtitle: `${state.boardShift} · ${shiftWindow}`, meta, accent: COLORS.orange })\n  const closureRows = dailySummary.filter((row) => row.excluded).map((row) => ({ day: row.day, status: row.closure_status, reason: row.closure_reason, scope: row.closure_scope }))\n  if (closureRows.length) appendDataSheet(wb, 'Closure Status', closureRows, { title: 'Weekly Closure Status', subtitle: 'Closed days are excluded from weekly operational averages and totals.', meta, accent: COLORS.red })",
  )
  return next
}
