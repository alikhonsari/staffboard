import * as XLSX from 'xlsx'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const ACTIVE_STATUSES = new Set(['Present', 'Training', 'Indirect'])
const SHIFT_HOURS = 8
const DEFAULT_RACK_WEIGHT = 6.4
const COLORS = {
  navy: '0F172A', blue: '2563EB', blueSoft: 'DBEAFE', green: '059669', greenSoft: 'D1FAE5',
  purple: '7C3AED', purpleSoft: 'EDE9FE', orange: 'D97706', orangeSoft: 'FEF3C7',
  red: 'DC2626', redSoft: 'FEE2E2', slate: '475569', line: 'CBD5E1', light: 'F8FAFC',
  white: 'FFFFFF', text: '172033', muted: '64748B',
}

const num = (value) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

const round = (value, digits = 2) => {
  const power = 10 ** digits
  return Math.round(num(value) * power) / power
}

const percentage = (done, goal) => {
  const target = num(goal)
  if (target <= 0) return num(done) > 0 ? 1 : 0
  return Math.max(0, num(done) / target)
}

const clean = (value) => String(value ?? '').trim()
const safeSheetName = (value) => String(value || 'Sheet').replace(/[\\/?*:[\]]/g, ' ').slice(0, 31)
const prettyHeader = (value) => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
const isActive = (status) => ACTIVE_STATUSES.has(status || 'Present')
const yesNo = (value) => value ? 'Yes' : 'No'

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

function setNumberFormat(ws, refs, format) {
  refs.forEach((ref) => {
    if (ws[ref]) ws[ref].z = format
  })
}

function setColumnNumberFormat(ws, startRow, endRow, columnIndex, format) {
  const refs = []
  for (let row = startRow; row <= endRow; row += 1) refs.push(XLSX.utils.encode_cell({ r: row, c: columnIndex }))
  setNumberFormat(ws, refs, format)
}

function autoWidths(aoa, caps = {}) {
  const count = Math.max(1, ...aoa.map((row) => row.length))
  return Array.from({ length: count }, (_, col) => {
    const longest = Math.max(8, ...aoa.map((row) => String(row[col] ?? '').length))
    const min = caps.min?.[col] ?? (col === 0 ? 16 : 10)
    const max = caps.max?.[col] ?? (col === 0 ? 34 : 42)
    return { wch: Math.min(Math.max(longest + 2, min), max) }
  })
}

function applyCommonSheetSettings(ws, options = {}) {
  ws['!freeze'] = options.freeze || { xSplit: 0, ySplit: 1 }
  ws['!margins'] = { left: 0.25, right: 0.25, top: 0.55, bottom: 0.55, header: 0.2, footer: 0.2 }
  ws['!pageSetup'] = { orientation: options.orientation || 'landscape', fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
  ws['!header'] = [{ left: '&BStaffBoard', center: options.header || '', right: '&D &T' }]
  ws['!footer'] = [{ left: 'Internal operations use', center: 'Page &P of &N', right: options.footer || '' }]
  if (options.autoFilter) ws['!autofilter'] = { ref: options.autoFilter }
}

function applyStructuredStyles(ws, config) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1')
  const titleRows = new Set(config.titleRows || [])
  const subtitleRows = new Set(config.subtitleRows || [])
  const sectionRows = new Set(config.sectionRows || [])
  const headerRows = new Set(config.headerRows || [])
  const accent = config.accent || COLORS.blue

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const ref = XLSX.utils.encode_cell({ r: row, c: col })
      if (!ws[ref]) continue
      const base = { alignment: { vertical: 'top', wrapText: true }, border: border('E2E8F0') }
      if (titleRows.has(row)) {
        styleCell(ws, ref, { ...base, font: { bold: true, color: { rgb: COLORS.white }, sz: 18 }, fill: { fgColor: { rgb: COLORS.navy } }, alignment: { vertical: 'center' }, border: border(COLORS.navy) })
      } else if (subtitleRows.has(row)) {
        styleCell(ws, ref, { ...base, font: { bold: true, color: { rgb: COLORS.slate }, sz: 11 }, fill: { fgColor: { rgb: COLORS.light } }, alignment: { vertical: 'center', wrapText: true } })
      } else if (sectionRows.has(row)) {
        styleCell(ws, ref, { ...base, font: { bold: true, color: { rgb: COLORS.white }, sz: 12 }, fill: { fgColor: { rgb: accent } }, alignment: { vertical: 'center' }, border: border(accent) })
      } else if (headerRows.has(row)) {
        styleCell(ws, ref, { ...base, font: { bold: true, color: { rgb: COLORS.white }, sz: 10 }, fill: { fgColor: { rgb: accent } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: border(accent) })
      } else {
        styleCell(ws, ref, { ...base, font: { color: { rgb: COLORS.text }, sz: 10 }, fill: { fgColor: { rgb: row % 2 === 0 ? COLORS.light : COLORS.white } } })
      }
    }
  }
}

function appendDashboardSheet(wb, name, config = {}) {
  const aoa = []
  const merges = []
  const titleRows = []
  const subtitleRows = []
  const sectionRows = []
  const headerRows = []
  const maxCols = Math.max(8, config.maxCols || 8)
  const pad = (row) => [...row, ...Array(Math.max(0, maxCols - row.length)).fill('')]

  titleRows.push(aoa.length)
  aoa.push([config.title || name])
  merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: maxCols - 1 } })
  subtitleRows.push(aoa.length)
  aoa.push([config.subtitle || 'StaffBoard operations report'])
  merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: maxCols - 1 } })
  aoa.push([])

  if (config.meta?.length) {
    sectionRows.push(aoa.length)
    aoa.push(['REPORT INFORMATION'])
    merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: maxCols - 1 } })
    for (let i = 0; i < config.meta.length; i += 2) {
      const left = config.meta[i] || ['', '']
      const right = config.meta[i + 1] || ['', '']
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
    const rows = section.rows?.length ? section.rows : [['No data available']]
    rows.forEach((row) => aoa.push(pad(row)))
  })

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = merges
  ws['!cols'] = config.cols || autoWidths(aoa, config.widthCaps || {})
  ws['!rows'] = aoa.map((row, index) => ({ hpt: titleRows.includes(index) ? 30 : subtitleRows.includes(index) ? 24 : row.some((value) => String(value || '').length > 70) ? 38 : 20 }))
  applyStructuredStyles(ws, { titleRows, subtitleRows, sectionRows, headerRows, accent: config.accent })
  applyCommonSheetSettings(ws, { freeze: { xSplit: 0, ySplit: 3 }, header: config.title || name, footer: config.footer || '' })
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName(name))
  return ws
}

