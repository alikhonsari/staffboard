import * as XLSX from 'xlsx'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const SHIFT_HOURS = 8
const RACK_WEIGHT = 6.4
const COLORS = {
  navy: '0F172A',
  blue: '2563EB',
  blueSoft: 'DBEAFE',
  green: '059669',
  purple: '7C3AED',
  orange: 'D97706',
  red: 'DC2626',
  line: 'CBD5E1',
  light: 'F8FAFC',
  white: 'FFFFFF',
  text: '172033',
  muted: '64748B',
}

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

function border(color = COLORS.line) {
  return {
    top: { style: 'thin', color: { rgb: color } },
    bottom: { style: 'thin', color: { rgb: color } },
    left: { style: 'thin', color: { rgb: color } },
    right: { style: 'thin', color: { rgb: color } },
  }
}

function styleCell(ws, ref, style) {
  if (ws[ref]) ws[ref].s = style
}

function applyReportStyles(ws, options = {}) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1')
  const titleRow = options.titleRow ?? 0
  const subtitleRow = options.subtitleRow ?? 1
  const headerRows = new Set(options.headerRows || [])
  const sectionRows = new Set(options.sectionRows || [])
  const accent = options.accent || COLORS.blue

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const ref = XLSX.utils.encode_cell({ r, c })
      if (!ws[ref]) continue

      if (r === titleRow) {
        styleCell(ws, ref, {
          font: { bold: true, color: { rgb: COLORS.white }, sz: 18 },
          fill: { fgColor: { rgb: COLORS.navy } },
          alignment: { vertical: 'center' },
          border: border(COLORS.navy),
        })
      } else if (r === subtitleRow) {
        styleCell(ws, ref, {
          font: { bold: true, color: { rgb: COLORS.muted }, sz: 11 },
          fill: { fgColor: { rgb: COLORS.light } },
          alignment: { vertical: 'center', wrapText: true },
        })
      } else if (sectionRows.has(r)) {
        styleCell(ws, ref, {
          font: { bold: true, color: { rgb: COLORS.white }, sz: 12 },
          fill: { fgColor: { rgb: accent } },
          alignment: { vertical: 'center' },
          border: border(accent),
        })
      } else if (headerRows.has(r)) {
        styleCell(ws, ref, {
          font: { bold: true, color: { rgb: COLORS.white }, sz: 10 },
          fill: { fgColor: { rgb: accent } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: border(),
        })
      } else {
        styleCell(ws, ref, {
          font: { color: { rgb: COLORS.text }, sz: 10 },
          fill: { fgColor: { rgb: r % 2 === 0 ? COLORS.light : COLORS.white } },
          alignment: { vertical: 'top', wrapText: true },
          border: border('E2E8F0'),
        })
      }
    }
  }
}

function columnWidths(aoa) {
  const count = Math.max(1, ...aoa.map((row) => row.length))
  return Array.from({ length: count }, (_, col) => {
    const longest = Math.max(10, ...aoa.map((row) => String(row[col] ?? '').length))
    return { wch: Math.min(Math.max(longest + 2, col === 0 ? 18 : 12), col === 0 ? 34 : 46) }
  })
}

function appendProfessionalSheet(wb, name, config = {}) {
  const aoa = []
  const merges = []
  const headerRows = []
  const sectionRows = []
  const maxCols = Math.max(2, config.maxCols || 8)
  const pad = (row) => [...row, ...Array(Math.max(0, maxCols - row.length)).fill('')]

  aoa.push([config.title || name])
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: maxCols - 1 } })
  aoa.push([config.subtitle || 'StaffBoard report'])
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: maxCols - 1 } })
  aoa.push([])

  const meta = config.meta || []
  if (meta.length) {
    sectionRows.push(aoa.length)
    aoa.push(['REPORT INFORMATION'])
    merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: maxCols - 1 } })
    for (let i = 0; i < meta.length; i += 2) {
      const left = meta[i] || ['', '']
      const right = meta[i + 1] || ['', '']
      aoa.push(pad([left[0], left[1], '', right[0], right[1]]))
    }
  }

  ;(config.sections || []).forEach((section) => {
    aoa.push([])
    sectionRows.push(aoa.length)
    aoa.push([section.title])
    merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: maxCols - 1 } })

    if (section.headers?.length) {
      headerRows.push(aoa.length)
      aoa.push(pad(section.headers))
    }

    const rows = section.rows?.length ? section.rows : [Array(section.headers?.length || 1).fill('')]
    rows.forEach((row) => aoa.push(pad(row)))
  })

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = merges
  ws['!cols'] = config.cols || columnWidths(aoa)
  ws['!rows'] = aoa.map((row, index) => ({ hpt: index === 0 ? 28 : index === 1 ? 22 : row.some((value) => String(value || '').length > 70) ? 34 : 20 }))
  ws['!freeze'] = { xSplit: 0, ySplit: Math.min(6, aoa.length) }
  applyReportStyles(ws, { headerRows, sectionRows, accent: config.accent || COLORS.blue })
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName(name))
}

