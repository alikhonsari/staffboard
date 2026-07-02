import * as XLSX from 'xlsx'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const SHIFT_HOURS = 8
const RACK_WEIGHT = 6.4

function number(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}
function round(value, digits = 2) {
  const p = 10 ** digits
  return Math.round(number(value) * p) / p
}
function safeSheetName(name) {
  return String(name || 'Sheet').replace(/[\\/?*:[\]]/g, ' ').slice(0, 31)
}
function prettyHeader(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}
function writeWorkbook(wb, filename) {
  XLSX.writeFile(wb, filename, { bookType: 'xlsx', cellStyles: true })
}
function appendRowsSheet(wb, name, rows) {
  const safeRows = rows.length ? rows : [{ note: 'No data' }]
  const keys = Object.keys(safeRows[0])
  const ws = XLSX.utils.json_to_sheet(safeRows, { header: keys })
  XLSX.utils.sheet_add_aoa(ws, [keys.map(prettyHeader)], { origin: 'A1' })
  ws['!cols'] = keys.map((key) => ({ wch: Math.min(Math.max(prettyHeader(key).length + 8, 14), 44) }))
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName(name))
}
function appendAoaSheet(wb, name, aoa) {
  const ws = XLSX.utils.aoa_to_sheet(aoa.length ? aoa : [['No data']])
  const colCount = Math.max(1, ...aoa.map((r) => r.length))
  ws['!cols'] = Array.from({ length: colCount }, (_, c) => ({ wch: Math.min(Math.max(...aoa.map((r) => String(r[c] ?? '').length), 12) + 2, 46) }))
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName(name))
}
function isNightShift(label) {
  return String(label || '').toLowerCase().includes('night')
}
function dayDate(weekStartDate, day) {
  const d = new Date(`${weekStartDate}T00:00:00`)
  d.setDate(d.getDate() + Math.max(0, WEEKDAYS.indexOf(day)))
  return d
}
function timeLabel(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function shiftInfo(day, weekStartDate, boardShift) {
  const now = new Date()
  const start = dayDate(weekStartDate, day)
  const end = dayDate(weekStartDate, day)
  const breakStart = dayDate(weekStartDate, day)
  if (isNightShift(boardShift)) {
    start.setHours(17, 0, 0, 0)
    end.setDate(end.getDate() + 1)
    end.setHours(1, 30, 0, 0)
    breakStart.setHours(21, 0, 0, 0)
  } else {
    start.setHours(8, 0, 0, 0)
    end.setHours(16, 30, 0, 0)
    breakStart.setHours(12, 0, 0, 0)
  }
  const breakEnd = new Date(breakStart)
  breakEnd.setMinutes(breakEnd.getMinutes() + 30)
  let worked = 0
  let remaining = 0
  if (now <= start) remaining = SHIFT_HOURS
  else if (now >= end) worked = SHIFT_HOURS
  else {
    const minutesSinceStart = (now - start) / 60000
    const minutesToEnd = (end - now) / 60000
    let unpaidBreakElapsed = 0
    if (now >= breakEnd) unpaidBreakElapsed = 30
    else if (now > breakStart) unpaidBreakElapsed = (now - breakStart) / 60000
    let unpaidBreakRemaining = 0
    if (now < breakStart) unpaidBreakRemaining = 30
    else if (now < breakEnd) unpaidBreakRemaining = (breakEnd - now) / 60000
    worked = Math.max(0, (minutesSinceStart - unpaidBreakElapsed) / 60)
    remaining = Math.max(0, (minutesToEnd - unpaidBreakRemaining) / 60)
  }
  return { startLabel: timeLabel(start), endLabel: timeLabel(end), nowLabel: timeLabel(now), hoursWorked: round(Math.min(SHIFT_HOURS, Math.max(0, worked))), remainingHours: round(Math.min(SHIFT_HOURS, Math.max(0, remaining))), shiftHours: SHIFT_HOURS }
}
function skills(profile = {}) {
  return [profile.trainedTdr ? 'TDR' : '', profile.trainedForklift ? 'Forklift' : '', profile.trainedCenterRider ? 'Center Rider' : '', profile.trainedClampTruck ? 'Clamp Truck' : '', profile.isTrainer ? 'Trainer' : '', profile.isSafetyMember ? 'Safety' : '', profile.isLineLead ? 'Line Lead' : ''].filter(Boolean).join(', ')
}
function statusCounts(dayData, builderPool = []) {
  const out = { assigned: 0, active: 0, present: 0, training: 0, indirect: 0, pto: 0, loa: 0, vto: 0, absent: 0, unassigned: 0, lineLeads: 0 }
  builderPool.forEach((builder) => {
    const a = dayData.assignments?.[builder.id]
    if (!a) return
    out.assigned += 1
    const status = a.status || 'Present'
    const key = status.toLowerCase()
    if (key === 'present') out.present += 1
    else if (key === 'training') out.training += 1
    else if (key === 'indirect') out.indirect += 1
    else if (key === 'pto') out.pto += 1
    else if (key === 'loa') out.loa += 1
    else if (key === 'vto') out.vto += 1
    else if (key === 'absent') out.absent += 1
    if (builder.isLineLead) out.lineLeads += 1
    if (['Present', 'Training', 'Indirect'].includes(status) && !builder.isLineLead) {
      out.active += 1
      if ((a.area || 'Unassigned') === 'Unassigned') out.unassigned += 1
    }
  })
  return out
}
function opsMetrics(dayData, rackWeight = RACK_WEIGHT, headcount = 0, shift = { remainingHours: 0 }) {
  const m = dayData.opsMetrics || {}
  const recoveryGoal = number(m.targetRackMediaRecovery)
  const recoveryProcessed = number(m.racksProcessed)
  const prepGoal = number(m.targetRackPrep)
  const racksPrepped = number(m.racksPrepped)
  const recoveredInPrep = number(m.recoveredRackPrep)
  const prepOutput = racksPrepped + recoveredInPrep
  const mediaGoal = number(m.totalMediaCount)
  const mediaProcessed = number(m.mediaProcessed)
  const totalWorkload = ((recoveryGoal + prepGoal) * rackWeight) + mediaGoal
  const completedWorkload = ((recoveryProcessed + prepOutput) * rackWeight) + mediaProcessed
  const remainingWork = Math.max(0, totalWorkload - completedWorkload)
  const targetTPH = headcount > 0 ? totalWorkload / (headcount * SHIFT_HOURS) : 0
  const requiredTPH = headcount > 0 && shift.remainingHours > 0 ? remainingWork / (headcount * shift.remainingHours) : 0
  const simpleWorkOutput = recoveryProcessed + racksPrepped + mediaProcessed
  return { recoveryGoal, recoveryProcessed, prepGoal, racksPrepped, recoveredInPrep, prepOutput, mediaGoal, mediaProcessed, totalWorkload, completedWorkload, remainingWork, targetTPH, requiredTPH, simpleWorkOutput }
}
function parseRackList(text, day, listType) {
  return String(text || '')
    .split(/\r?\n|,|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/)
      return { day, list_type: listType, rack_id: parts[0] || '', material_type: parts.slice(1).join(' ') || 'Unspecified', raw_entry: line }
    })
}
function rackRowsForDay(dayData, day) {
  return [
    ...parseRackList(dayData.rackLists?.processed, day, 'Processed / Recovery'),
    ...parseRackList(dayData.rackLists?.prepped, day, 'Prepped / Rack Prep'),
  ]
}
function staffRows(dayData, builders) {
  return builders.filter((builder) => dayData.assignments?.[builder.id]).map((builder) => {
    const a = dayData.assignments[builder.id]
    return { builder: builder.name, badge_type: builder.badgeType || 'day', skills_roles: skills(builder), status: a.status || 'Present', area: a.area || 'Unassigned', sub_area: a.subArea || '', role: a.role || '', clock_in_time: a.clockInTime || '', leave_time: a.leaveTime || '', comment: a.comment || '', notes: a.builderNotes || '', updated_at: a.updatedAt || '' }
  }).sort((a, b) => String(a.area).localeCompare(String(b.area)) || String(a.status).localeCompare(String(b.status)) || String(a.builder).localeCompare(String(b.builder)))
}
function areaSummaryRows(areaCounts = []) {
  return areaCounts.map((a) => ({ area: a.name, count: a.count, capacity: a.capacity || '', note: a.note || '' }))
}
function weeklyHoursRows({ weekDays, getDayData, builderPool, computeHoursForAssignment, weekStartDate }) {
  const detailed = []
  const totals = new Map()
  builderPool.forEach((builder) => {
    weekDays.forEach((day) => {
      const a = getDayData(day).assignments?.[builder.id]
      if (!a) return
      const areas = computeHoursForAssignment(a, day, weekStartDate)
      Object.entries(areas).forEach(([area, hours]) => {
        const h = round(hours)
        detailed.push({ builder: builder.name, day, area, hours: h })
        const key = `${builder.id}||${area}`
        const prev = totals.get(key) || { builder: builder.name, badge_type: builder.badgeType || 'day', skills_roles: skills(builder), area, total_week_hours: 0 }
        prev.total_week_hours += h
        totals.set(key, prev)
      })
    })
  })
  return { detailed, totals: Array.from(totals.values()).map((r) => ({ ...r, total_week_hours: round(r.total_week_hours) })).sort((a, b) => a.builder.localeCompare(b.builder) || a.area.localeCompare(b.area)) }
}