function appendTableSheet(wb, name, rows, options = {}) {
  const safeRows = rows.length ? rows : [{ note: 'No data available' }]
  const keys = options.keys || Object.keys(safeRows[0])
  const headers = options.headers || keys.map(prettyHeader)
  const metaRows = options.meta || []
  const aoa = [[options.title || name], [options.subtitle || 'Detailed report data'], []]
  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, keys.length - 1) } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: Math.max(0, keys.length - 1) } },
  ]
  const titleRows = [0]
  const subtitleRows = [1]
  const sectionRows = []
  const headerRows = []

  if (metaRows.length) {
    sectionRows.push(aoa.length)
    aoa.push(['REPORT INFORMATION'])
    merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: Math.max(0, keys.length - 1) } })
    metaRows.forEach(([label, value]) => aoa.push([label, value]))
    aoa.push([])
  }

  sectionRows.push(aoa.length)
  aoa.push([options.sectionTitle || name.toUpperCase()])
  merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: Math.max(0, keys.length - 1) } })
  headerRows.push(aoa.length)
  const headerRowIndex = aoa.length
  aoa.push(headers)
  const dataStart = aoa.length
  safeRows.forEach((row) => aoa.push(keys.map((key) => row[key] ?? '')))
  const dataEnd = aoa.length - 1

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = merges
  ws['!cols'] = options.cols || autoWidths(aoa, options.widthCaps || {})
  ws['!rows'] = aoa.map((row, index) => ({ hpt: index === 0 ? 30 : index === 1 ? 24 : row.some((value) => String(value || '').length > 70) ? 38 : 20 }))
  applyStructuredStyles(ws, { titleRows, subtitleRows, sectionRows, headerRows, accent: options.accent || COLORS.blue })
  const filterRange = `${XLSX.utils.encode_cell({ r: headerRowIndex, c: 0 })}:${XLSX.utils.encode_cell({ r: Math.max(headerRowIndex, dataEnd), c: Math.max(0, keys.length - 1) })}`
  applyCommonSheetSettings(ws, { freeze: { xSplit: options.freezeColumns || 0, ySplit: headerRowIndex + 1 }, autoFilter: filterRange, header: options.title || name, footer: options.footer || '', orientation: options.orientation || 'landscape' })

  ;(options.formats || []).forEach(({ key, format }) => {
    const index = keys.indexOf(key)
    if (index >= 0) setColumnNumberFormat(ws, dataStart, dataEnd, index, format)
  })

  XLSX.utils.book_append_sheet(wb, ws, safeSheetName(name))
  return { ws, headerRowIndex, dataStart, dataEnd, keys }
}

function writeWorkbook(wb, filename, author) {
  wb.Props = {
    Title: filename.replace(/\.xlsx$/i, ''), Subject: 'StaffBoard Operations Report', Author: author || 'StaffBoard', Company: 'StaffBoard', CreatedDate: new Date(), Comments: 'Generated from StaffBoard server-authoritative operational data.',
  }
  wb.Workbook = wb.Workbook || {}
  wb.Workbook.Views = [{ RTL: false }]
  XLSX.writeFile(wb, filename, { bookType: 'xlsx', cellStyles: true, compression: true })
}

function isNightShift(label) {
  return String(label || '').toLowerCase().includes('night')
}

function dayDate(weekStartDate, day) {
  const date = new Date(`${weekStartDate}T00:00:00`)
  date.setDate(date.getDate() + Math.max(0, WEEKDAYS.indexOf(day)))
  return date
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
    const breakElapsed = now >= breakEnd ? 30 : now > breakStart ? (now - breakStart) / 60000 : 0
    const breakRemaining = now < breakStart ? 30 : now < breakEnd ? (breakEnd - now) / 60000 : 0
    worked = Math.max(0, (minutesSinceStart - breakElapsed) / 60)
    remaining = Math.max(0, (minutesToEnd - breakRemaining) / 60)
  }
  return { startLabel: timeLabel(start), endLabel: timeLabel(end), nowLabel: timeLabel(now), hoursWorked: round(Math.min(SHIFT_HOURS, worked)), remainingHours: round(Math.min(SHIFT_HOURS, remaining)), shiftHours: SHIFT_HOURS }
}

function skills(profile = {}) {
  return [
    profile.trainedTdr ? 'TDR' : '', profile.trainedForklift ? 'Forklift' : '', profile.trainedCenterRider ? 'Center Rider' : '', profile.trainedClampTruck ? 'Clamp Truck' : '', profile.trainedRackMover ? 'Rack Mover' : '', profile.trainedReachTruck ? 'Reach Truck' : '', profile.isTrainer ? 'Trainer' : '', profile.isSafetyMember ? 'Safety' : '', profile.isLineLead ? 'Line Lead' : '',
  ].filter(Boolean).join(', ')
}

function skillFlags(profile = {}) {
  return { tdr: !!profile.trainedTdr, forklift: !!profile.trainedForklift, center_rider: !!profile.trainedCenterRider, clamp_truck: !!profile.trainedClampTruck, rack_mover: !!profile.trainedRackMover, reach_truck: !!profile.trainedReachTruck, trainer: !!profile.isTrainer, safety: !!profile.isSafetyMember, line_lead: !!profile.isLineLead }
}

function statusCounts(dayData, builderPool = []) {
  const result = { assigned: 0, active: 0, present: 0, training: 0, indirect: 0, pto: 0, loa: 0, vto: 0, absent: 0, unassigned: 0, lineLeads: 0 }
  builderPool.forEach((builder) => {
    const assignment = dayData.assignments?.[builder.id]
    if (!assignment) return
    result.assigned += 1
    const status = assignment.status || 'Present'
    const key = status.toLowerCase()
    if (Object.prototype.hasOwnProperty.call(result, key)) result[key] += 1
    if (builder.isLineLead && isActive(status)) result.lineLeads += 1
    if (isActive(status) && (!builder.isLineLead || builder.countsAsProductionLabor)) {
      result.active += 1
      if ((assignment.area || 'Unassigned') === 'Unassigned') result.unassigned += 1
    }
  })
  return result
}

function opsMetrics(dayData, rackWeight = DEFAULT_RACK_WEIGHT, headcount = 0, shift = { remainingHours: 0 }) {
  const metrics = dayData.opsMetrics || {}
  const recoveryGoal = num(metrics.targetRackMediaRecovery)
  const recoveryProcessed = num(metrics.racksProcessed)
  const prepGoal = num(metrics.targetRackPrep)
  const racksPrepped = num(metrics.racksPrepped)
  const recoveredInPrep = num(metrics.recoveredRackPrep)
  const prepOutput = racksPrepped + recoveredInPrep
  const mediaGoal = num(metrics.totalMediaCount)
  const mediaProcessed = num(metrics.mediaProcessed)
  const totalWorkload = ((recoveryGoal + prepGoal) * rackWeight) + mediaGoal
  const completedWorkload = ((recoveryProcessed + prepOutput) * rackWeight) + mediaProcessed
  const remainingWork = Math.max(0, totalWorkload - completedWorkload)
  const targetTPH = headcount > 0 ? totalWorkload / (headcount * SHIFT_HOURS) : 0
  const requiredTPH = headcount > 0 && shift.remainingHours > 0 ? remainingWork / (headcount * shift.remainingHours) : 0
  return { recoveryGoal, recoveryProcessed, prepGoal, racksPrepped, recoveredInPrep, prepOutput, mediaGoal, mediaProcessed, totalWorkload, completedWorkload, remainingWork, targetTPH, requiredTPH, completion: percentage(completedWorkload, totalWorkload) }
}

function operationIdForBoard(boardId) {
  return clean(boardId).toLowerCase().replace(/_(day|night)$/, '')
}

function closureForDay(state, day) {
  const operationId = operationIdForBoard(state.currentBoardId || 'speed_day')
  const record = state.dayClosures?.[operationId]?.[state.weekStartDate]?.[day]
  if (!record) return null
  if (record.entireDay?.closed) return { ...record.entireDay, scope: 'Entire Day' }
  const slot = isNightShift(state.boardShift) ? record.nightShift : record.dayShift
  if (!slot?.closed) return null
  return { ...slot, scope: isNightShift(state.boardShift) ? 'Night Shift' : 'Day Shift' }
}

function closureLabel(closure) {
  if (!closure) return 'Open'
  const reason = closure.reason === 'Other' ? closure.customReason || 'Other' : closure.reason || 'Closed'
  return `${closure.scope} Closed — ${reason}`
}

