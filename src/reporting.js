import * as XLSX from 'xlsx'

const DARK = '0F172A'
const BLUE = '2563EB'
const PURPLE = '7C3AED'
const GREEN = '059669'
const ORANGE = 'F59E0B'
const RED = 'DC2626'
const LINE = 'D1D5DB'
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const SHIFT_HOURS = 8
const SHIFT_END_MINUTE = 30

function safeSheetName(name) { return String(name || 'Sheet').replace(/[\\/?*:[\]]/g, ' ').slice(0, 31) }
function prettyHeader(value) { return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()) }
function number(value) { const n = Number(value || 0); return Number.isFinite(n) ? n : 0 }
function round(value, digits = 2) { const p = 10 ** digits; return Math.round(number(value) * p) / p }
function border(color = LINE) { return { top: { style: 'thin', color: { rgb: color } }, bottom: { style: 'thin', color: { rgb: color } }, left: { style: 'thin', color: { rgb: color } }, right: { style: 'thin', color: { rgb: color } } } }
function setCellStyle(ws, ref, style) { if (ws[ref]) ws[ref].s = style }
function autoWidthFromAoa(aoa) {
  const colCount = Math.max(1, ...aoa.map((row) => row.length))
  return Array.from({ length: colCount }, (_, c) => {
    const maxLen = Math.max(10, ...aoa.map((row) => String(row[c] ?? '').length))
    return { wch: Math.min(Math.max(maxLen + 2, 12), c === 0 ? 28 : 42) }
  })
}
function styleReportSheet(ws, options = {}) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1')
  const titleRows = new Set(options.titleRows || [])
  const sectionRows = new Set(options.sectionRows || [])
  const headerRows = new Set(options.headerRows || [])
  const titleColor = options.titleColor || DARK
  const headerColor = options.headerColor || BLUE
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const ref = XLSX.utils.encode_cell({ r, c })
      if (!ws[ref]) continue
      if (titleRows.has(r)) setCellStyle(ws, ref, { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 16 }, fill: { fgColor: { rgb: titleColor } }, alignment: { horizontal: 'left', vertical: 'center' }, border: border(titleColor) })
      else if (sectionRows.has(r)) setCellStyle(ws, ref, { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 }, fill: { fgColor: { rgb: DARK } }, alignment: { horizontal: 'left', vertical: 'center' }, border: border(DARK) })
      else if (headerRows.has(r)) setCellStyle(ws, ref, { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }, fill: { fgColor: { rgb: headerColor } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: border() })
      else setCellStyle(ws, ref, { alignment: { vertical: 'top', wrapText: true }, fill: { fgColor: { rgb: r % 2 === 0 ? 'F8FAFC' : 'FFFFFF' } }, border: border('E5E7EB') })
    }
  }
}
function appendStyledSheet(wb, name, aoa, options = {}) {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = options.cols || autoWidthFromAoa(aoa)
  if (options.merges?.length) ws['!merges'] = options.merges
  if (options.freezeRow) ws['!freeze'] = { xSplit: 0, ySplit: options.freezeRow }
  ws['!rows'] = aoa.map((row, idx) => ({ hpt: (options.titleRows || []).includes(idx) ? 24 : row.some((x) => String(x || '').length > 60) ? 34 : 20 }))
  styleReportSheet(ws, options)
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName(name))
}
function appendJsonSheet(wb, name, rows, headerColor = BLUE) {
  const safeRows = rows.length ? rows : [{ note: '' }]
  const keys = Object.keys(safeRows[0])
  const aoa = [keys.map(prettyHeader), ...safeRows.map((row) => keys.map((key) => row[key] ?? ''))]
  appendStyledSheet(wb, name, aoa, { headerRows: [0], headerColor, freezeRow: 1 })
}
function appendDashboardSheet(wb, name, title, metaRows, kpiCards, tables = [], color = DARK) {
  const aoa = []
  const merges = []
  const titleRows = []
  const sectionRows = []
  const headerRows = []
  const maxCols = 8
  const titleRow = aoa.length
  titleRows.push(titleRow)
  merges.push({ s: { r: titleRow, c: 0 }, e: { r: titleRow, c: maxCols - 1 } })
  aoa.push([title])
  aoa.push([])
  const pad = (row) => [...row, ...Array(Math.max(0, maxCols - row.length)).fill('')]
  const section = (label) => { const r = aoa.length; sectionRows.push(r); merges.push({ s: { r, c: 0 }, e: { r, c: maxCols - 1 } }); aoa.push([label]) }
  section('Report Information')
  for (let i = 0; i < metaRows.length; i += 2) {
    const left = metaRows[i] || ['', '']
    const right = metaRows[i + 1] || ['', '']
    aoa.push(pad([left[0], left[1], '', right[0], right[1]]))
  }
  aoa.push([])
  section('KPI Snapshot')
  headerRows.push(aoa.length)
  aoa.push(pad(['Metric', 'Value', 'Metric', 'Value', 'Metric', 'Value', 'Metric', 'Value']))
  for (let i = 0; i < kpiCards.length; i += 4) {
    const row = []
    for (let j = 0; j < 4; j += 1) { const card = kpiCards[i + j] || { label: '', value: '' }; row.push(card.label || '', card.value ?? '') }
    aoa.push(pad(row))
  }
  tables.forEach((table) => {
    aoa.push([])
    section(table.title)
    headerRows.push(aoa.length)
    aoa.push(pad(table.headers))
    ;(table.rows.length ? table.rows : [Array(table.headers.length).fill('')]).forEach((row) => aoa.push(pad(row)))
  })
  appendStyledSheet(wb, name, aoa, { cols: [{ wch: 22 }, { wch: 18 }, { wch: 4 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 18 }], merges, titleRows, sectionRows, headerRows, titleColor: color, headerColor: BLUE, freezeRow: 3 })
}
function appendSnapshotSheet(wb, sheetName, snap, color) {
  const rows = snap ? (snap.byArea || []).map((r) => ({ snapshot: snap.label, captured_at: snap.capturedAt, area: r.area, count: r.count, present: snap.totals.present, staffed: snap.totals.staffed, unassigned: snap.totals.unassigned })) : []
  appendJsonSheet(wb, sheetName, rows, color)
}
function skills(profile = {}) { return [profile.trainedTdr ? 'TDR' : '', profile.trainedForklift ? 'Forklift' : '', profile.trainedCenterRider ? 'Center Rider' : '', profile.trainedClampTruck ? 'Clamp Truck' : '', profile.isTrainer ? 'Trainer' : '', profile.isSafetyMember ? 'Safety' : '', profile.isLineLead ? 'Line Lead' : ''].filter(Boolean).join(', ') }
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
function opsMetrics(dayData, rackWeight = 6.4, headcount = 0, shift = { remainingHours: 0 }) {
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
function isNightShift(label) { return String(label || '').toLowerCase().includes('night') }
function dayDate(weekStartDate, day) { const d = new Date(`${weekStartDate}T00:00:00`); d.setDate(d.getDate() + Math.max(0, WEEKDAYS.indexOf(day))); return d }
function shiftInfo(day, weekStartDate, boardShift) {
  const now = new Date()
  const start = dayDate(weekStartDate, day)
  const end = dayDate(weekStartDate, day)
  const breakStart = dayDate(weekStartDate, day)
  if (isNightShift(boardShift)) {
    start.setHours(20, 0, 0, 0)
    end.setDate(end.getDate() + 1); end.setHours(4, SHIFT_END_MINUTE, 0, 0)
    breakStart.setDate(breakStart.getDate() + 1); breakStart.setHours(0, 0, 0, 0)
  } else {
    start.setHours(8, 0, 0, 0)
    end.setHours(16, SHIFT_END_MINUTE, 0, 0)
    breakStart.setHours(12, 0, 0, 0)
  }
  const breakEnd = new Date(breakStart); breakEnd.setMinutes(breakEnd.getMinutes() + 30)
  let worked = 0
  let remaining = 0
  if (now <= start) remaining = SHIFT_HOURS
  else if (now >= end) worked = SHIFT_HOURS
  else {
    const minutesSinceStart = (now - start) / 60000
    const minutesToEnd = (end - now) / 60000
    let unpaidBreakElapsed = 0
    if (now >= breakEnd) unpaidBreakElapsed = 30
    else if (now > breakStart && now < breakEnd) unpaidBreakElapsed = (now - breakStart) / 60000
    let unpaidBreakRemaining = 0
    if (now < breakStart) unpaidBreakRemaining = 30
    else if (now >= breakStart && now < breakEnd) unpaidBreakRemaining = (breakEnd - now) / 60000
    worked = Math.max(0, (minutesSinceStart - unpaidBreakElapsed) / 60)
    remaining = Math.max(0, (minutesToEnd - unpaidBreakRemaining) / 60)
  }
  return { startLabel: start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), endLabel: end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), nowLabel: now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), hoursWorked: round(Math.min(SHIFT_HOURS, Math.max(0, worked))), remainingHours: round(Math.min(SHIFT_HOURS, Math.max(0, remaining))), shiftHours: SHIFT_HOURS }
}
function staffRows(dayData, builders) {
  return builders.filter((builder) => dayData.assignments?.[builder.id]).map((builder) => {
    const a = dayData.assignments[builder.id]
    return { builder: builder.name, badge_type: builder.badgeType || 'day', skills_roles: skills(builder), status: a.status || 'Present', area: a.area || 'Unassigned', sub_area: a.subArea || '', role: a.role || '', clock_in_time: a.clockInTime || '', leave_time: a.leaveTime || '', comment: a.comment || '', notes: a.builderNotes || '', updated_at: a.updatedAt || '' }
  }).sort((a, b) => String(a.area).localeCompare(String(b.area)) || String(a.status).localeCompare(String(b.status)) || String(a.builder).localeCompare(String(b.builder)))
}
function tableRowsFromObjects(rows) { if (!rows.length) return { headers: ['Note'], rows: [['No data']] }; const keys = Object.keys(rows[0]); return { headers: keys.map(prettyHeader), rows: rows.map((row) => keys.map((key) => row[key] ?? '')) } }
function areaSummaryRowsFromCounts(areaCounts = []) { return areaCounts.map((a) => [a.name, a.count, a.capacity || '', a.note || '']) }
function writeWorkbook(wb, filename) { XLSX.writeFile(wb, filename, { bookType: 'xlsx', cellStyles: true }) }