export function exportEndOfShiftExcel({ state, dayState, metrics, counts, areaCounts, totalHeadCount, shiftHours, rackWeight, getAssignment, activeBuilders, selectedDay }) {
  const wb = XLSX.utils.book_new()
  const shift = shiftInfo(selectedDay, state.weekStartDate, state.boardShift)
  const calc = { ...opsMetrics(dayState, rackWeight, totalHeadCount, shift), ...metrics }
  const staff = activeBuilders.map((b) => {
    const a = getAssignment(b.id)
    const profile = state.builderPool.find((p) => p.id === b.id) || {}
    return { builder: b.name, badge_type: profile.badgeType || 'day', skills_roles: skills(profile), status: a.status || 'Present', area: a.area || 'Unassigned', sub_area: a.subArea || '', role: a.role || '', clock_in_time: a.clockInTime || '', leave_time: a.leaveTime || '', comment: a.comment || '', builder_notes: a.builderNotes || '', updated_at: a.updatedAt || '' }
  })
  appendRowsSheet(wb, 'Daily Executive', [
    { metric: 'Board', value: state.boardTitle }, { metric: 'Week Start', value: state.weekStartDate }, { metric: 'Day', value: selectedDay }, { metric: 'Shift', value: state.boardShift }, { metric: 'Shift Start', value: shift.startLabel }, { metric: 'Shift End', value: shift.endLabel }, { metric: 'Total HC', value: totalHeadCount }, { metric: 'Present', value: counts.present }, { metric: 'Staffed', value: counts.staffed }, { metric: 'Line Leads', value: counts.lineLeads || 0 }, { metric: 'Total Goal Work', value: round(calc.totalWorkload ?? calc.weightedTarget) }, { metric: 'Completed Work', value: round(calc.completedWorkload ?? calc.weightedCompleted) }, { metric: 'Required TPH', value: round(calc.requiredTPH) },
  ])
  appendRowsSheet(wb, 'People Detail', staff)
  appendRowsSheet(wb, 'Area Summary', areaSummaryRows(areaCounts))
  appendRowsSheet(wb, 'Rack IDs Materials', rackRowsForDay(dayState, selectedDay))
  appendRowsSheet(wb, 'Movement History', (dayState.movementLog || []).map((m) => ({ timestamp: m.timestamp, builder: m.builder, from_area: m.fromArea, to_area: m.toArea, from_status: m.fromStatus, to_status: m.toStatus, notes: m.notes })))
  appendRowsSheet(wb, 'Attendance History', (dayState.attendanceLog || []).map((a) => ({ timestamp: a.timestamp, clock_time: a.clock_time, builder: a.builder, event: a.event, note: a.note })))
  writeWorkbook(wb, `end-of-shift-${state.weekStartDate}-${selectedDay}.xlsx`)
}