function reportingAreaType(state, areaName) {
  const name = areaName || 'Unassigned'
  const explicit = (state.areaDefs || []).find((area) => area.name === name)?.areaType
  if (explicit) return explicit
  const normalized = clean(name).toLowerCase()
  if (!normalized || normalized === 'unassigned') return 'unassigned'
  if (normalized === 'fa' || normalized === 'fa metal removal') return 'labor_share'
  if (['shipping', 'eos pull racks', 'projects', 'learning', '1:1'].includes(normalized)) return 'support'
  return 'production'
}

function parseTime(value) {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})$/)
  return match ? Number(match[1]) + Number(match[2]) / 60 : null
}

function basicAssignmentHours(assignment = {}, boardShift = 'Day Shift') {
  const start = parseTime(assignment.clockInTime)
  const end = parseTime(assignment.leaveTime)
  const defaultStart = isNightShift(boardShift) ? 17 : 8
  if (start === null && end === null) return isActive(assignment.status) ? SHIFT_HOURS : 0
  const from = start === null ? defaultStart : start
  let to = end === null ? from + SHIFT_HOURS : end
  if (to < from) to += 24
  return Math.max(0, Math.min(SHIFT_HOURS, to - from))
}

function assignmentHours(assignment, day, weekStartDate, computeHoursForAssignment, boardShift) {
  if (!assignment || !isActive(assignment.status)) return 0
  if (typeof computeHoursForAssignment === 'function') {
    const areaHours = computeHoursForAssignment(assignment, day, weekStartDate) || {}
    return round(Object.values(areaHours).reduce((sum, value) => sum + num(value), 0))
  }
  return round(basicAssignmentHours(assignment, boardShift))
}

function staffRows(dayData, builders, context = {}) {
  return builders.filter((builder) => dayData.assignments?.[builder.id]).map((builder) => {
    const assignment = dayData.assignments[builder.id]
    const flags = skillFlags(builder)
    return {
      builder: builder.name, badge_type: builder.badgeType || 'day', status: assignment.status || 'Present', active: yesNo(isActive(assignment.status)), area: assignment.area || 'Unassigned', area_type: reportingAreaType(context.state || {}, assignment.area || 'Unassigned'), sub_area: assignment.subArea || '', role: assignment.role || '', line_lead: yesNo(builder.isLineLead), production_labor: yesNo(!builder.isLineLead || builder.countsAsProductionLabor), clock_in_time: assignment.clockInTime || '', clock_out_time: assignment.leaveTime || '', scheduled_clock_in: assignment.scheduledClockIn?.status === 'pending' ? assignment.scheduledClockIn.localTime || '' : '', scheduled_clock_out: assignment.scheduledClockOut?.status === 'pending' ? assignment.scheduledClockOut.localTime || '' : '', estimated_hours: assignmentHours(assignment, context.day, context.weekStartDate, context.computeHoursForAssignment, context.boardShift), skills_roles: skills(builder), tdr: yesNo(flags.tdr), forklift: yesNo(flags.forklift), center_rider: yesNo(flags.center_rider), clamp_truck: yesNo(flags.clamp_truck), rack_mover: yesNo(flags.rack_mover), reach_truck: yesNo(flags.reach_truck), trainer: yesNo(flags.trainer), safety: yesNo(flags.safety), comment: assignment.comment || '', builder_notes: assignment.builderNotes || '', updated_at: assignment.updatedAt || '',
    }
  }).sort((a, b) => String(a.area).localeCompare(String(b.area)) || String(a.builder).localeCompare(String(b.builder)))
}

function rackCategory(materialType, raw) {
  const value = `${materialType || ''} ${raw || ''}`.toLowerCase()
  if (/\bdecom\b/.test(value)) return 'Decom'
  if (/\bspeed\b/.test(value)) return 'SPEED'
  if (/\bmedia\b|\bnte\b|\be\s*&\s*o\b|\beo\b/.test(value)) return 'Media / NTE / E&O'
  return 'Other'
}

function parseRackList(text, day, listType) {
  return String(text || '').split(/\r?\n|,|;/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const parts = line.split(/\s+/)
    const materialType = parts.slice(1).join(' ') || 'Unspecified'
    return { day, list_type: listType, sequence: index + 1, rack_id: parts[0] || '', material_type: materialType, work_category: rackCategory(materialType, line), raw_entry: line }
  })
}

function rackRowsForDay(dayData, day) {
  return [...parseRackList(dayData.rackLists?.processed, day, 'Processed / Recovery'), ...parseRackList(dayData.rackLists?.prepped, day, 'Prepped / Rack Prep')]
}

function materialSummaryRows(racks) {
  const map = new Map()
  racks.forEach((rack) => {
    const key = `${rack.list_type}||${rack.work_category}||${rack.material_type}`
    const existing = map.get(key) || { list_type: rack.list_type, work_category: rack.work_category, material_type: rack.material_type, rack_count: 0 }
    existing.rack_count += 1
    map.set(key, existing)
  })
  return Array.from(map.values()).sort((a, b) => a.list_type.localeCompare(b.list_type) || a.work_category.localeCompare(b.work_category) || a.material_type.localeCompare(b.material_type))
}

function areaCoverageRows({ state, dayData, builderPool, areaDefs }) {
  const definitions = Array.isArray(areaDefs) && areaDefs.length ? areaDefs : state.areaDefs || []
  return definitions.map((area) => {
    const members = builderPool.filter((builder) => {
      const assignment = dayData.assignments?.[builder.id]
      return assignment && isActive(assignment.status) && (assignment.area || 'Unassigned') === area.name
    })
    const lineLeads = members.filter((builder) => builder.isLineLead).length
    const productionCount = members.filter((builder) => !builder.isLineLead || builder.countsAsProductionLabor).length
    const capacity = num(area.capacity)
    const utilization = capacity > 0 ? productionCount / capacity : null
    const status = capacity > 0 && productionCount > capacity ? 'Over Capacity' : area.name === 'Unassigned' && productionCount > 0 ? 'Needs Assignment' : productionCount === 0 ? 'Empty' : 'Covered'
    return { area: area.name, area_type: reportingAreaType(state, area.name), active_builders: members.length, production_hc: productionCount, line_leads: lineLeads, capacity: capacity || '', utilization_pct: utilization === null ? '' : utilization, coverage_status: status, tdr: members.filter((builder) => builder.trainedTdr).length, forklift: members.filter((builder) => builder.trainedForklift).length, center_rider: members.filter((builder) => builder.trainedCenterRider).length, clamp_truck: members.filter((builder) => builder.trainedClampTruck).length, rack_mover: members.filter((builder) => builder.trainedRackMover).length, reach_truck: members.filter((builder) => builder.trainedReachTruck).length, trainers: members.filter((builder) => builder.isTrainer).length, safety_members: members.filter((builder) => builder.isSafetyMember).length, note: area.note || '' }
  })
}

function skillCoverageRows(dayData, builderPool) {
  const active = builderPool.filter((builder) => {
    const assignment = dayData.assignments?.[builder.id]
    return assignment && isActive(assignment.status)
  })
  const definitions = [['TDR', 'trainedTdr'], ['Forklift', 'trainedForklift'], ['Center Rider', 'trainedCenterRider'], ['Clamp Truck', 'trainedClampTruck'], ['Rack Mover', 'trainedRackMover'], ['Reach Truck', 'trainedReachTruck'], ['Trainer', 'isTrainer'], ['Safety Member', 'isSafetyMember'], ['Line Lead', 'isLineLead']]
  return definitions.map(([skill, field]) => {
    const qualified = active.filter((builder) => builder[field])
    return { skill_role: skill, active_qualified: qualified.length, qualified_builders: qualified.map((builder) => builder.name).join(', '), coverage_status: qualified.length > 0 ? 'Covered' : 'No Active Coverage' }
  })
}