export function exportEndOfShiftExcel({ state, dayState, metrics, counts, areaCounts, totalHeadCount, shiftHours, rackWeight, getAssignment, activeBuilders, selectedDay }) {
  const wb = XLSX.utils.book_new()
  const shift = shiftInfo(selectedDay, state.weekStartDate, state.boardShift)
  const calc = { ...opsMetrics(dayState, rackWeight, totalHeadCount, shift), ...metrics }
  calc.totalWorkload = number(calc.totalWorkload ?? calc.weightedTarget)
  calc.completedWorkload = number(calc.completedWorkload ?? calc.weightedCompleted)
  calc.remainingWork = Math.max(0, number(calc.remainingWork))
  const efficiency = calc.totalWorkload > 0 ? round((calc.completedWorkload / calc.totalWorkload) * 100, 1) : 0
  const projectedGap = calc.completedWorkload + (number(calc.requiredTPH) * totalHeadCount * shift.remainingHours) - calc.totalWorkload
  const staff = activeBuilders.map((b) => { const a = getAssignment(b.id); const profile = state.builderPool.find((p) => p.id === b.id) || {}; return { builder: b.name, badge_type: profile.badgeType || 'day', skills_roles: skills(profile), status: a.status || 'Present', area: a.area || 'Unassigned', sub_area: a.subArea || '', role: a.role || '', clock_in_time: a.clockInTime || '', leave_time: a.leaveTime || '', comment: a.comment || '', builder_notes: a.builderNotes || '', updated_at: a.updatedAt || '' } }).sort((a, b) => String(a.area).localeCompare(String(b.area)) || String(a.status).localeCompare(String(b.status)) || String(a.builder).localeCompare(String(b.builder)))

  appendDashboardSheet(wb, 'Daily Executive', `Individual Day Report - ${selectedDay}`, [
    ['Board', state.boardTitle], ['Week Start', state.weekStartDate], ['Day', selectedDay], ['Shift', state.boardShift], ['Admin / Lead', state.adminName || state.boardLead || 'Not set'], ['Last Update', dayState.updatedAt || ''], ['Shift Start', shift.startLabel], ['Shift End', shift.endLabel], ['Generated Time', shift.nowLabel], ['Formula', 'Recovery racks + Prep racks + Media'],
  ], [
    { label: 'Total HC', value: totalHeadCount }, { label: 'Present', value: counts.present }, { label: 'Staffed', value: counts.staffed }, { label: 'Line Leads', value: counts.lineLeads || 0 },
    { label: 'Hours Worked', value: shift.hoursWorked }, { label: 'Hours Remaining', value: shift.remainingHours }, { label: 'Shift Hours', value: shift.shiftHours }, { label: 'Efficiency %', value: efficiency },
    { label: 'Total Goal Work', value: round(calc.totalWorkload) }, { label: 'Completed Work', value: round(calc.completedWorkload) }, { label: 'Remaining Work', value: round(calc.remainingWork) }, { label: 'Projected Gap', value: round(projectedGap) },
    { label: 'Goal TPH', value: round(calc.targetTPH) }, { label: 'Required Live TPH', value: round(calc.requiredTPH) }, { label: 'Recovery Done', value: number(calc.recoveryProcessed) }, { label: 'Prep Done', value: round(calc.rackPrepOutput ?? calc.prepOutput) },
    { label: 'Media Done', value: number(calc.mediaProcessed) }, { label: 'Rack Weight', value: rackWeight },
  ], [
    { title: 'Headcount Breakdown', headers: ['Status', 'Count'], rows: [['Present', counts.present], ['Training', counts.training], ['Indirect', counts.indirect], ['PTO', counts.pto], ['LOA', counts.loa], ['VTO', counts.vto], ['Absent', counts.absent], ['Unassigned', counts.unassigned], ['Line Leads', counts.lineLeads || 0]] },
    { title: 'Area Coverage', headers: ['Area', 'Count', 'Capacity', 'Note'], rows: areaSummaryRowsFromCounts(areaCounts) },
  ], DARK)

  appendJsonSheet(wb, 'People Detail', staff, '0EA5E9')
  appendJsonSheet(wb, 'Area Summary', areaCounts.map((a) => ({ area: a.name, count: a.count, capacity: a.capacity || '', note: a.note || '' })), GREEN)
  appendDashboardSheet(wb, 'TPH Detail', `TPH Dashboard - ${selectedDay}`, [['Day', selectedDay], ['Generated', new Date().toLocaleString()], ['Shift Start', shift.startLabel], ['Shift End', shift.endLabel], ['Hours Worked', shift.hoursWorked], ['Hours Remaining', shift.remainingHours]], [
    { label: 'Total Goal Work', value: round(calc.totalWorkload) }, { label: 'Completed Work', value: round(calc.completedWorkload) }, { label: 'Remaining Work', value: round(calc.remainingWork) }, { label: 'Projected Gap', value: round(projectedGap) },
    { label: 'Goal TPH', value: round(calc.targetTPH) }, { label: 'Required Live TPH', value: round(calc.requiredTPH) }, { label: 'Recovery Goal', value: number(calc.recoveryGoal) }, { label: 'Recovery Done', value: number(calc.recoveryProcessed) },
    { label: 'Prep Goal', value: number(calc.rackPrepGoal ?? calc.prepGoal) }, { label: 'Prep Done', value: round(calc.rackPrepOutput ?? calc.prepOutput) }, { label: 'Media Goal', value: number(calc.mediaGoal) }, { label: 'Media Done', value: number(calc.mediaProcessed) },
  ], [], PURPLE)
  appendJsonSheet(wb, 'Movement History', (dayState.movementLog || []).map((m) => ({ timestamp: m.timestamp, builder: m.builder, from_area: m.fromArea, to_area: m.toArea, from_status: m.fromStatus, to_status: m.toStatus, notes: m.notes })), ORANGE)
  appendJsonSheet(wb, 'Attendance History', (dayState.attendanceLog || []).map((a) => ({ timestamp: a.timestamp, clock_time: a.clock_time, builder: a.builder, event: a.event, note: a.note })), RED)
  appendSnapshotSheet(wb, 'Q1 Snapshot', dayState.snapshots?.q1, BLUE)
  appendSnapshotSheet(wb, 'Q2 Snapshot', dayState.snapshots?.q2, PURPLE)
  appendSnapshotSheet(wb, 'Q3 Snapshot', dayState.snapshots?.q3, GREEN)
  writeWorkbook(wb, `end-of-shift-${state.weekStartDate}-${selectedDay}.xlsx`)
}