function appendDataSheet(wb, name, rows, options = {}) {
  const safeRows = rows.length ? rows : [{ note: 'No data' }]
  const keys = Object.keys(safeRows[0])
  const headers = keys.map(prettyHeader)
  appendProfessionalSheet(wb, name, {
    title: options.title || name,
    subtitle: options.subtitle || 'Detailed export data',
    meta: options.meta || [],
    accent: options.accent || COLORS.blue,
    maxCols: Math.max(4, keys.length),
    sections: [{
      title: options.sectionTitle || name.toUpperCase(),
      headers,
      rows: safeRows.map((row) => keys.map((key) => row[key] ?? '')),
    }],
  })
}

function writeWorkbook(wb, filename, author) {
  wb.Props = {
    Title: filename.replace(/\.xlsx$/i, ''),
    Subject: 'StaffBoard Operations Report',
    Author: author || 'StaffBoard',
    Company: 'StaffBoard',
    CreatedDate: new Date(),
  }
  XLSX.writeFile(wb, filename, { bookType: 'xlsx', cellStyles: true })
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

  return {
    startLabel: timeLabel(start),
    endLabel: timeLabel(end),
    nowLabel: timeLabel(now),
    hoursWorked: round(Math.min(SHIFT_HOURS, Math.max(0, worked))),
    remainingHours: round(Math.min(SHIFT_HOURS, Math.max(0, remaining))),
    shiftHours: SHIFT_HOURS,
  }
}

function skills(profile = {}) {
  return [
    profile.trainedTdr ? 'TDR' : '',
    profile.trainedForklift ? 'Forklift' : '',
    profile.trainedCenterRider ? 'Center Rider' : '',
    profile.trainedClampTruck ? 'Clamp Truck' : '',
    profile.trainedRackMover ? 'Rack Mover' : '',
    profile.trainedReachTruck ? 'Reach Truck' : '',
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
  return { recoveryGoal, recoveryProcessed, prepGoal, racksPrepped, recoveredInPrep, prepOutput, mediaGoal, mediaProcessed, totalWorkload, completedWorkload, remainingWork, targetTPH, requiredTPH }
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
    return {
      builder: builder.name,
      badge_type: builder.badgeType || 'day',
      skills_roles: skills(builder),
      status: a.status || 'Present',
      area: a.area || 'Unassigned',
      sub_area: a.subArea || '',
      role: a.role || '',
      clock_in_time: a.clockInTime || '',
      clock_out_time: a.leaveTime || '',
      comment: a.comment || '',
      notes: a.builderNotes || '',
      updated_at: a.updatedAt || '',
    }
  }).sort((a, b) => String(a.area).localeCompare(String(b.area)) || String(a.builder).localeCompare(String(b.builder)))
}

