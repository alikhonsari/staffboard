import * as XLSX from 'xlsx'

const DARK = '0F172A'
const BLUE = '2563EB'
const PURPLE = '7C3AED'
const GREEN = '059669'
const ORANGE = 'F59E0B'
const RED = 'DC2626'
const LIGHT_BLUE = 'EFF6FF'
const LIGHT_GRAY = 'F8FAFC'
const LINE = 'D1D5DB'

function safeSheetName(name) {
  return String(name || 'Sheet').replace(/[\\/?*:[\]]/g, ' ').slice(0, 31)
}
function prettyHeader(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}
function number(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}
function border(color = LINE) {
  return {
    top: { style: 'thin', color: { rgb: color } },
    bottom: { style: 'thin', color: { rgb: color } },
    left: { style: 'thin', color: { rgb: color } },
    right: { style: 'thin', color: { rgb: color } },
  }
}
function setCellStyle(ws, ref, style) {
  if (!ws[ref]) return
  ws[ref].s = style
}
function autoWidthFromAoa(aoa) {
  const colCount = Math.max(1, ...aoa.map((row) => row.length))
  return Array.from({ length: colCount }, (_, c) => {
    const maxLen = Math.max(10, ...aoa.map((row) => String(row[c] ?? '').length))
    return { wch: Math.min(Math.max(maxLen + 2, 12), c === 0 ? 28 : 34) }
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
      if (titleRows.has(r)) {
        setCellStyle(ws, ref, {
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 16 },
          fill: { fgColor: { rgb: titleColor } },
          alignment: { horizontal: 'left', vertical: 'center' },
          border: border(titleColor),
        })
      } else if (sectionRows.has(r)) {
        setCellStyle(ws, ref, {
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 },
          fill: { fgColor: { rgb: DARK } },
          alignment: { horizontal: 'left', vertical: 'center' },
          border: border(DARK),
        })
      } else if (headerRows.has(r)) {
        setCellStyle(ws, ref, {
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
          fill: { fgColor: { rgb: headerColor } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: border(),
        })
      } else {
        setCellStyle(ws, ref, {
          alignment: { vertical: 'top', wrapText: true },
          fill: { fgColor: { rgb: r % 2 === 0 ? LIGHT_GRAY : 'FFFFFF' } },
          border: border('E5E7EB'),
        })
      }
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

  function section(label) {
    const r = aoa.length
    sectionRows.push(r)
    merges.push({ s: { r, c: 0 }, e: { r, c: maxCols - 1 } })
    aoa.push([label])
  }
  function pad(row) {
    return [...row, ...Array(Math.max(0, maxCols - row.length)).fill('')]
  }

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
    for (let j = 0; j < 4; j += 1) {
      const card = kpiCards[i + j] || { label: '', value: '' }
      row.push(card.label || '', card.value ?? '')
    }
    aoa.push(pad(row))
  }

  tables.forEach((table) => {
    aoa.push([])
    section(table.title)
    headerRows.push(aoa.length)
    aoa.push(pad(table.headers))
    ;(table.rows.length ? table.rows : [Array(table.headers.length).fill('')]).forEach((row) => aoa.push(pad(row)))
  })

  appendStyledSheet(wb, name, aoa, {
    cols: [{ wch: 22 }, { wch: 18 }, { wch: 4 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 18 }],
    merges,
    titleRows,
    sectionRows,
    headerRows,
    titleColor: color,
    headerColor: BLUE,
    freezeRow: 3,
  })
}
function appendSnapshotSheet(wb, sheetName, snap, color) {
  const rows = snap ? (snap.byArea || []).map((r) => ({
    snapshot: snap.label,
    captured_at: snap.capturedAt,
    area: r.area,
    count: r.count,
    present: snap.totals.present,
    staffed: snap.totals.staffed,
    unassigned: snap.totals.unassigned,
  })) : []
  appendJsonSheet(wb, sheetName, rows, color)
}
function skills(profile = {}) {
  return [
    profile.trainedTdr ? 'TDR' : '',
    profile.trainedForklift ? 'Forklift' : '',
    profile.trainedCenterRider ? 'Center Rider' : '',
    profile.trainedClampTruck ? 'Clamp Truck' : '',
    profile.isTrainer ? 'Trainer' : '',
    profile.isSafetyMember ? 'Safety' : '',
    profile.isLineLead ? 'Line Lead' : '',
  ].filter(Boolean).join(', ')
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
function opsMetrics(dayData) {
  const m = dayData.opsMetrics || {}
  const recoveryGoal = number(m.targetRackMediaRecovery)
  const recoveryProcessed = number(m.racksProcessed)
  const prepGoal = number(m.targetRackPrep)
  const racksPrepped = number(m.racksPrepped)
  const recoveredInPrep = number(m.recoveredRackPrep)
  const mediaGoal = number(m.totalMediaCount)
  const mediaProcessed = number(m.mediaProcessed)
  const workOutput = recoveryProcessed + racksPrepped + mediaProcessed
  return { recoveryGoal, recoveryProcessed, prepGoal, racksPrepped, recoveredInPrep, mediaGoal, mediaProcessed, workOutput }
}
function staffRows(dayData, builders) {
  return builders.filter((builder) => dayData.assignments?.[builder.id]).map((builder) => {
    const a = dayData.assignments[builder.id]
    return {
      builder: builder.name,
      badge_type: builder.badgeType || 'day',
      skills_roles: skills(builder),
      status: a.status || 'Present',
      area: a.area || 'Unassigned',
      sub_area: a.subArea || '',
      role: a.role || '',
      clock_in_time: a.clockInTime || '',
      leave_time: a.leaveTime || '',
      comment: a.comment || '',
      notes: a.builderNotes || '',
      updated_at: a.updatedAt || '',
    }
  }).sort((a, b) => String(a.area).localeCompare(String(b.area)) || String(a.status).localeCompare(String(b.status)) || String(a.builder).localeCompare(String(b.builder)))
}
function tableRowsFromObjects(rows) {
  if (!rows.length) return { headers: ['Note'], rows: [['No data']] }
  const keys = Object.keys(rows[0])
  return { headers: keys.map(prettyHeader), rows: rows.map((row) => keys.map((key) => row[key] ?? '')) }
}
function areaSummaryRowsFromCounts(areaCounts = []) {
  return areaCounts.map((a) => [a.name, a.count, a.capacity || '', a.note || ''])
}
function writeWorkbook(wb, filename) {
  XLSX.writeFile(wb, filename, { bookType: 'xlsx', cellStyles: true })
}

export function exportEndOfShiftExcel({
  state, dayState, metrics, counts, areaCounts, totalHeadCount, shiftHours, rackWeight, getAssignment, activeBuilders, selectedDay,
}) {
  const wb = XLSX.utils.book_new()
  const staff = activeBuilders.map((b) => {
    const a = getAssignment(b.id)
    const profile = state.builderPool.find((p) => p.id === b.id) || {}
    return {
      builder: b.name,
      badge_type: profile.badgeType || 'day',
      skills_roles: skills(profile),
      status: a.status || 'Present',
      area: a.area || 'Unassigned',
      sub_area: a.subArea || '',
      role: a.role || '',
      clock_in_time: a.clockInTime || '',
      leave_time: a.leaveTime || '',
      comment: a.comment || '',
      builder_notes: a.builderNotes || '',
      updated_at: a.updatedAt || '',
    }
  }).sort((a, b) => String(a.area).localeCompare(String(b.area)) || String(a.status).localeCompare(String(b.status)) || String(a.builder).localeCompare(String(b.builder)))

  appendDashboardSheet(wb, 'Daily Executive', `Individual Day Report - ${selectedDay}`, [
    ['Board', state.boardTitle], ['Week Start', state.weekStartDate],
    ['Day', selectedDay], ['Shift', state.boardShift],
    ['Admin / Lead', state.adminName || state.boardLead || 'Not set'], ['Last Update', dayState.updatedAt || ''],
  ], [
    { label: 'Total HC', value: totalHeadCount },
    { label: 'Present', value: counts.present },
    { label: 'Staffed', value: counts.staffed },
    { label: 'Line Leads', value: counts.lineLeads || 0 },
    { label: 'Goal TPH', value: Number(metrics.targetTPH.toFixed(2)) },
    { label: 'Required Live TPH', value: Number(metrics.requiredTPH.toFixed(2)) },
    { label: 'Remaining Work', value: Number(metrics.remainingWork.toFixed(2)) },
    { label: 'Efficiency %', value: metrics.targetTPH ? Number(((metrics.completedWorkload / Math.max(metrics.totalGoal || 1, 1)) * 100).toFixed(1)) : 0 },
    { label: 'Recovery Goal', value: Number(metrics.recoveryGoal || 0) },
    { label: 'Recovery Done', value: Number(metrics.recoveryProcessed || 0) },
    { label: 'Prep Goal', value: Number(metrics.rackPrepGoal || 0) },
    { label: 'Prep Done', value: Number(metrics.rackPrepOutput.toFixed(2)) },
    { label: 'Media Goal', value: Number(metrics.mediaGoal || 0) },
    { label: 'Media Done', value: Number(metrics.mediaProcessed || 0) },
    { label: 'Paid Hours', value: shiftHours },
    { label: 'Rack Weight', value: rackWeight },
  ], [
    { title: 'Headcount Breakdown', headers: ['Status', 'Count'], rows: [['Present', counts.present], ['Training', counts.training], ['Indirect', counts.indirect], ['PTO', counts.pto], ['LOA', counts.loa], ['VTO', counts.vto], ['Absent', counts.absent], ['Unassigned', counts.unassigned], ['Line Leads', counts.lineLeads || 0]] },
    { title: 'Area Coverage', headers: ['Area', 'Count', 'Capacity', 'Note'], rows: areaSummaryRowsFromCounts(areaCounts) },
  ], DARK)

  appendJsonSheet(wb, 'People Detail', staff, '0EA5E9')
  appendJsonSheet(wb, 'Area Summary', areaCounts.map((a) => ({ area: a.name, count: a.count, capacity: a.capacity || '', note: a.note || '' })), GREEN)
  appendDashboardSheet(wb, 'TPH Detail', `TPH Dashboard - ${selectedDay}`, [
    ['Day', selectedDay], ['Generated', new Date().toLocaleString()],
    ['Formula', 'Recovery racks + Prep racks + Media'], ['Paid Shift Hours', shiftHours],
  ], [
    { label: 'Goal TPH', value: Number(metrics.targetTPH.toFixed(2)) },
    { label: 'Required Live TPH', value: Number(metrics.requiredTPH.toFixed(2)) },
    { label: 'Completed Work', value: Number(metrics.completedWorkload.toFixed(2)) },
    { label: 'Remaining Work', value: Number(metrics.remainingWork.toFixed(2)) },
    { label: 'Recovery Goal', value: Number(metrics.recoveryGoal || 0) },
    { label: 'Racks Processed', value: Number(metrics.recoveryProcessed || 0) },
    { label: 'Prep Goal', value: Number(metrics.rackPrepGoal || 0) },
    { label: 'Recovered + Prepped', value: Number(metrics.rackPrepOutput.toFixed(2)) },
    { label: 'Media Goal', value: Number(metrics.mediaGoal || 0) },
    { label: 'Media Processed', value: Number(metrics.mediaProcessed || 0) },
    { label: 'Total HC', value: totalHeadCount },
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
    const ops = opsMetrics(dayData)
    return {
      day,
      active_hc: hc.active,
      assigned: hc.assigned,
      present: hc.present,
      training: hc.training,
      indirect: hc.indirect,
      pto: hc.pto,
      loa: hc.loa,
      vto: hc.vto,
      absent: hc.absent,
      unassigned: hc.unassigned,
      line_leads: hc.lineLeads,
      recovery_done: ops.recoveryProcessed,
      prep_done: ops.racksPrepped,
      media_done: ops.mediaProcessed,
      work_output: ops.workOutput,
      updated_at: dayData.updatedAt || '',
    }
  })
  const weeklyTotals = dailySummary.reduce((acc, row) => {
    acc.active += row.active_hc
    acc.recovery += row.recovery_done
    acc.prep += row.prep_done
    acc.media += row.media_done
    acc.work += row.work_output
    return acc
  }, { active: 0, recovery: 0, prep: 0, media: 0, work: 0 })
  const avgActive = dailySummary.length ? weeklyTotals.active / dailySummary.length : 0

  appendDashboardSheet(wb, 'Weekly Executive', 'Weekly Executive Staffing Report', [
    ['Board', state.boardTitle], ['Week Start', state.weekStartDate],
    ['Shift', state.boardShift], ['Admin / Lead', state.adminName || state.boardLead || 'Not set'],
    ['Master Roster Size', builderPool.length], ['Days Included', weekDays.join(', ')],
  ], [
    { label: 'Avg Active HC', value: Number(avgActive.toFixed(1)) },
    { label: 'Weekly Recovery', value: weeklyTotals.recovery },
    { label: 'Weekly Prep', value: weeklyTotals.prep },
    { label: 'Weekly Media', value: weeklyTotals.media },
    { label: 'Weekly Work Output', value: weeklyTotals.work },
    { label: 'Days Included', value: weekDays.length },
  ], [
    { title: 'Daily Summary', headers: ['Day', 'Active HC', 'Assigned', 'Present', 'Training', 'Indirect', 'PTO', 'LOA', 'VTO', 'Absent', 'Unassigned', 'Line Leads', 'Recovery', 'Prep', 'Media', 'Work', 'Updated'], rows: dailySummary.map((r) => [r.day, r.active_hc, r.assigned, r.present, r.training, r.indirect, r.pto, r.loa, r.vto, r.absent, r.unassigned, r.line_leads, r.recovery_done, r.prep_done, r.media_done, r.work_output, r.updated_at]) },
  ], DARK)

  weekDays.forEach((day) => {
    const dayData = getDayData(day)
    const hc = statusCounts(dayData, builderPool)
    const ops = opsMetrics(dayData)
    const staff = staffRows(dayData, builderPool)
    const staffTable = tableRowsFromObjects(staff)
    appendDashboardSheet(wb, day, `${day} Staffing Detail`, [
      ['Week Start', state.weekStartDate], ['Shift', state.boardShift], ['Updated', dayData.updatedAt || ''], ['Active HC', hc.active],
    ], [
      { label: 'Present', value: hc.present },
      { label: 'Training', value: hc.training },
      { label: 'Indirect', value: hc.indirect },
      { label: 'Line Leads', value: hc.lineLeads },
      { label: 'Recovery Done', value: ops.recoveryProcessed },
      { label: 'Prep Done', value: ops.racksPrepped },
      { label: 'Media Done', value: ops.mediaProcessed },
      { label: 'Work Output', value: ops.workOutput },
    ], [
      { title: 'Staffing Detail', headers: staffTable.headers, rows: staffTable.rows },
    ], BLUE)
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
  appendJsonSheet(wb, 'Weekly Staff Matrix', matrixRows, BLUE)

  const weeklyHours = []
  builderPool.forEach((builder) => {
    weekDays.forEach((day) => {
      const a = getDayData(day).assignments[builder.id]
      if (!a) return
      const totals = computeHoursForAssignment(a, day, state.weekStartDate)
      Object.entries(totals).forEach(([area, hours]) => {
        weeklyHours.push({ builder: builder.name, day, area, hours: Number(hours.toFixed(2)) })
      })
    })
  })
  appendJsonSheet(wb, 'Weekly Hours by Area', weeklyHours, GREEN)

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
  appendJsonSheet(wb, 'Area Counts by Day', areaSummary, ORANGE)

  writeWorkbook(wb, `weekly-staffing-board-${state.weekStartDate}.xlsx`)
}