export function exportWeeklyExcel({ state, weekDays, getDayData, builderPool, computeHoursForAssignment, areaDefs }) {
  const wb = XLSX.utils.book_new()
  const dailySummary = weekDays.map((day) => {
    const dayData = getDayData(day)
    const hc = statusCounts(dayData, builderPool)
    const shift = shiftInfo(day, state.weekStartDate, state.boardShift)
    const ops = opsMetrics(dayData, 6.4, hc.active, shift)
    return { day, shift_start: shift.startLabel, shift_end: shift.endLabel, hours_worked: shift.hoursWorked, hours_remaining: shift.remainingHours, active_hc: hc.active, assigned: hc.assigned, present: hc.present, training: hc.training, indirect: hc.indirect, pto: hc.pto, loa: hc.loa, vto: hc.vto, absent: hc.absent, unassigned: hc.unassigned, line_leads: hc.lineLeads, total_goal_work: round(ops.totalWorkload), completed_work: round(ops.completedWorkload), remaining_work: round(ops.remainingWork), required_live_tph: round(ops.requiredTPH), recovery_done: ops.recoveryProcessed, prep_done: ops.racksPrepped, media_done: ops.mediaProcessed, work_output: ops.simpleWorkOutput, updated_at: dayData.updatedAt || '' }
  })
  const weeklyTotals = dailySummary.reduce((acc, row) => { acc.active += row.active_hc; acc.goal += row.total_goal_work; acc.completed += row.completed_work; acc.remaining += row.remaining_work; acc.recovery += row.recovery_done; acc.prep += row.prep_done; acc.media += row.media_done; acc.work += row.work_output; return acc }, { active: 0, goal: 0, completed: 0, remaining: 0, recovery: 0, prep: 0, media: 0, work: 0 })
  const avgActive = dailySummary.length ? weeklyTotals.active / dailySummary.length : 0
  appendDashboardSheet(wb, 'Weekly Executive', 'Weekly Executive Staffing Report', [['Board', state.boardTitle], ['Week Start', state.weekStartDate], ['Shift', state.boardShift], ['Admin / Lead', state.adminName || state.boardLead || 'Not set'], ['Master Roster Size', builderPool.length], ['Days Included', weekDays.join(', ')]], [
    { label: 'Avg Active HC', value: round(avgActive, 1) }, { label: 'Weekly Goal Work', value: round(weeklyTotals.goal) }, { label: 'Weekly Completed', value: round(weeklyTotals.completed) }, { label: 'Weekly Remaining', value: round(weeklyTotals.remaining) },
    { label: 'Weekly Recovery', value: weeklyTotals.recovery }, { label: 'Weekly Prep', value: weeklyTotals.prep }, { label: 'Weekly Media', value: weeklyTotals.media }, { label: 'Weekly Work Output', value: weeklyTotals.work },
  ], [{ title: 'Daily Summary', headers: ['Day', 'Shift Start', 'Shift End', 'Hours Worked', 'Hours Remaining', 'Active HC', 'Assigned', 'Present', 'Training', 'Indirect', 'PTO', 'LOA', 'VTO', 'Absent', 'Unassigned', 'Line Leads', 'Goal Work', 'Completed Work', 'Remaining Work', 'Required TPH', 'Recovery', 'Prep', 'Media', 'Work Output', 'Updated'], rows: dailySummary.map((r) => [r.day, r.shift_start, r.shift_end, r.hours_worked, r.hours_remaining, r.active_hc, r.assigned, r.present, r.training, r.indirect, r.pto, r.loa, r.vto, r.absent, r.unassigned, r.line_leads, r.total_goal_work, r.completed_work, r.remaining_work, r.required_live_tph, r.recovery_done, r.prep_done, r.media_done, r.work_output, r.updated_at]) }], DARK)
  weekDays.forEach((day) => {
    const dayData = getDayData(day)
    const hc = statusCounts(dayData, builderPool)
    const shift = shiftInfo(day, state.weekStartDate, state.boardShift)
    const ops = opsMetrics(dayData, 6.4, hc.active, shift)
    const staffTable = tableRowsFromObjects(staffRows(dayData, builderPool))
    appendDashboardSheet(wb, day, `${day} Staffing Detail`, [['Week Start', state.weekStartDate], ['Shift', state.boardShift], ['Shift Start', shift.startLabel], ['Shift End', shift.endLabel], ['Hours Worked', shift.hoursWorked], ['Hours Remaining', shift.remainingHours], ['Updated', dayData.updatedAt || ''], ['Active HC', hc.active]], [
      { label: 'Present', value: hc.present }, { label: 'Training', value: hc.training }, { label: 'Indirect', value: hc.indirect }, { label: 'Line Leads', value: hc.lineLeads }, { label: 'Goal Work', value: round(ops.totalWorkload) }, { label: 'Completed Work', value: round(ops.completedWorkload) }, { label: 'Remaining Work', value: round(ops.remainingWork) }, { label: 'Required TPH', value: round(ops.requiredTPH) },
    ], [{ title: 'Staffing Detail', headers: staffTable.headers, rows: staffTable.rows }], BLUE)
  })
  const matrixRows = builderPool.map((builder) => { const row = { builder: builder.name, badge_type: builder.badgeType || 'day', skills_roles: skills(builder) }; weekDays.forEach((day) => { const a = getDayData(day).assignments?.[builder.id]; row[`${day}_status`] = a?.status || ''; row[`${day}_area`] = a?.area || ''; row[`${day}_role`] = a?.role || '' }); return row })
  appendJsonSheet(wb, 'Weekly Staff Matrix', matrixRows, BLUE)
  const weeklyHours = []
  builderPool.forEach((builder) => { weekDays.forEach((day) => { const a = getDayData(day).assignments[builder.id]; if (!a) return; const totals = computeHoursForAssignment(a, day, state.weekStartDate); Object.entries(totals).forEach(([area, hours]) => weeklyHours.push({ builder: builder.name, day, area, hours: round(hours) })) }) })
  appendJsonSheet(wb, 'Weekly Hours by Area', weeklyHours, GREEN)
  const areaSummary = []
  weekDays.forEach((day) => { const dayData = getDayData(day); areaDefs.forEach((area) => { const count = builderPool.filter((b) => { const a = dayData.assignments[b.id]; if (!a) return false; return (a.area || 'Unassigned') === area.name && ['Present', 'Training', 'Indirect'].includes(a.status || 'Present') && !b.isLineLead }).length; areaSummary.push({ day, area: area.name, count, capacity: area.capacity || '', note: area.note || '' }) }) })
  appendJsonSheet(wb, 'Area Counts by Day', areaSummary, ORANGE)
  writeWorkbook(wb, `weekly-staffing-board-${state.weekStartDate}.xlsx`)
}