function laborShareRowsForDay({ state, dayData, builderPool, day, weekStartDate, computeHoursForAssignment }) {
  return builderPool.flatMap((builder) => {
    const assignment = dayData.assignments?.[builder.id]
    if (!assignment || !isActive(assignment.status) || reportingAreaType(state, assignment.area || 'Unassigned') !== 'labor_share') return []
    const movement = (dayData.movementLog || []).find((row) => row.builder === builder.name && (row.toArea || row.to || '') === assignment.area)
    return [{ day, builder: builder.name, line_lead: yesNo(builder.isLineLead), labor_share_area: assignment.area || 'Unassigned', status: assignment.status || 'Present', clock_in: assignment.clockInTime || '', clock_out: assignment.leaveTime || '', labor_share_hours: assignmentHours(assignment, day, weekStartDate, computeHoursForAssignment, state.boardShift), previous_production_area: assignment.previousProductionArea || movement?.previousProductionArea || '', moved_by: movement?.admin || 'System / Legacy' }]
  })
}

function laborAllocationSummary({ state, dayData, builderPool }) {
  const active = builderPool.filter((builder) => {
    const assignment = dayData.assignments?.[builder.id]
    return assignment && isActive(assignment.status)
  })
  const byType = (type) => active.filter((builder) => reportingAreaType(state, dayData.assignments[builder.id].area || 'Unassigned') === type)
  const productionHC = byType('production').filter((builder) => !builder.isLineLead || builder.countsAsProductionLabor).length
  const laborShare = byType('labor_share')
  return { totalShiftHC: active.length, productionHC, laborShareHC: laborShare.length, laborSharedLineLeads: laborShare.filter((builder) => builder.isLineLead).length, lineLeads: active.filter((builder) => builder.isLineLead).length, supportHC: byType('support').length, unassignedHC: byType('unassigned').length }
}

function normalizedSpeedLiteTeams(dayData = {}) {
  return (Array.isArray(dayData.speedLiteTeams) ? dayData.speedLiteTeams : []).filter((team) => team && team.id).map((team, index) => ({ id: String(team.id), name: String(team.name || `Team ${index + 1}`), targetSize: Math.max(1, Math.min(4, num(team.targetSize || 2))), teamLeadBuilderId: String(team.teamLeadBuilderId || '') }))
}

function reportingTeamStatus(target, active) {
  if (active <= 0) return 'Empty'
  if (active < target) return `Needs ${target - active}`
  if (active === target) return 'Complete'
  return 'Over Target'
}

function speedLiteTeamRowsForDay({ dayData, builderPool, day, weekStartDate, computeHoursForAssignment, boardShift }) {
  const teams = normalizedSpeedLiteTeams(dayData)
  const assignments = dayData.assignments || {}
  const teamRows = []
  const memberRows = []
  const validIds = new Set(teams.map((team) => team.id))
  teams.forEach((team) => {
    const members = builderPool.filter((builder) => {
      const assignment = assignments[builder.id]
      return assignment && assignment.area === 'Speed Lite' && String(assignment.speedLiteTeamId || '') === team.id
    })
    const activeMembers = members.filter((builder) => isActive(assignments[builder.id]?.status))
    const lead = members.find((builder) => builder.id === team.teamLeadBuilderId)
    let teamHours = 0
    members.forEach((builder) => {
      const assignment = assignments[builder.id]
      const hours = assignmentHours(assignment, day, weekStartDate, computeHoursForAssignment, boardShift)
      teamHours += hours
      memberRows.push({ day, team: team.name, builder: builder.name, team_lead: yesNo(builder.id === team.teamLeadBuilderId), permanent_line_lead: yesNo(builder.isLineLead), status: assignment.status || 'Present', clock_in: assignment.clockInTime || '', clock_out: assignment.leaveTime || '', team_hours: round(hours) })
    })
    teamRows.push({ day, team: team.name, target_size: team.targetSize, active_builders: activeMembers.length, assigned_builders: members.length, staffing_variance: activeMembers.length - team.targetSize, status: reportingTeamStatus(team.targetSize, activeMembers.length), team_lead: lead?.name || '', builders: members.map((builder) => builder.name).join(', '), team_hours: round(teamHours) })
  })
  const ungrouped = builderPool.filter((builder) => {
    const assignment = assignments[builder.id]
    return assignment && assignment.area === 'Speed Lite' && !validIds.has(String(assignment.speedLiteTeamId || ''))
  })
  if (ungrouped.length || teams.length) teamRows.push({ day, team: 'Ungrouped', target_size: '', active_builders: ungrouped.filter((builder) => isActive(assignments[builder.id]?.status)).length, assigned_builders: ungrouped.length, staffing_variance: '', status: ungrouped.length ? 'Needs Grouping' : 'Clear', team_lead: '', builders: ungrouped.map((builder) => builder.name).join(', '), team_hours: '' })
  return { teamRows, memberRows }
}

function dataQualityRows({ state, dayData, builderPool, areaCoverage, racks, day, closure }) {
  const rows = []
  const add = (severity, category, issue, affected, recommendedAction) => rows.push({ severity, category, issue, affected, recommended_action: recommendedAction })
  if (closure) add('Info', 'Closure', closureLabel(closure), day, 'No action required unless the day should be reopened.')
  const activeAssignments = builderPool.flatMap((builder) => {
    const assignment = dayData.assignments?.[builder.id]
    return assignment && isActive(assignment.status) ? [{ builder, assignment }] : []
  })
  const unassigned = activeAssignments.filter(({ assignment, builder }) => (assignment.area || 'Unassigned') === 'Unassigned' && (!builder.isLineLead || builder.countsAsProductionLabor))
  if (unassigned.length) add('High', 'Staffing', 'Active builders are unassigned.', unassigned.map(({ builder }) => builder.name).join(', '), 'Assign each active builder to an operating area.')
  areaCoverage.filter((row) => row.coverage_status === 'Over Capacity').forEach((row) => add('Warning', 'Capacity', `${row.area} exceeds configured capacity.`, `${row.production_hc} of ${row.capacity}`, 'Move labor or update the area capacity if the configuration is outdated.'))
  if (activeAssignments.length && !activeAssignments.some(({ builder }) => builder.isLineLead)) add('Warning', 'Leadership', 'No active Line Lead is recorded.', day, 'Assign or confirm Line Lead coverage.')
  const missingClock = activeAssignments.filter(({ assignment }) => !assignment.clockInTime || !assignment.leaveTime)
  if (missingClock.length) add('Info', 'Attendance', 'Active assignments have incomplete clock times.', missingClock.map(({ builder }) => builder.name).join(', '), 'Confirm clock-in and clock-out times before final reporting.')
  const duplicateRacks = racks.reduce((map, rack) => map.set(rack.rack_id, (map.get(rack.rack_id) || 0) + 1), new Map())
  const duplicateIds = Array.from(duplicateRacks.entries()).filter(([id, count]) => id && count > 1).map(([id]) => id)
  if (duplicateIds.length) add('Warning', 'Rack Data', 'Duplicate rack IDs appear in the export.', duplicateIds.join(', '), 'Verify whether each duplicate represents a legitimate repeated handling event.')
  const unspecified = racks.filter((rack) => rack.material_type === 'Unspecified')
  if (unspecified.length) add('Info', 'Rack Data', 'Rack entries are missing material types.', unspecified.map((rack) => rack.rack_id).join(', '), 'Add material type after each rack ID.')
  if (!rows.length) add('Clear', 'Data Quality', 'No report exceptions detected.', day, 'Continue normal operation.')
  return rows
}