export function exportWeeklyExcel({ state, weekDays, getDayData, builderPool, computeHoursForAssignment, areaDefs }) {
  const wb = XLSX.utils.book_new()
  const dailySummary = weekDays.map((day) => {
    const dayData = getDayData(day)
    const hc = statusCounts(dayData, builderPool)
    const shift = shiftInfo(day, state.weekStartDate, state.boardShift)
    const ops = opsMetrics(dayData, RACK_WEIGHT, hc.active, shift)
    return { day, shift_start: shift.startLabel, shift_end: shift.endLabel, hours_worked: shift.hoursWorked, hours_remaining: shift.remainingHours, active_hc: hc.active, assigned: hc.assigned, present: hc.present, training: hc.training, indirect: hc.indirect, pto: hc.pto, loa: hc.loa, vto: hc.vto, absent: hc.absent, unassigned: hc.unassigned, line_leads: hc.lineLeads, total_goal_work: round(ops.totalWorkload), completed_work: round(ops.completedWorkload), remaining_work: round(ops.remainingWork), required_live_tph: round(ops.requiredTPH), recovery_done: ops.recoveryProcessed, prep_done: ops.racksPrepped, media_done: ops.mediaProcessed, work_output: ops.simpleWorkOutput, updated_at: dayData.updatedAt || '' }
  })
  appendRowsSheet(wb, 'Weekly Executive', dailySummary)
  weekDays.forEach((day) => {
    const dayData = getDayData(day)
    appendRowsSheet(wb, `${day} Staff`, staffRows(dayData, builderPool))
    appendRowsSheet(wb, `${day} Racks`, rackRowsForDay(dayData, day))
  })
  const matrixRows = builderPool.map((builder) => {
    const row = { builder: builder.name, badge_type: builder.badgeType || 'day', skills_roles: skills(builder) }
    weekDays.forEach((day) => {
      const a = getDayData(day).assignments?.[builder.id]
      row[`${day}_status`] = a?.status || ''
      row[`${day}_area`] = a?.area || ''
      row[`${day}_role`] = a?.role || ''
    })
    return row
  })
  appendRowsSheet(wb, 'Weekly Staff Matrix', matrixRows)
  const weeklyHours = weeklyHoursRows({ weekDays, getDayData, builderPool, computeHoursForAssignment, weekStartDate: state.weekStartDate })
  appendRowsSheet(wb, 'Builder Hours by Area', weeklyHours.totals)
  appendRowsSheet(wb, 'Builder Hours Detail', weeklyHours.detailed)
  const allRacks = weekDays.flatMap((day) => rackRowsForDay(getDayData(day), day))
  appendRowsSheet(wb, 'Weekly Rack IDs Materials', allRacks)
  const areaSummary = []
  weekDays.forEach((day) => {
    const dayData = getDayData(day)
    areaDefs.forEach((area) => {
      const count = builderPool.filter((b) => {
        const a = dayData.assignments[b.id]
        if (!a) return false
        return (a.area || 'Unassigned') === area.name && ['Present', 'Training', 'Indirect'].includes(a.status || 'Present') && !b.isLineLead
      }).length
      areaSummary.push({ day, area: area.name, count, capacity: area.capacity || '', note: area.note || '' })
    })
  })
  appendRowsSheet(wb, 'Area Counts by Day', areaSummary)
  writeWorkbook(wb, `weekly-staffing-board-${state.weekStartDate}.xlsx`)
}