function weeklyHoursRows({ weekDays, getDayData, builderPool, computeHoursForAssignment, weekStartDate }) {
  const detailed = []
  const totals = new Map()

  builderPool.forEach((builder) => {
    weekDays.forEach((day) => {
      const assignment = getDayData(day).assignments?.[builder.id]
      if (!assignment) return
      const areas = computeHoursForAssignment(assignment, day, weekStartDate)
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

  return {
    detailed,
    totals: Array.from(totals.values())
      .map((row) => ({ ...row, total_week_hours: round(row.total_week_hours) }))
      .sort((a, b) => a.builder.localeCompare(b.builder) || a.area.localeCompare(b.area)),
  }
}

export function exportEndOfShiftExcel({ state, dayState, metrics, counts, areaCounts, totalHeadCount, rackWeight, getAssignment, activeBuilders, selectedDay, adminName }) {
  const wb = XLSX.utils.book_new()
  const shift = shiftInfo(selectedDay, state.weekStartDate, state.boardShift)
  const reportAdmin = adminName || state.adminName || state.boardLead || 'Not set'
  const calc = { ...opsMetrics(dayState, rackWeight, totalHeadCount, shift), ...metrics }
  const staff = activeBuilders.map((builder) => {
    const assignment = getAssignment(builder.id)
    const profile = state.builderPool.find((p) => p.id === builder.id) || builder
    return {
      builder: builder.name,
      badge_type: profile.badgeType || 'day',
      skills_roles: skills(profile),
      status: assignment.status || 'Present',
      area: assignment.area || 'Unassigned',
      sub_area: assignment.subArea || '',
      role: assignment.role || '',
      clock_in_time: assignment.clockInTime || '',
      clock_out_time: assignment.leaveTime || '',
      comment: assignment.comment || '',
      builder_notes: assignment.builderNotes || '',
      updated_at: assignment.updatedAt || '',
    }
  })

  const meta = [
    ['Board', state.boardTitle], ['Logged-in Admin', reportAdmin],
    ['Week Start', state.weekStartDate], ['Day', selectedDay],
    ['Shift', state.boardShift], ['Shift Window', `${shift.startLabel} - ${shift.endLabel}`],
    ['Generated', new Date().toLocaleString()], ['Current Time', shift.nowLabel],
  ]

  appendProfessionalSheet(wb, 'Daily Executive', {
    title: `Daily Operations Report - ${selectedDay}`,
    subtitle: `${state.boardTitle} · ${state.boardShift} · ${shift.startLabel} - ${shift.endLabel}`,
    meta,
    accent: COLORS.blue,
    sections: [
      {
        title: 'HEADCOUNT SNAPSHOT',
        headers: ['Metric', 'Value', 'Metric', 'Value', 'Metric', 'Value', 'Metric', 'Value'],
        rows: [[
          'Total HC', totalHeadCount,
          'Present', counts.present,
          'Staffed', counts.staffed,
          'Line Leads', counts.lineLeads || 0,
        ], [
          'Training', counts.training,
          'Indirect', counts.indirect,
          'PTO', counts.pto,
          'Unassigned', counts.unassigned,
        ]],
      },
      {
        title: 'OPERATIONS PERFORMANCE',
        headers: ['Metric', 'Goal', 'Done', 'Remaining', 'Metric', 'Value', 'Metric', 'Value'],
        rows: [[
          'Recovery', calc.recoveryGoal, calc.recoveryProcessed, Math.max(0, calc.recoveryGoal - calc.recoveryProcessed),
          'Goal TPH', round(calc.targetTPH),
          'Required TPH', round(calc.requiredTPH),
        ], [
          'Rack Prep', calc.rackPrepGoal ?? calc.prepGoal, calc.rackPrepOutput ?? calc.prepOutput, '',
          'Total Goal Work', round(calc.totalWorkload ?? calc.weightedTarget),
          'Completed Work', round(calc.completedWorkload ?? calc.weightedCompleted),
        ], [
          'Media', calc.mediaGoal, calc.mediaProcessed, Math.max(0, calc.mediaGoal - calc.mediaProcessed),
          'Remaining Work', round(calc.remainingWork),
          'Hours Remaining', shift.remainingHours,
        ]],
      },
      {
        title: 'AREA COVERAGE',
        headers: ['Area', 'Count', 'Capacity', 'Note'],
        rows: areaCounts.map((area) => [area.name, area.count, area.capacity || '', area.note || '']),
      },
    ],
  })

  appendDataSheet(wb, 'People Detail', staff, { title: `${selectedDay} People Detail`, subtitle: `${state.boardShift} · ${shift.startLabel} - ${shift.endLabel}`, meta, accent: COLORS.blue })
  appendDataSheet(wb, 'Rack IDs Materials', rackRowsForDay(dayState, selectedDay), { title: `${selectedDay} Rack IDs & Material Types`, subtitle: 'Processed and prepared racks', meta, accent: COLORS.purple })
  appendDataSheet(wb, 'Movement History', (dayState.movementLog || []).map((m) => ({ timestamp: m.timestamp, builder: m.builder, from: m.from || m.fromArea || '', to: m.to || m.toArea || '', note: m.note || m.notes || '' })), { title: `${selectedDay} Movement History`, meta, accent: COLORS.orange })
  appendDataSheet(wb, 'Attendance History', (dayState.attendanceLog || []).map((a) => ({ timestamp: a.timestamp, clock_time: a.clock_time, builder: a.builder, event: a.event, note: a.note })), { title: `${selectedDay} Attendance History`, meta, accent: COLORS.red })

  writeWorkbook(wb, `end-of-shift-${state.weekStartDate}-${selectedDay}.xlsx`, reportAdmin)
}

export function exportWeeklyExcel({ state, weekDays, getDayData, builderPool, computeHoursForAssignment, areaDefs, adminName }) {
  const wb = XLSX.utils.book_new()
  const reportAdmin = adminName || state.adminName || state.boardLead || 'Not set'
  const mondayShift = shiftInfo('Monday', state.weekStartDate, state.boardShift)
  const shiftWindow = `${mondayShift.startLabel} - ${mondayShift.endLabel}`

  const dailySummary = weekDays.map((day) => {
    const dayData = getDayData(day)
    const hc = statusCounts(dayData, builderPool)
    const shift = shiftInfo(day, state.weekStartDate, state.boardShift)
    const ops = opsMetrics(dayData, RACK_WEIGHT, hc.active, shift)
    return {
      day,
      shift_start: shift.startLabel,
      shift_end: shift.endLabel,
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
      total_goal_work: round(ops.totalWorkload),
      completed_work: round(ops.completedWorkload),
      remaining_work: round(ops.remainingWork),
      required_tph: round(ops.requiredTPH),
      recovery_done: ops.recoveryProcessed,
      prep_done: ops.racksPrepped,
      media_done: ops.mediaProcessed,
      updated_at: dayData.updatedAt || '',
    }
  })

  const totals = dailySummary.reduce((acc, row) => {
    acc.recovery += row.recovery_done
    acc.prep += row.prep_done
    acc.media += row.media_done
    acc.goal += row.total_goal_work
    acc.completed += row.completed_work
    return acc
  }, { recovery: 0, prep: 0, media: 0, goal: 0, completed: 0 })

  const weeklyHours = weeklyHoursRows({ weekDays, getDayData, builderPool, computeHoursForAssignment, weekStartDate: state.weekStartDate })
  const totalStaffedHours = weeklyHours.totals.reduce((sum, row) => sum + number(row.total_week_hours), 0)
  const allRacks = weekDays.flatMap((day) => rackRowsForDay(getDayData(day), day))
  const meta = [
    ['Board', state.boardTitle], ['Logged-in Admin', reportAdmin],
    ['Week Start', state.weekStartDate], ['Days Included', weekDays.join(', ')],
    ['Shift', state.boardShift], ['Shift Window', shiftWindow],
    ['Generated', new Date().toLocaleString()], ['Roster Size', builderPool.length],
  ]

  appendProfessionalSheet(wb, 'Weekly Executive', {
    title: 'Weekly Executive Operations Report',
    subtitle: `${state.boardTitle} · ${state.boardShift} · ${shiftWindow}`,
    meta,
    accent: COLORS.blue,
    maxCols: 8,
    sections: [
      {
        title: 'WEEKLY KPI SNAPSHOT',
        headers: ['Metric', 'Value', 'Metric', 'Value', 'Metric', 'Value', 'Metric', 'Value'],
        rows: [[
          'Recovery', totals.recovery,
          'Rack Prep', totals.prep,
          'Media', totals.media,
          'Staffed Hours', round(totalStaffedHours),
        ], [
          'Goal Work', round(totals.goal),
          'Completed Work', round(totals.completed),
          'Rack Entries', allRacks.length,
          'Builders', builderPool.length,
        ]],
      },
      {
        title: 'DAILY PERFORMANCE SUMMARY',
        headers: ['Day', 'Shift', 'Active HC', 'Present', 'PTO', 'Recovery', 'Prep', 'Media'],
        rows: dailySummary.map((row) => [row.day, `${row.shift_start} - ${row.shift_end}`, row.active_hc, row.present, row.pto, row.recovery_done, row.prep_done, row.media_done]),
      },
      {
        title: 'DAILY WORKLOAD / TPH',
        headers: ['Day', 'Goal Work', 'Completed Work', 'Remaining Work', 'Required TPH', 'Unassigned', 'Line Leads', 'Updated'],
        rows: dailySummary.map((row) => [row.day, row.total_goal_work, row.completed_work, row.remaining_work, row.required_tph, row.unassigned, row.line_leads, row.updated_at]),
      },
    ],
  })

  weekDays.forEach((day) => {
    const dayMeta = [...meta, ['Day', day], ['Day Updated', getDayData(day).updatedAt || '']]
    appendDataSheet(wb, `${day} Staff`, staffRows(getDayData(day), builderPool), { title: `${day} Staffing Detail`, subtitle: `${state.boardShift} · ${shiftWindow}`, meta: dayMeta, accent: COLORS.blue })
    appendDataSheet(wb, `${day} Racks`, rackRowsForDay(getDayData(day), day), { title: `${day} Rack IDs & Material Types`, subtitle: 'Processed and prepared racks', meta: dayMeta, accent: COLORS.purple })
  })

  const matrixRows = builderPool.map((builder) => {
    const row = { builder: builder.name, badge_type: builder.badgeType || 'day', skills_roles: skills(builder) }
    weekDays.forEach((day) => {
      const assignment = getDayData(day).assignments?.[builder.id]
      row[`${day}_status`] = assignment?.status || ''
      row[`${day}_area`] = assignment?.area || ''
      row[`${day}_role`] = assignment?.role || ''
      row[`${day}_clock_in`] = assignment?.clockInTime || ''
      row[`${day}_clock_out`] = assignment?.leaveTime || ''
    })
    return row
  })

  appendDataSheet(wb, 'Weekly Staff Matrix', matrixRows, { title: 'Weekly Staff Matrix', subtitle: `${state.boardShift} · ${shiftWindow}`, meta, accent: COLORS.blue })
  appendDataSheet(wb, 'Builder Hours by Area', weeklyHours.totals, { title: 'Builder Hours by Area - Whole Week', subtitle: 'Total weekly hours for each builder in each area', meta, accent: COLORS.green })
  appendDataSheet(wb, 'Builder Hours Detail', weeklyHours.detailed, { title: 'Builder Hours Detail', subtitle: 'Builder hours by day and area', meta, accent: COLORS.green })
  appendDataSheet(wb, 'Weekly Rack IDs Materials', allRacks, { title: 'Weekly Rack IDs & Material Types', subtitle: 'All processed and prepared rack entries for the week', meta, accent: COLORS.purple })

  const areaSummary = []
  weekDays.forEach((day) => {
    const dayData = getDayData(day)
    areaDefs.forEach((area) => {
      const count = builderPool.filter((builder) => {
        const assignment = dayData.assignments[builder.id]
        if (!assignment) return false
        return (assignment.area || 'Unassigned') === area.name && ['Present', 'Training', 'Indirect'].includes(assignment.status || 'Present') && !builder.isLineLead
      }).length
      areaSummary.push({ day, area: area.name, count, capacity: area.capacity || '', note: area.note || '' })
    })
  })
  appendDataSheet(wb, 'Area Counts by Day', areaSummary, { title: 'Area Coverage by Day', subtitle: `${state.boardShift} · ${shiftWindow}`, meta, accent: COLORS.orange })

  writeWorkbook(wb, `weekly-staffing-board-${state.weekStartDate}.xlsx`, reportAdmin)
}