function weeklyHoursRows({ weekDays, getDayData, builderPool, computeHoursForAssignment, weekStartDate, boardShift }) {
  const detailed = []
  const areaTotals = new Map()
  const builderTotals = new Map()
  const baseSummary = (builder) => ({ builder: builder.name, badge_type: builder.badgeType || 'day', skills_roles: skills(builder), days_with_assignment: 0, active_days: 0, total_week_hours: 0, unique_areas: new Set(), present_days: 0, training_days: 0, indirect_days: 0, pto_days: 0, loa_days: 0, vto_days: 0, absent_days: 0 })
  builderPool.forEach((builder) => {
    weekDays.forEach((day) => {
      const assignment = getDayData(day).assignments?.[builder.id]
      if (!assignment) return
      let areas = {}
      if (typeof computeHoursForAssignment === 'function') areas = computeHoursForAssignment(assignment, day, weekStartDate) || {}
      else if (isActive(assignment.status)) areas = { [assignment.area || 'Unassigned']: basicAssignmentHours(assignment, boardShift) }
      Object.entries(areas).forEach(([area, hours]) => {
        const h = round(hours)
        if (h <= 0) return
        detailed.push({ builder: builder.name, day, area, hours: h })
        const areaKey = `${builder.id}||${area}`
        const areaRow = areaTotals.get(areaKey) || { builder: builder.name, badge_type: builder.badgeType || 'day', skills_roles: skills(builder), area, total_week_hours: 0 }
        areaRow.total_week_hours += h
        areaTotals.set(areaKey, areaRow)
        const summary = builderTotals.get(builder.id) || baseSummary(builder)
        summary.total_week_hours += h
        summary.unique_areas.add(area)
        builderTotals.set(builder.id, summary)
      })
      const summary = builderTotals.get(builder.id) || baseSummary(builder)
      summary.days_with_assignment += 1
      const status = (assignment.status || 'Present').toLowerCase().replace(/\s+/g, '_')
      if (isActive(assignment.status)) summary.active_days += 1
      if (Object.prototype.hasOwnProperty.call(summary, `${status}_days`)) summary[`${status}_days`] += 1
      builderTotals.set(builder.id, summary)
    })
  })
  return {
    detailed: detailed.sort((a, b) => a.builder.localeCompare(b.builder) || WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day) || a.area.localeCompare(b.area)),
    areaTotals: Array.from(areaTotals.values()).map((row) => ({ ...row, total_week_hours: round(row.total_week_hours) })).sort((a, b) => a.builder.localeCompare(b.builder) || a.area.localeCompare(b.area)),
    builderTotals: Array.from(builderTotals.values()).map((row) => ({ ...row, total_week_hours: round(row.total_week_hours), unique_area_count: row.unique_areas.size, areas_worked: Array.from(row.unique_areas).sort().join(', '), unique_areas: undefined })).sort((a, b) => b.total_week_hours - a.total_week_hours || a.builder.localeCompare(b.builder)),
  }
}

function dailySummaryRow({ state, day, dayData, builderPool, rackWeight, areaDefs }) {
  const closure = closureForDay(state, day)
  const shift = shiftInfo(day, state.weekStartDate, state.boardShift)
  const counts = statusCounts(dayData, builderPool)
  const allocation = laborAllocationSummary({ state, dayData, builderPool })
  const tphHeadcount = String(state.currentBoardId || '').startsWith('speed_') ? allocation.productionHC : counts.active
  const ops = opsMetrics(dayData, rackWeight, tphHeadcount, shift)
  const racks = rackRowsForDay(dayData, day)
  const coverage = areaCoverageRows({ state, dayData, builderPool, areaDefs })
  return { day, operating_status: closureLabel(closure), shift_window: `${shift.startLabel} - ${shift.endLabel}`, assigned_hc: counts.assigned, active_hc: counts.active, production_hc: allocation.productionHC, labor_share_hc: allocation.laborShareHC, support_hc: allocation.supportHC, line_leads: allocation.lineLeads, unassigned_hc: allocation.unassignedHC, present: counts.present, training: counts.training, indirect: counts.indirect, pto: counts.pto, loa: counts.loa, vto: counts.vto, absent: counts.absent, recovery_goal: ops.recoveryGoal, recovery_done: ops.recoveryProcessed, prep_goal: ops.prepGoal, prep_done: ops.prepOutput, media_goal: ops.mediaGoal, media_done: ops.mediaProcessed, goal_work: round(ops.totalWorkload), completed_work: round(ops.completedWorkload), remaining_work: round(ops.remainingWork), completion_pct: ops.completion, target_tph: round(ops.targetTPH), required_tph: round(ops.requiredTPH), rack_entries: racks.length, over_capacity_areas: coverage.filter((row) => row.coverage_status === 'Over Capacity').length, updated_at: dayData.updatedAt || '', excluded_from_weekly_performance: closure ? 'Yes' : 'No' }
}

function reportMeta({ state, admin, day, shift, closure }) {
  const entries = [['Board ID', state.currentBoardId || 'unknown'], ['Board', state.boardTitle || 'StaffBoard'], ['Shift', state.boardShift || ''], ['Shift Window', `${shift.startLabel} - ${shift.endLabel}`], ['Week Start', state.weekStartDate || ''], ['Generated By', admin], ['Generated', new Date().toLocaleString()], ['State Revision', num(state.stateRevision)]]
  if (day) entries.splice(4, 0, ['Operational Day', day])
  if (closure) entries.push(['Operating Status', closureLabel(closure)])
  return entries
}

function appendGuideSheet(wb, reportType) {
  const rows = [
    { section: 'Purpose', guidance: `${reportType} workbook for operational review, staffing validation, production performance, and audit support.` },
    { section: 'Dashboard', guidance: 'Start with the first sheet. It summarizes headcount, workload completion, TPH, staffing risk, and exceptions.' },
    { section: 'Filters', guidance: 'Detailed sheets include filters. Use the header drop-downs to narrow by builder, area, status, day, material type, or severity.' },
    { section: 'Percentages', guidance: 'Completion is Completed Work divided by Goal Work. Area utilization is Production HC divided by configured capacity.' },
    { section: 'Closed Days', guidance: 'Closed shifts are labeled and should be excluded from performance averages rather than treated as zero performance.' },
    { section: 'Hours', guidance: 'Hours use StaffBoard area history when available. Otherwise they use clock-in/clock-out times capped at eight paid hours.' },
    { section: 'Rack Categories', guidance: 'Rack entries retain the original material text and receive a reporting category: Decom, SPEED, Media/NTE/E&O, or Other.' },
    { section: 'Data Quality', guidance: 'Review the Data Quality sheet before sharing the workbook. It identifies unassigned labor, capacity issues, missing time data, duplicate racks, and other exceptions.' },
    { section: 'Privacy', guidance: 'This workbook may include employee names and operational data. Store and share it only through approved internal channels.' },
  ]
  appendTableSheet(wb, 'Report Guide', rows, { title: `${reportType} Report Guide`, subtitle: 'How to interpret and review this workbook', accent: COLORS.slate, widthCaps: { max: { 0: 24, 1: 90 } } })
}

export function buildDailyWorkbook({ state, dayState, metrics = {}, counts = {}, areaCounts = [], totalHeadCount = 0, rackWeight = DEFAULT_RACK_WEIGHT, getAssignment, activeBuilders = [], selectedDay, adminName, computeHoursForAssignment }) {
  const wb = XLSX.utils.book_new()
  const reportAdmin = adminName || state.adminName || state.boardLead || 'Not set'
  const shift = shiftInfo(selectedDay, state.weekStartDate, state.boardShift)
  const closure = closureForDay(state, selectedDay)
  const builderPool = state.builderPool || activeBuilders
  const currentCounts = statusCounts(dayState, builderPool)
  const allocation = laborAllocationSummary({ state, dayData: dayState, builderPool })
  const reportTPHHeadcount = String(state.currentBoardId || '').startsWith('speed_') ? allocation.productionHC : (currentCounts.active || totalHeadCount)
  const calc = { ...opsMetrics(dayState, rackWeight, reportTPHHeadcount, shift), ...metrics }
  const staff = staffRows(dayState, builderPool, { state, day: selectedDay, weekStartDate: state.weekStartDate, computeHoursForAssignment, boardShift: state.boardShift })
  const racks = rackRowsForDay(dayState, selectedDay)
  const areaCoverage = areaCoverageRows({ state, dayData: dayState, builderPool, areaDefs: state.areaDefs || areaCounts })
  const skillsCoverage = skillCoverageRows(dayState, builderPool)
  const laborRows = laborShareRowsForDay({ state, dayData: dayState, builderPool, day: selectedDay, weekStartDate: state.weekStartDate, computeHoursForAssignment })
  const speedLite = speedLiteTeamRowsForDay({ dayData: dayState, builderPool, day: selectedDay, weekStartDate: state.weekStartDate, computeHoursForAssignment, boardShift: state.boardShift })
  const qualityRows = dataQualityRows({ state, dayData: dayState, builderPool, areaCoverage, racks, day: selectedDay, closure })
  const meta = reportMeta({ state, admin: reportAdmin, day: selectedDay, shift, closure })

  const dashboard = appendDashboardSheet(wb, 'Daily Dashboard', {
    title: `Daily Operations Report — ${selectedDay}`,
    subtitle: `${state.boardTitle} · ${state.boardShift} · ${shift.startLabel} - ${shift.endLabel}`,
    meta,
    accent: COLORS.blue,
    sections: [
      { title: 'EXECUTIVE KPI SNAPSHOT', headers: ['Metric', 'Value', 'Metric', 'Value', 'Metric', 'Value', 'Metric', 'Value'], rows: [[
        'Operating Status', closureLabel(closure), 'Completion', percentage(calc.completedWorkload ?? calc.weightedCompleted, calc.totalWorkload ?? calc.weightedTarget), 'Production HC', allocation.productionHC, 'Required TPH', round(calc.requiredTPH),
      ], [
        'Total Shift HC', allocation.totalShiftHC, 'Unassigned HC', allocation.unassignedHC, 'Labor Share HC', allocation.laborShareHC, 'Hours Remaining', shift.remainingHours,
      ], [
        'Goal Work', round(calc.totalWorkload ?? calc.weightedTarget), 'Completed Work', round(calc.completedWorkload ?? calc.weightedCompleted), 'Remaining Work', round(calc.remainingWork), 'Target TPH', round(calc.targetTPH),
      ]] },
      { title: 'HEADCOUNT AND ATTENDANCE', headers: ['Metric', 'Value', 'Metric', 'Value', 'Metric', 'Value', 'Metric', 'Value'], rows: [[
        'Assigned', currentCounts.assigned || counts.assigned || 0, 'Present', currentCounts.present || counts.present || 0, 'Training', currentCounts.training || counts.training || 0, 'Indirect', currentCounts.indirect || counts.indirect || 0,
      ], [
        'PTO', currentCounts.pto || counts.pto || 0, 'LOA', currentCounts.loa || counts.loa || 0, 'VTO', currentCounts.vto || counts.vto || 0, 'Absent', currentCounts.absent || counts.absent || 0,
      ], [
        'Line Leads', allocation.lineLeads, 'Support HC', allocation.supportHC, 'Labor-Shared Line Leads', allocation.laborSharedLineLeads, 'Roster Size', builderPool.length,
      ]] },
      { title: 'OPERATIONS PERFORMANCE', headers: ['Workstream', 'Goal', 'Completed', 'Remaining', 'Completion %', 'Notes', '', ''], rows: [[
        'Recovery', calc.recoveryGoal, calc.recoveryProcessed, Math.max(0, calc.recoveryGoal - calc.recoveryProcessed), percentage(calc.recoveryProcessed, calc.recoveryGoal), '', '', '',
      ], [
        'Rack Prep', calc.rackPrepGoal ?? calc.prepGoal, calc.rackPrepOutput ?? calc.prepOutput, Math.max(0, (calc.rackPrepGoal ?? calc.prepGoal) - (calc.rackPrepOutput ?? calc.prepOutput)), percentage(calc.rackPrepOutput ?? calc.prepOutput, calc.rackPrepGoal ?? calc.prepGoal), 'Includes recovered racks completed in Rack Prep', '', '',
      ], [
        'Media', calc.mediaGoal, calc.mediaProcessed, Math.max(0, calc.mediaGoal - calc.mediaProcessed), percentage(calc.mediaProcessed, calc.mediaGoal), '', '', '',
      ]] },
      { title: 'TOP REPORT EXCEPTIONS', headers: ['Severity', 'Category', 'Issue', 'Affected', 'Recommended Action', '', '', ''], rows: qualityRows.slice(0, 6).map((row) => [row.severity, row.category, row.issue, row.affected, row.recommended_action, '', '', ']) },
    ],
  })
  const dashboardRange = XLSX.utils.decode_range(dashboard['!ref'])
  for (let row = dashboardRange.s.r; row <= dashboardRange.e.r; row += 1) {
    for (let col = dashboardRange.s.c; col <= dashboardRange.e.c; col += 1) {
      const ref = XLSX.utils.encode_cell({ r: row, c: col })
      const cell = dashboard[ref]
      if (cell?.t === 'n' && cell.v >= 0 && cell.v <= 1 && [3, 4].includes(col)) cell.z = '0.0%'
    }
  }

  appendTableSheet(wb, 'Staff Assignments', staff, { title: `${selectedDay} Staff Assignments`, subtitle: `${state.boardShift} · ${shift.startLabel} - ${shift.endLabel}`, meta, accent: COLORS.blue, freezeColumns: 2, formats: [{ key: 'estimated_hours', format: '0.00' }], widthCaps: { max: { 0: 28, 1: 12, 2: 12, 4: 26, 14: 42, 24: 46, 25: 46 } } })
  appendTableSheet(wb, 'Area Coverage', areaCoverage, { title: `${selectedDay} Area Coverage`, subtitle: 'Headcount, capacity, utilization, leadership, and skill coverage by area', meta, accent: COLORS.orange, formats: [{ key: 'utilization_pct', format: '0.0%' }], widthCaps: { max: { 0: 30, 17: 60 } } })
  appendTableSheet(wb, 'Skill Coverage', skillsCoverage, { title: `${selectedDay} Skill and Role Coverage`, subtitle: 'Active qualified builders by certification or leadership role', meta, accent: COLORS.green, widthCaps: { max: { 1: 18, 2: 80, 3: 24 } } })
  appendTableSheet(wb, 'Rack Detail', racks, { title: `${selectedDay} Rack IDs and Materials`, subtitle: 'Processed and prepared rack entries with reporting categories', meta, accent: COLORS.purple, freezeColumns: 2, widthCaps: { max: { 3: 34, 4: 26, 5: 60 } } })
  appendTableSheet(wb, 'Material Summary', materialSummaryRows(racks), { title: `${selectedDay} Material Summary`, subtitle: 'Rack counts summarized by list, category, and material type', meta, accent: COLORS.purple })
  appendTableSheet(wb, 'Movement History', (dayState.movementLog || []).map((item) => ({ timestamp: item.timestamp || '', admin: item.admin || '', builder: item.builder || '', from: item.from || item.fromArea || '', to: item.to || item.toArea || '', action: item.action || '', note: item.note || item.notes || '' })), { title: `${selectedDay} Movement History`, meta, accent: COLORS.orange })
  appendTableSheet(wb, 'Attendance History', (dayState.attendanceLog || []).map((item) => ({ timestamp: item.timestamp || '', clock_time: item.clock_time || '', builder: item.builder || '', event: item.event || '', note: item.note || '' })), { title: `${selectedDay} Attendance History`, meta, accent: COLORS.red })
  appendTableSheet(wb, 'Labor Share', laborRows, { title: `${selectedDay} Labor Share Detail`, subtitle: 'Labor-share builders and hours excluded from SPEED Production HC', meta, accent: COLORS.orange, formats: [{ key: 'labor_share_hours', format: '0.00' }] })
  appendTableSheet(wb, 'Speed Lite Teams', speedLite.teamRows, { title: `${selectedDay} Speed Lite Team Summary`, subtitle: 'Targets, staffing variance, team leads, membership, and hours', meta, accent: COLORS.green, formats: [{ key: 'team_hours', format: '0.00' }] })
  appendTableSheet(wb, 'Speed Lite Members', speedLite.memberRows, { title: `${selectedDay} Speed Lite Members`, subtitle: 'Builder-level team assignment and hours', meta, accent: COLORS.green, formats: [{ key: 'team_hours', format: '0.00' }] })
  appendTableSheet(wb, 'Data Quality', qualityRows, { title: `${selectedDay} Data Quality and Exceptions`, subtitle: 'Review and resolve before sharing the report', meta, accent: COLORS.red, widthCaps: { max: { 2: 62, 3: 62, 4: 72 } } })
  appendGuideSheet(wb, 'Daily')
  return wb
}

export function exportEndOfShiftExcel(args) {
  const wb = buildDailyWorkbook(args)
  const { state, selectedDay, adminName } = args
  const reportAdmin = adminName || state.adminName || state.boardLead || 'Not set'
  writeWorkbook(wb, `daily-operations-${state.currentBoardId || 'board'}-${state.weekStartDate}-${selectedDay}.xlsx`, reportAdmin)
}

export function buildWeeklyWorkbook({ state, weekDays = WEEKDAYS, getDayData, builderPool = [], computeHoursForAssignment, areaDefs = [], adminName }) {
  const wb = XLSX.utils.book_new()
  const reportAdmin = adminName || state.adminName || state.boardLead || 'Not set'
  const mondayShift = shiftInfo('Monday', state.weekStartDate, state.boardShift)
  const shiftWindow = `${mondayShift.startLabel} - ${mondayShift.endLabel}`
  const dailySummary = weekDays.map((day) => dailySummaryRow({ state, day, dayData: getDayData(day), builderPool, rackWeight: DEFAULT_RACK_WEIGHT, areaDefs }))
  const openDays = dailySummary.filter((row) => row.excluded_from_weekly_performance !== 'Yes')
  const sum = (key, rows = dailySummary) => rows.reduce((total, row) => total + num(row[key]), 0)
  const average = (key, rows = openDays) => rows.length ? sum(key, rows) / rows.length : 0
  const weeklyHours = weeklyHoursRows({ weekDays, getDayData, builderPool, computeHoursForAssignment, weekStartDate: state.weekStartDate, boardShift: state.boardShift })
  const allRacks = weekDays.flatMap((day) => rackRowsForDay(getDayData(day), day))
  const allLabor = weekDays.flatMap((day) => laborShareRowsForDay({ state, dayData: getDayData(day), builderPool, day, weekStartDate: state.weekStartDate, computeHoursForAssignment }))
  const speedLiteByDay = weekDays.map((day) => speedLiteTeamRowsForDay({ dayData: getDayData(day), builderPool, day, weekStartDate: state.weekStartDate, computeHoursForAssignment, boardShift: state.boardShift }))
  const allSpeedTeams = speedLiteByDay.flatMap((entry) => entry.teamRows)
  const allSpeedMembers = speedLiteByDay.flatMap((entry) => entry.memberRows)
  const dailyCoverage = weekDays.flatMap((day) => areaCoverageRows({ state, dayData: getDayData(day), builderPool, areaDefs }).map((row) => ({ day, ...row })))
  const areaRollupMap = new Map()
  dailyCoverage.forEach((row) => {
    const current = areaRollupMap.get(row.area) || { area: row.area, area_type: row.area_type, days_reported: 0, total_active: 0, total_production_hc: 0, min_production_hc: Number.POSITIVE_INFINITY, max_production_hc: 0, capacity: row.capacity, over_capacity_days: 0, empty_days: 0, unassigned_days: 0 }
    current.days_reported += 1
    current.total_active += num(row.active_builders)
    current.total_production_hc += num(row.production_hc)
    current.min_production_hc = Math.min(current.min_production_hc, num(row.production_hc))
    current.max_production_hc = Math.max(current.max_production_hc, num(row.production_hc))
    current.over_capacity_days += row.coverage_status === 'Over Capacity' ? 1 : 0
    current.empty_days += row.coverage_status === 'Empty' ? 1 : 0
    current.unassigned_days += row.coverage_status === 'Needs Assignment' ? 1 : 0
    areaRollupMap.set(row.area, current)
  })
  const areaRollup = Array.from(areaRollupMap.values()).map((row) => ({ ...row, avg_active_builders: round(row.total_active / Math.max(1, row.days_reported)), avg_production_hc: round(row.total_production_hc / Math.max(1, row.days_reported)), avg_utilization_pct: num(row.capacity) > 0 ? row.total_production_hc / (num(row.capacity) * Math.max(1, row.days_reported)) : '', min_production_hc: Number.isFinite(row.min_production_hc) ? row.min_production_hc : 0, total_active: undefined, total_production_hc: undefined })).sort((a, b) => a.area.localeCompare(b.area))
  const weeklySkillRows = weekDays.flatMap((day) => skillCoverageRows(getDayData(day), builderPool).map((row) => ({ day, ...row })))
  const weeklyQuality = weekDays.flatMap((day) => {
    const dayData = getDayData(day)
    const coverage = areaCoverageRows({ state, dayData, builderPool, areaDefs })
    const racks = rackRowsForDay(dayData, day)
    return dataQualityRows({ state, dayData, builderPool, areaCoverage: coverage, racks, day, closure: closureForDay(state, day) }).map((row) => ({ day, ...row }))
  })

  const meta = [['Board ID', state.currentBoardId || 'unknown'], ['Board', state.boardTitle || 'StaffBoard'], ['Shift', state.boardShift || ''], ['Shift Window', shiftWindow], ['Week Start', state.weekStartDate || ''], ['Days Included', weekDays.join(', ')], ['Generated By', reportAdmin], ['Generated', new Date().toLocaleString()], ['State Revision', num(state.stateRevision)], ['Roster Size', builderPool.length]]

  const dashboard = appendDashboardSheet(wb, 'Weekly Dashboard', {
    title: 'Weekly Executive Operations Report', subtitle: `${state.boardTitle} · ${state.boardShift} · ${shiftWindow}`, meta, accent: COLORS.blue,
    sections: [
      { title: 'WEEKLY KPI SNAPSHOT', headers: ['Metric', 'Value', 'Metric', 'Value', 'Metric', 'Value', 'Metric', 'Value'], rows: [[
        'Open Days', openDays.length, 'Closed Days', dailySummary.length - openDays.length, 'Completion', percentage(sum('completed_work', openDays), sum('goal_work', openDays)), 'Staffed Hours', round(weeklyHours.builderTotals.reduce((total, row) => total + num(row.total_week_hours), 0)),
      ], [
        'Goal Work', round(sum('goal_work', openDays)), 'Completed Work', round(sum('completed_work', openDays)), 'Remaining Work', round(sum('remaining_work', openDays)), 'Average Active HC', round(average('active_hc')),
      ], [
        'Recovery Completed', sum('recovery_done'), 'Rack Prep Completed', sum('prep_done'), 'Media Completed', sum('media_done'), 'Rack Entries', allRacks.length,
      ], [
        'Average Production HC', round(average('production_hc')), 'Labor Share Hours', round(allLabor.reduce((total, row) => total + num(row.labor_share_hours), 0)), 'Unassigned HC-Days', sum('unassigned_hc'), 'Exception Count', weeklyQuality.filter((row) => row.severity !== 'Clear' && row.severity !== 'Info').length,
      ]] },
      { title: 'DAILY PERFORMANCE', headers: ['Day', 'Status', 'Production HC', 'Goal Work', 'Completed Work', 'Completion %', 'Required TPH', 'Unassigned HC'], rows: dailySummary.map((row) => [row.day, row.operating_status, row.production_hc, row.goal_work, row.completed_work, row.completion_pct, row.required_tph, row.unassigned_hc]) },
      { title: 'TOP WEEKLY EXCEPTIONS', headers: ['Day', 'Severity', 'Category', 'Issue', 'Affected', 'Recommended Action', '', ''], rows: weeklyQuality.filter((row) => row.severity !== 'Clear').slice(0, 10).map((row) => [row.day, row.severity, row.category, row.issue, row.affected, row.recommended_action, '', '']) },
    ],
  })
  const dashboardRange = XLSX.utils.decode_range(dashboard['!ref'])
  for (let row = dashboardRange.s.r; row <= dashboardRange.e.r; row += 1) {
    for (let col = dashboardRange.s.c; col <= dashboardRange.e.c; col += 1) {
      const ref = XLSX.utils.encode_cell({ r: row, c: col })
      const cell = dashboard[ref]
      if (cell?.t === 'n' && cell.v >= 0 && cell.v <= 1 && [3, 5].includes(col)) cell.z = '0.0%'
    }
  }

  appendTableSheet(wb, 'Daily Summary', dailySummary, { title: 'Daily Performance and Staffing Summary', subtitle: `${state.boardShift} · ${shiftWindow}`, meta, accent: COLORS.blue, freezeColumns: 2, formats: [{ key: 'completion_pct', format: '0.0%' }, { key: 'target_tph', format: '0.00' }, { key: 'required_tph', format: '0.00' }, { key: 'goal_work', format: '0.00' }, { key: 'completed_work', format: '0.00' }, { key: 'remaining_work', format: '0.00' }], widthCaps: { max: { 0: 12, 1: 36, 2: 22, 31: 28 } } })
  appendTableSheet(wb, 'Builder Weekly Summary', weeklyHours.builderTotals, { title: 'Builder Weekly Summary', subtitle: 'Total hours, active days, status days, and area rotation for each builder', meta, accent: COLORS.green, freezeColumns: 2, formats: [{ key: 'total_week_hours', format: '0.00' }], widthCaps: { max: { 0: 30, 2: 52, 15: 70 } } })

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
  appendTableSheet(wb, 'Weekly Staff Matrix', matrixRows, { title: 'Weekly Staff Matrix', subtitle: `${state.boardShift} · ${shiftWindow}`, meta, accent: COLORS.blue, freezeColumns: 3 })
  appendTableSheet(wb, 'Builder Hours by Area', weeklyHours.areaTotals, { title: 'Builder Hours by Area — Whole Week', subtitle: 'Total weekly hours for each builder in each area', meta, accent: COLORS.green, formats: [{ key: 'total_week_hours', format: '0.00' }], freezeColumns: 2 })
  appendTableSheet(wb, 'Builder Hours Detail', weeklyHours.detailed, { title: 'Builder Hours Detail', subtitle: 'Builder hours by day and area', meta, accent: COLORS.green, formats: [{ key: 'hours', format: '0.00' }], freezeColumns: 2 })
  appendTableSheet(wb, 'Area Coverage by Day', dailyCoverage, { title: 'Area Coverage by Day', subtitle: 'Daily headcount, capacity, utilization, leadership, and skills by area', meta, accent: COLORS.orange, formats: [{ key: 'utilization_pct', format: '0.0%' }], freezeColumns: 2 })
  appendTableSheet(wb, 'Area Weekly Summary', areaRollup, { title: 'Area Weekly Summary', subtitle: 'Average, minimum, maximum, and exception days by area', meta, accent: COLORS.orange, formats: [{ key: 'avg_utilization_pct', format: '0.0%' }], freezeColumns: 2 })
  appendTableSheet(wb, 'Skill Coverage', weeklySkillRows, { title: 'Weekly Skill and Role Coverage', subtitle: 'Active qualified coverage by day', meta, accent: COLORS.green, widthCaps: { max: { 3: 80 } }, freezeColumns: 2 })
  appendTableSheet(wb, 'Rack Detail', allRacks, { title: 'Weekly Rack IDs and Materials', subtitle: 'All processed and prepared rack entries', meta, accent: COLORS.purple, freezeColumns: 2 })
  appendTableSheet(wb, 'Material Summary', materialSummaryRows(allRacks), { title: 'Weekly Material Summary', subtitle: 'Rack counts by list, category, and material type', meta, accent: COLORS.purple })
  appendTableSheet(wb, 'Weekly Labor Share', allLabor, { title: 'Weekly Labor Share Detail', subtitle: 'Labor-share hours by day, builder, and area', meta, accent: COLORS.orange, formats: [{ key: 'labor_share_hours', format: '0.00' }], freezeColumns: 2 })
  appendTableSheet(wb, 'Speed Lite Teams', allSpeedTeams, { title: 'Weekly Speed Lite Team Summary', subtitle: 'Targets, staffing variance, leads, membership, and hours by day', meta, accent: COLORS.green, formats: [{ key: 'team_hours', format: '0.00' }], freezeColumns: 2 })
  appendTableSheet(wb, 'Speed Lite Members', allSpeedMembers, { title: 'Weekly Speed Lite Members', subtitle: 'Team membership and hours by builder and day', meta, accent: COLORS.green, formats: [{ key: 'team_hours', format: '0.00' }], freezeColumns: 2 })
  appendTableSheet(wb, 'Data Quality', weeklyQuality, { title: 'Weekly Data Quality and Exceptions', subtitle: 'Review open issues before distributing the workbook', meta, accent: COLORS.red, freezeColumns: 2, widthCaps: { max: { 3: 62, 4: 62, 5: 72 } } })

  weekDays.forEach((day) => {
    const dayData = getDayData(day)
    const shift = shiftInfo(day, state.weekStartDate, state.boardShift)
    const dayMeta = reportMeta({ state, admin: reportAdmin, day, shift, closure: closureForDay(state, day) })
    appendTableSheet(wb, `${day} Staff`, staffRows(dayData, builderPool, { state, day, weekStartDate: state.weekStartDate, computeHoursForAssignment, boardShift: state.boardShift }), { title: `${day} Staffing Detail`, subtitle: `${state.boardShift} · ${shiftWindow}`, meta: dayMeta, accent: COLORS.blue, freezeColumns: 2, formats: [{ key: 'estimated_hours', format: '0.00' }] })
  })

  appendGuideSheet(wb, 'Weekly')
  return wb
}

export function exportWeeklyExcel(args) {
  const wb = buildWeeklyWorkbook(args)
  const { state, adminName } = args
  const reportAdmin = adminName || state.adminName || state.boardLead || 'Not set'
  writeWorkbook(wb, `weekly-operations-${state.currentBoardId || 'board'}-${state.weekStartDate}.xlsx`, reportAdmin)
}

export const __reportingV2 = { areaCoverageRows, closureForDay, dataQualityRows, materialSummaryRows, opsMetrics, rackRowsForDay, skillCoverageRows, statusCounts, weeklyHoursRows }
