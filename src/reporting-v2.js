import * as XLSX from 'xlsx'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const ACTIVE = new Set(['Present', 'Training', 'Indirect'])
const SHIFT_HOURS = 8
const RACK_WEIGHT = 6.4
const C = { navy: '0F172A', blue: '2563EB', green: '059669', orange: 'D97706', purple: '7C3AED', red: 'DC2626', line: 'CBD5E1', light: 'F8FAFC', white: 'FFFFFF', text: '172033', muted: '64748B' }

const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0
const r = (value, digits = 2) => Math.round(n(value) * (10 ** digits)) / (10 ** digits)
const pct = (done, goal) => n(goal) > 0 ? Math.max(0, n(done) / n(goal)) : (n(done) > 0 ? 1 : 0)
const active = (status) => status !== undefined && status !== null && ACTIVE.has(status || 'Present')
const yn = (value) => value ? 'Yes' : 'No'
const pretty = (value) => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
const safeName = (value) => String(value || 'Sheet').replace(/[\\/?*:[\]]/g, ' ').slice(0, 31)

function border(color = C.line) {
  return { top: { style: 'thin', color: { rgb: color } }, bottom: { style: 'thin', color: { rgb: color } }, left: { style: 'thin', color: { rgb: color } }, right: { style: 'thin', color: { rgb: color } } }
}

function styleSheet(ws, titleRows, sectionRows, headerRows, accent = C.blue) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1')
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const ref = XLSX.utils.encode_cell({ r: row, c: col })
      const cell = ws[ref]
      if (!cell) continue
      const base = { alignment: { vertical: 'top', wrapText: true }, border: border('E2E8F0') }
      if (titleRows.has(row)) cell.s = { ...base, font: { bold: true, color: { rgb: C.white }, sz: 17 }, fill: { fgColor: { rgb: C.navy } }, border: border(C.navy) }
      else if (sectionRows.has(row)) cell.s = { ...base, font: { bold: true, color: { rgb: C.white }, sz: 11 }, fill: { fgColor: { rgb: accent } }, border: border(accent) }
      else if (headerRows.has(row)) cell.s = { ...base, font: { bold: true, color: { rgb: C.white }, sz: 10 }, fill: { fgColor: { rgb: accent } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } }
      else cell.s = { ...base, font: { color: { rgb: C.text }, sz: 10 }, fill: { fgColor: { rgb: row % 2 ? C.white : C.light } } }
    }
  }
}

function widths(rows) {
  const columns = Math.max(1, ...rows.map((row) => row.length))
  return Array.from({ length: columns }, (_, col) => ({ wch: Math.min(54, Math.max(col === 0 ? 16 : 10, ...rows.map((row) => String(row[col] ?? '').length + 2))) }))
}

function appendSheet(wb, name, dataRows, options = {}) {
  const rows = dataRows.length ? dataRows : [{ note: 'No data available' }]
  const keys = options.keys || Object.keys(rows[0])
  const maxCols = Math.max(2, keys.length)
  const aoa = [[options.title || name], [options.subtitle || 'StaffBoard report'], []]
  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: maxCols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: maxCols - 1 } },
  ]
  const titleRows = new Set([0])
  const sectionRows = new Set()
  const headerRows = new Set()
  if (options.meta?.length) {
    sectionRows.add(aoa.length)
    aoa.push(['REPORT INFORMATION'])
    merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: maxCols - 1 } })
    options.meta.forEach(([label, value]) => aoa.push([label, value]))
    aoa.push([])
  }
  sectionRows.add(aoa.length)
  aoa.push([options.section || name.toUpperCase()])
  merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: maxCols - 1 } })
  const headerRow = aoa.length
  headerRows.add(headerRow)
  aoa.push(keys.map(pretty))
  const dataStart = aoa.length
  rows.forEach((row) => aoa.push(keys.map((key) => row[key] ?? '')))
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = merges
  ws['!cols'] = widths(aoa)
  ws['!rows'] = aoa.map((row, index) => ({ hpt: index === 0 ? 30 : index === 1 ? 22 : row.some((value) => String(value || '').length > 70) ? 36 : 20 }))
  ws['!freeze'] = { xSplit: options.freezeColumns || 0, ySplit: headerRow + 1 }
  ws['!autofilter'] = { ref: `${XLSX.utils.encode_cell({ r: headerRow, c: 0 })}:${XLSX.utils.encode_cell({ r: aoa.length - 1, c: keys.length - 1 })}` }
  ws['!pageSetup'] = { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
  ws['!margins'] = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
  ws['!header'] = [{ left: '&BStaffBoard', center: options.title || name, right: '&D &T' }]
  ws['!footer'] = [{ left: 'Internal operations use', center: 'Page &P of &N', right: '' }]
  styleSheet(ws, titleRows, sectionRows, headerRows, options.accent || C.blue)
  ;(options.formats || []).forEach(({ key, format }) => {
    const col = keys.indexOf(key)
    if (col < 0) return
    for (let row = dataStart; row < aoa.length; row += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r: row, c: col })]
      if (cell) cell.z = format
    }
  })
  XLSX.utils.book_append_sheet(wb, ws, safeName(name))
  return ws
}

function appendDashboard(wb, name, options) {
  const rows = []
  options.sections.forEach((section) => {
    section.rows.forEach((values) => rows.push({ section: section.title, ...Object.fromEntries(section.headers.map((header, index) => [header || `value_${index + 1}`, values[index] ?? ''])) }))
  })
  return appendSheet(wb, name, rows, { title: options.title, subtitle: options.subtitle, meta: options.meta, accent: options.accent || C.blue, section: 'DASHBOARD DETAILS' })
}

function shiftWindow(label) {
  return String(label || '').toLowerCase().includes('night') ? '5:00 PM - 1:30 AM' : '8:00 AM - 4:30 PM'
}

function operationId(boardId) {
  return String(boardId || 'speed_day').replace(/_(day|night)$/i, '')
}

function closureFor(state, day) {
  const record = state.dayClosures?.[operationId(state.currentBoardId)]?.[state.weekStartDate]?.[day]
  if (!record) return null
  if (record.entireDay?.closed) return { ...record.entireDay, scope: 'Entire Day' }
  const night = String(state.boardShift || '').toLowerCase().includes('night')
  const closure = night ? record.nightShift : record.dayShift
  return closure?.closed ? { ...closure, scope: night ? 'Night Shift' : 'Day Shift' } : null
}

function closureLabel(closure) {
  if (!closure) return 'Open'
  const reason = closure.reason === 'Other' ? closure.customReason || 'Other' : closure.reason || 'Closed'
  return `${closure.scope} Closed — ${reason}`
}

function areaType(state, name) {
  const explicit = (state.areaDefs || []).find((area) => area.name === name)?.areaType
  if (explicit) return explicit
  const value = String(name || 'Unassigned').toLowerCase()
  if (!value || value === 'unassigned') return 'unassigned'
  if (value === 'fa' || value === 'fa metal removal') return 'labor_share'
  if (['shipping', 'eos pull racks', 'projects', 'learning', '1:1'].includes(value)) return 'support'
  return 'production'
}

function skills(builder) {
  return [builder.trainedTdr && 'TDR', builder.trainedForklift && 'Forklift', builder.trainedCenterRider && 'Center Rider', builder.trainedClampTruck && 'Clamp Truck', builder.trainedRackMover && 'Rack Mover', builder.trainedReachTruck && 'Reach Truck', builder.isTrainer && 'Trainer', builder.isSafetyMember && 'Safety', builder.isLineLead && 'Line Lead'].filter(Boolean).join(', ')
}

function parseTime(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/)
  return match ? Number(match[1]) + Number(match[2]) / 60 : null
}

function estimatedHours(assignment, day, weekStartDate, compute, boardShift) {
  if (!assignment || !active(assignment.status)) return 0
  if (typeof compute === 'function') {
    const values = compute(assignment, day, weekStartDate) || {}
    return r(Object.values(values).reduce((sum, value) => sum + n(value), 0))
  }
  const start = parseTime(assignment.clockInTime)
  const end = parseTime(assignment.leaveTime)
  if (start === null && end === null) return SHIFT_HOURS
  const fallback = String(boardShift || '').toLowerCase().includes('night') ? 17 : 8
  const from = start === null ? fallback : start
  let to = end === null ? from + SHIFT_HOURS : end
  if (to < from) to += 24
  return r(Math.max(0, Math.min(SHIFT_HOURS, to - from)))
}

function countStatus(dayData, builders) {
  const out = { assigned: 0, active: 0, present: 0, training: 0, indirect: 0, pto: 0, loa: 0, vto: 0, absent: 0, unassigned: 0, line_leads: 0 }
  builders.forEach((builder) => {
    const a = dayData.assignments?.[builder.id]
    if (!a) return
    out.assigned += 1
    const key = String(a.status || 'Present').toLowerCase()
    if (Object.prototype.hasOwnProperty.call(out, key)) out[key] += 1
    if (active(a.status)) {
      if (builder.isLineLead) out.line_leads += 1
      if (!builder.isLineLead || builder.countsAsProductionLabor) {
        out.active += 1
        if ((a.area || 'Unassigned') === 'Unassigned') out.unassigned += 1
      }
    }
  })
  return out
}

function allocation(state, dayData, builders) {
  const members = builders.filter((builder) => active(dayData.assignments?.[builder.id]?.status))
  const byType = (type) => members.filter((builder) => areaType(state, dayData.assignments[builder.id].area || 'Unassigned') === type)
  return {
    total_shift_hc: members.length,
    production_hc: byType('production').filter((builder) => !builder.isLineLead || builder.countsAsProductionLabor).length,
    labor_share_hc: byType('labor_share').length,
    support_hc: byType('support').length,
    unassigned_hc: byType('unassigned').filter((builder) => !builder.isLineLead || builder.countsAsProductionLabor).length,
    line_leads: members.filter((builder) => builder.isLineLead).length,
  }
}

function ops(dayData, headcount, remainingHours = 8) {
  const m = dayData.opsMetrics || {}
  const recoveryGoal = n(m.targetRackMediaRecovery)
  const recoveryDone = n(m.racksProcessed)
  const prepGoal = n(m.targetRackPrep)
  const prepDone = n(m.racksPrepped) + n(m.recoveredRackPrep)
  const mediaGoal = n(m.totalMediaCount)
  const mediaDone = n(m.mediaProcessed)
  const goalWork = ((recoveryGoal + prepGoal) * RACK_WEIGHT) + mediaGoal
  const completedWork = ((recoveryDone + prepDone) * RACK_WEIGHT) + mediaDone
  const remainingWork = Math.max(0, goalWork - completedWork)
  return {
    recovery_goal: recoveryGoal, recovery_done: recoveryDone, prep_goal: prepGoal, prep_done: prepDone, media_goal: mediaGoal, media_done: mediaDone,
    goal_work: r(goalWork), completed_work: r(completedWork), remaining_work: r(remainingWork), completion_pct: pct(completedWork, goalWork),
    target_tph: headcount > 0 ? r(goalWork / (headcount * SHIFT_HOURS)) : 0,
    required_tph: headcount > 0 && remainingHours > 0 ? r(remainingWork / (headcount * remainingHours)) : 0,
  }
}

function parseRacks(dayData, day) {
  const parse = (text, listType) => String(text || '').split(/\r?\n|,|;/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const parts = line.split(/\s+/)
    const material = parts.slice(1).join(' ') || 'Unspecified'
    const combined = `${material} ${line}`.toLowerCase()
    const category = /\bdecom\b/.test(combined) ? 'Decom' : /\bspeed\b/.test(combined) ? 'SPEED' : /\bmedia\b|\bnte\b|\be\s*&\s*o\b|\beo\b/.test(combined) ? 'Media / NTE / E&O' : 'Other'
    return { day, list_type: listType, sequence: index + 1, rack_id: parts[0] || '', material_type: material, work_category: category, raw_entry: line }
  })
  return [...parse(dayData.rackLists?.processed, 'Processed / Recovery'), ...parse(dayData.rackLists?.prepped, 'Prepped / Rack Prep')]
}

function materialSummary(racks) {
  const map = new Map()
  racks.forEach((rack) => {
    const key = `${rack.list_type}|${rack.work_category}|${rack.material_type}`
    const row = map.get(key) || { list_type: rack.list_type, work_category: rack.work_category, material_type: rack.material_type, rack_count: 0 }
    row.rack_count += 1
    map.set(key, row)
  })
  return [...map.values()].sort((a, b) => a.list_type.localeCompare(b.list_type) || a.material_type.localeCompare(b.material_type))
}

function staffRows(state, dayData, builders, day, compute) {
  return builders.flatMap((builder) => {
    const a = dayData.assignments?.[builder.id]
    if (!a) return []
    return [{
      builder: builder.name, badge_type: builder.badgeType || 'day', status: a.status || 'Present', active: yn(active(a.status)), area: a.area || 'Unassigned', area_type: areaType(state, a.area || 'Unassigned'), sub_area: a.subArea || '', role: a.role || '', line_lead: yn(builder.isLineLead), production_labor: yn(!builder.isLineLead || builder.countsAsProductionLabor), clock_in: a.clockInTime || '', clock_out: a.leaveTime || '', scheduled_clock_in: a.scheduledClockIn?.status === 'pending' ? a.scheduledClockIn.localTime || '' : '', scheduled_clock_out: a.scheduledClockOut?.status === 'pending' ? a.scheduledClockOut.localTime || '' : '', estimated_hours: estimatedHours(a, day, state.weekStartDate, compute, state.boardShift), skills_roles: skills(builder), tdr: yn(builder.trainedTdr), forklift: yn(builder.trainedForklift), center_rider: yn(builder.trainedCenterRider), clamp_truck: yn(builder.trainedClampTruck), rack_mover: yn(builder.trainedRackMover), reach_truck: yn(builder.trainedReachTruck), trainer: yn(builder.isTrainer), safety: yn(builder.isSafetyMember), comment: a.comment || '', builder_notes: a.builderNotes || '', updated_at: a.updatedAt || '',
    }]
  }).sort((a, b) => a.area.localeCompare(b.area) || a.builder.localeCompare(b.builder))
}

function areaRows(state, dayData, builders, areaDefs) {
  const defs = areaDefs?.length ? areaDefs : state.areaDefs || []
  return defs.map((area) => {
    const members = builders.filter((builder) => {
      const a = dayData.assignments?.[builder.id]
      return a && active(a.status) && (a.area || 'Unassigned') === area.name
    })
    const production = members.filter((builder) => !builder.isLineLead || builder.countsAsProductionLabor).length
    const capacity = n(area.capacity)
    return {
      area: area.name, area_type: areaType(state, area.name), active_builders: members.length, production_hc: production, line_leads: members.filter((builder) => builder.isLineLead).length,
      capacity: capacity || '', utilization_pct: capacity > 0 ? production / capacity : '', coverage_status: capacity > 0 && production > capacity ? 'Over Capacity' : area.name === 'Unassigned' && production > 0 ? 'Needs Assignment' : production ? 'Covered' : 'Empty',
      tdr: members.filter((builder) => builder.trainedTdr).length, forklift: members.filter((builder) => builder.trainedForklift).length, center_rider: members.filter((builder) => builder.trainedCenterRider).length, clamp_truck: members.filter((builder) => builder.trainedClampTruck).length, rack_mover: members.filter((builder) => builder.trainedRackMover).length, reach_truck: members.filter((builder) => builder.trainedReachTruck).length, trainers: members.filter((builder) => builder.isTrainer).length, safety_members: members.filter((builder) => builder.isSafetyMember).length, note: area.note || '',
    }
  })
}

function skillRows(dayData, builders) {
  const members = builders.filter((builder) => active(dayData.assignments?.[builder.id]?.status))
  return [['TDR', 'trainedTdr'], ['Forklift', 'trainedForklift'], ['Center Rider', 'trainedCenterRider'], ['Clamp Truck', 'trainedClampTruck'], ['Rack Mover', 'trainedRackMover'], ['Reach Truck', 'trainedReachTruck'], ['Trainer', 'isTrainer'], ['Safety Member', 'isSafetyMember'], ['Line Lead', 'isLineLead']].map(([label, field]) => {
    const qualified = members.filter((builder) => builder[field])
    return { skill_role: label, active_qualified: qualified.length, qualified_builders: qualified.map((builder) => builder.name).join(', '), coverage_status: qualified.length ? 'Covered' : 'No Active Coverage' }
  })
}

function qualityRows(day, closure, counts, areas, racks, staff) {
  const rows = []
  const add = (severity, category, issue, affected, action) => rows.push({ severity, category, issue, affected, recommended_action: action })
  if (closure) add('Info', 'Closure', closureLabel(closure), day, 'No action unless the shift should be reopened.')
  const unassigned = staff.filter((row) => row.active === 'Yes' && row.area === 'Unassigned' && row.production_labor === 'Yes')
  if (unassigned.length) add('High', 'Staffing', 'Active builders are unassigned.', unassigned.map((row) => row.builder).join(', '), 'Assign each active builder to an operating area.')
  areas.filter((row) => row.coverage_status === 'Over Capacity').forEach((row) => add('Warning', 'Capacity', `${row.area} exceeds configured capacity.`, `${row.production_hc} of ${row.capacity}`, 'Move labor or update capacity configuration.'))
  if (counts.assigned && !counts.line_leads) add('Warning', 'Leadership', 'No active Line Lead is recorded.', day, 'Assign or confirm Line Lead coverage.')
  const missingTime = staff.filter((row) => row.active === 'Yes' && (!row.clock_in || !row.clock_out))
  if (missingTime.length) add('Info', 'Attendance', 'Active assignments have incomplete clock times.', missingTime.map((row) => row.builder).join(', '), 'Confirm clock-in and clock-out times.')
  const ids = new Map()
  racks.forEach((rack) => ids.set(rack.rack_id, (ids.get(rack.rack_id) || 0) + 1))
  const duplicates = [...ids.entries()].filter(([id, count]) => id && count > 1).map(([id]) => id)
  if (duplicates.length) add('Warning', 'Rack Data', 'Duplicate rack IDs appear in the export.', duplicates.join(', '), 'Verify whether duplicates are legitimate repeated handling.')
  const unspecified = racks.filter((rack) => rack.material_type === 'Unspecified')
  if (unspecified.length) add('Info', 'Rack Data', 'Rack entries are missing material types.', unspecified.map((rack) => rack.rack_id).join(', '), 'Add material type after each rack ID.')
  if (!rows.length) add('Clear', 'Data Quality', 'No report exceptions detected.', day, 'Continue normal operation.')
  return rows
}

function laborRows(state, dayData, builders, day, compute) {
  return builders.flatMap((builder) => {
    const a = dayData.assignments?.[builder.id]
    if (!a || !active(a.status) || areaType(state, a.area || 'Unassigned') !== 'labor_share') return []
    return [{ day, builder: builder.name, line_lead: yn(builder.isLineLead), labor_share_area: a.area || '', status: a.status || 'Present', clock_in: a.clockInTime || '', clock_out: a.leaveTime || '', labor_share_hours: estimatedHours(a, day, state.weekStartDate, compute, state.boardShift), previous_production_area: a.previousProductionArea || '' }]
  })
}

function speedLiteRows(dayData, builders, day, state, compute) {
  const teams = Array.isArray(dayData.speedLiteTeams) ? dayData.speedLiteTeams : []
  const teamRows = []
  const memberRows = []
  teams.forEach((team, index) => {
    const id = String(team.id || '')
    const name = team.name || `Team ${index + 1}`
    const members = builders.filter((builder) => dayData.assignments?.[builder.id]?.area === 'Speed Lite' && String(dayData.assignments[builder.id].speedLiteTeamId || '') === id)
    const activeMembers = members.filter((builder) => active(dayData.assignments[builder.id].status))
    members.forEach((builder) => {
      const a = dayData.assignments[builder.id]
      memberRows.push({ day, team: name, builder: builder.name, team_lead: yn(builder.id === team.teamLeadBuilderId), status: a.status || 'Present', team_hours: estimatedHours(a, day, state.weekStartDate, compute, state.boardShift) })
    })
    const target = Math.max(1, n(team.targetSize || 2))
    teamRows.push({ day, team: name, target_size: target, active_builders: activeMembers.length, staffing_variance: activeMembers.length - target, status: activeMembers.length === target ? 'Complete' : activeMembers.length < target ? `Needs ${target - activeMembers.length}` : 'Over Target', team_lead: members.find((builder) => builder.id === team.teamLeadBuilderId)?.name || '', builders: members.map((builder) => builder.name).join(', ') })
  })
  return { teamRows, memberRows }
}

function meta(state, admin, day) {
  return [['Board ID', state.currentBoardId || 'unknown'], ['Board', state.boardTitle || 'StaffBoard'], ['Shift', state.boardShift || ''], ['Shift Window', shiftWindow(state.boardShift)], ['Week Start', state.weekStartDate || ''], ...(day ? [['Operational Day', day]] : []), ['Generated By', admin], ['Generated', new Date().toLocaleString()], ['State Revision', n(state.stateRevision)]]
}

function guideRows(reportType) {
  return [
    { section: 'Purpose', guidance: `${reportType} workbook for staffing, production, coverage, and audit review.` },
    { section: 'Dashboard', guidance: 'Start on the first sheet for KPI and exception review.' },
    { section: 'Filters', guidance: 'Use header filters on detail sheets to narrow results.' },
    { section: 'Closed Days', guidance: 'Closed shifts are labeled and excluded from weekly performance totals.' },
    { section: 'Hours', guidance: 'Hours use area history when available and clock times otherwise.' },
    { section: 'Data Quality', guidance: 'Resolve high and warning items before distribution.' },
    { section: 'Privacy', guidance: 'Share employee and operational data only through approved internal channels.' },
  ]
}

export function buildDailyWorkbook({ state, dayState, metrics = {}, counts = {}, areaCounts = [], totalHeadCount = 0, rackWeight = RACK_WEIGHT, activeBuilders = [], selectedDay, adminName, computeHoursForAssignment }) {
  const wb = XLSX.utils.book_new()
  const builders = state.builderPool || activeBuilders
  const admin = adminName || state.adminName || state.boardLead || 'Not set'
  const closure = closureFor(state, selectedDay)
  const status = countStatus(dayState, builders)
  const alloc = allocation(state, dayState, builders)
  const tphHeadcount = String(state.currentBoardId || '').startsWith('speed_') ? alloc.production_hc : (status.active || totalHeadCount)
  const performance = { ...ops(dayState, tphHeadcount), ...metrics }
  const staff = staffRows(state, dayState, builders, selectedDay, computeHoursForAssignment)
  const areas = areaRows(state, dayState, builders, state.areaDefs || areaCounts)
  const racks = parseRacks(dayState, selectedDay)
  const quality = qualityRows(selectedDay, closure, status, areas, racks, staff)
  const reportMeta = meta(state, admin, selectedDay)
  appendDashboard(wb, 'Daily Dashboard', {
    title: `Daily Operations Report — ${selectedDay}`,
    subtitle: `${state.boardTitle} · ${state.boardShift} · ${shiftWindow(state.boardShift)}`,
    meta: [...reportMeta, ['Operating Status', closureLabel(closure)]],
    sections: [
      { title: 'EXECUTIVE KPI', headers: ['metric', 'value'], rows: [['Operating Status', closureLabel(closure)], ['Completion', performance.completion_pct ?? pct(performance.completed_work, performance.goal_work)], ['Production HC', alloc.production_hc], ['Required TPH', performance.required_tph], ['Goal Work', performance.goal_work], ['Completed Work', performance.completed_work], ['Remaining Work', performance.remaining_work]] },
      { title: 'HEADCOUNT', headers: ['metric', 'value'], rows: [['Total Shift HC', alloc.total_shift_hc], ['Assigned', status.assigned || counts.assigned || 0], ['Present', status.present || counts.present || 0], ['Training', status.training || counts.training || 0], ['Indirect', status.indirect || counts.indirect || 0], ['PTO', status.pto || counts.pto || 0], ['LOA', status.loa || counts.loa || 0], ['VTO', status.vto || counts.vto || 0], ['Absent', status.absent || counts.absent || 0], ['Line Leads', alloc.line_leads], ['Labor Share HC', alloc.labor_share_hc], ['Unassigned HC', alloc.unassigned_hc]] },
      { title: 'TOP EXCEPTIONS', headers: ['severity', 'category', 'issue', 'affected', 'recommended_action'], rows: quality.slice(0, 6).map((row) => [row.severity, row.category, row.issue, row.affected, row.recommended_action]) },
    ],
  })
  appendSheet(wb, 'Staff Assignments', staff, { title: `${selectedDay} Staff Assignments`, subtitle: `${state.boardShift} · ${shiftWindow(state.boardShift)}`, meta: reportMeta, accent: C.blue, freezeColumns: 2, formats: [{ key: 'estimated_hours', format: '0.00' }] })
  appendSheet(wb, 'Area Coverage', areas, { title: `${selectedDay} Area Coverage`, subtitle: 'Capacity, utilization, leadership, and skill coverage', meta: reportMeta, accent: C.orange, formats: [{ key: 'utilization_pct', format: '0.0%' }] })
  appendSheet(wb, 'Skill Coverage', skillRows(dayState, builders), { title: `${selectedDay} Skill Coverage`, meta: reportMeta, accent: C.green })
  appendSheet(wb, 'Rack Detail', racks, { title: `${selectedDay} Rack Detail`, meta: reportMeta, accent: C.purple, freezeColumns: 2 })
  appendSheet(wb, 'Material Summary', materialSummary(racks), { title: `${selectedDay} Material Summary`, meta: reportMeta, accent: C.purple })
  appendSheet(wb, 'Movement History', (dayState.movementLog || []).map((item) => ({ timestamp: item.timestamp || '', admin: item.admin || '', builder: item.builder || '', from: item.from || item.fromArea || '', to: item.to || item.toArea || '', action: item.action || '', note: item.note || item.notes || '' })), { title: `${selectedDay} Movement History`, meta: reportMeta, accent: C.orange })
  appendSheet(wb, 'Attendance History', (dayState.attendanceLog || []).map((item) => ({ timestamp: item.timestamp || '', clock_time: item.clock_time || '', builder: item.builder || '', event: item.event || '', note: item.note || '' })), { title: `${selectedDay} Attendance History`, meta: reportMeta, accent: C.red })
  appendSheet(wb, 'Labor Share', laborRows(state, dayState, builders, selectedDay, computeHoursForAssignment), { title: `${selectedDay} Labor Share`, meta: reportMeta, accent: C.orange, formats: [{ key: 'labor_share_hours', format: '0.00' }] })
  const speed = speedLiteRows(dayState, builders, selectedDay, state, computeHoursForAssignment)
  appendSheet(wb, 'Speed Lite Teams', speed.teamRows, { title: `${selectedDay} Speed Lite Teams`, meta: reportMeta, accent: C.green })
  appendSheet(wb, 'Speed Lite Members', speed.memberRows, { title: `${selectedDay} Speed Lite Members`, meta: reportMeta, accent: C.green, formats: [{ key: 'team_hours', format: '0.00' }] })
  appendSheet(wb, 'Data Quality', quality, { title: `${selectedDay} Data Quality`, subtitle: 'Resolve exceptions before sharing', meta: reportMeta, accent: C.red })
  appendSheet(wb, 'Report Guide', guideRows('Daily'), { title: 'Daily Report Guide', accent: C.navy })
  return wb
}

export function exportEndOfShiftExcel(args) {
  const wb = buildDailyWorkbook(args)
  const admin = args.adminName || args.state.adminName || args.state.boardLead || 'StaffBoard'
  wb.Props = { Title: 'Daily StaffBoard Operations Report', Subject: 'StaffBoard Operations Report', Author: admin, Company: 'StaffBoard', CreatedDate: new Date() }
  XLSX.writeFile(wb, `daily-operations-${args.state.currentBoardId || 'board'}-${args.state.weekStartDate}-${args.selectedDay}.xlsx`, { bookType: 'xlsx', cellStyles: true, compression: true })
}

function dailySummary(state, day, dayData, builders, areaDefs) {
  const closure = closureFor(state, day)
  const counts = countStatus(dayData, builders)
  const alloc = allocation(state, dayData, builders)
  const performance = ops(dayData, String(state.currentBoardId || '').startsWith('speed_') ? alloc.production_hc : counts.active)
  const areas = areaRows(state, dayData, builders, areaDefs)
  return { day, operating_status: closureLabel(closure), shift_window: shiftWindow(state.boardShift), assigned_hc: counts.assigned, active_hc: counts.active, production_hc: alloc.production_hc, labor_share_hc: alloc.labor_share_hc, support_hc: alloc.support_hc, line_leads: alloc.line_leads, unassigned_hc: alloc.unassigned_hc, present: counts.present, training: counts.training, indirect: counts.indirect, pto: counts.pto, loa: counts.loa, vto: counts.vto, absent: counts.absent, ...performance, rack_entries: parseRacks(dayData, day).length, over_capacity_areas: areas.filter((row) => row.coverage_status === 'Over Capacity').length, updated_at: dayData.updatedAt || '', excluded_from_weekly_performance: closure ? 'Yes' : 'No' }
}

function weeklyHours(state, weekDays, getDayData, builders, compute) {
  const details = []
  const totals = new Map()
  builders.forEach((builder) => weekDays.forEach((day) => {
    const a = getDayData(day).assignments?.[builder.id]
    if (!a) return
    let areas = {}
    if (typeof compute === 'function') areas = compute(a, day, state.weekStartDate) || {}
    else if (active(a.status)) areas = { [a.area || 'Unassigned']: estimatedHours(a, day, state.weekStartDate, null, state.boardShift) }
    Object.entries(areas).forEach(([area, hours]) => {
      if (n(hours) <= 0) return
      details.push({ builder: builder.name, day, area, hours: r(hours) })
      const key = `${builder.id}|${area}`
      const row = totals.get(key) || { builder: builder.name, badge_type: builder.badgeType || 'day', skills_roles: skills(builder), area, total_week_hours: 0 }
      row.total_week_hours += n(hours)
      totals.set(key, row)
    })
  }))
  return { details, totals: [...totals.values()].map((row) => ({ ...row, total_week_hours: r(row.total_week_hours) })) }
}

export function buildWeeklyWorkbook({ state, weekDays = DAYS, getDayData, builderPool = [], computeHoursForAssignment, areaDefs = [], adminName }) {
  const wb = XLSX.utils.book_new()
  const admin = adminName || state.adminName || state.boardLead || 'Not set'
  const summaries = weekDays.map((day) => dailySummary(state, day, getDayData(day), builderPool, areaDefs))
  const open = summaries.filter((row) => row.excluded_from_weekly_performance !== 'Yes')
  const sum = (key, rows = summaries) => rows.reduce((total, row) => total + n(row[key]), 0)
  const hours = weeklyHours(state, weekDays, getDayData, builderPool, computeHoursForAssignment)
  const racks = weekDays.flatMap((day) => parseRacks(getDayData(day), day))
  const coverage = weekDays.flatMap((day) => areaRows(state, getDayData(day), builderPool, areaDefs).map((row) => ({ day, ...row })))
  const quality = weekDays.flatMap((day) => {
    const dayData = getDayData(day)
    const staff = staffRows(state, dayData, builderPool, day, computeHoursForAssignment)
    const areas = areaRows(state, dayData, builderPool, areaDefs)
    return qualityRows(day, closureFor(state, day), countStatus(dayData, builderPool), areas, parseRacks(dayData, day), staff).map((row) => ({ day, ...row }))
  })
  const reportMeta = meta(state, admin)
  appendDashboard(wb, 'Weekly Dashboard', {
    title: 'Weekly Executive Operations Report', subtitle: `${state.boardTitle} · ${state.boardShift} · ${shiftWindow(state.boardShift)}`, meta: reportMeta,
    sections: [
      { title: 'WEEKLY KPI', headers: ['metric', 'value'], rows: [['Open Days', open.length], ['Closed Days', summaries.length - open.length], ['Completion', pct(sum('completed_work', open), sum('goal_work', open))], ['Goal Work', r(sum('goal_work', open))], ['Completed Work', r(sum('completed_work', open))], ['Remaining Work', r(sum('remaining_work', open))], ['Staffed Hours', r(sum('hours', hours.details))], ['Rack Entries', racks.length], ['Exception Count', quality.filter((row) => !['Clear', 'Info'].includes(row.severity)).length]] },
      { title: 'DAILY PERFORMANCE', headers: ['day', 'status', 'production_hc', 'goal_work', 'completed_work', 'completion_pct', 'required_tph', 'unassigned_hc'], rows: summaries.map((row) => [row.day, row.operating_status, row.production_hc, row.goal_work, row.completed_work, row.completion_pct, row.required_tph, row.unassigned_hc]) },
      { title: 'TOP EXCEPTIONS', headers: ['day', 'severity', 'category', 'issue', 'affected', 'recommended_action'], rows: quality.filter((row) => row.severity !== 'Clear').slice(0, 10).map((row) => [row.day, row.severity, row.category, row.issue, row.affected, row.recommended_action]) },
    ],
  })
  appendSheet(wb, 'Daily Summary', summaries, { title: 'Daily Performance and Staffing Summary', meta: reportMeta, accent: C.blue, freezeColumns: 2, formats: [{ key: 'completion_pct', format: '0.0%' }, { key: 'goal_work', format: '0.00' }, { key: 'completed_work', format: '0.00' }, { key: 'remaining_work', format: '0.00' }, { key: 'required_tph', format: '0.00' }] })
  const builderSummary = builderPool.map((builder) => {
    const assignedDays = weekDays.filter((day) => getDayData(day).assignments?.[builder.id])
    const activeDays = assignedDays.filter((day) => active(getDayData(day).assignments[builder.id].status))
    const builderHours = hours.details.filter((row) => row.builder === builder.name)
    const areas = [...new Set(builderHours.map((row) => row.area))]
    return { builder: builder.name, badge_type: builder.badgeType || 'day', skills_roles: skills(builder), assigned_days: assignedDays.length, active_days: activeDays.length, total_week_hours: r(builderHours.reduce((total, row) => total + n(row.hours), 0)), unique_area_count: areas.length, areas_worked: areas.join(', ') }
  })
  appendSheet(wb, 'Builder Weekly Summary', builderSummary, { title: 'Builder Weekly Summary', meta: reportMeta, accent: C.green, freezeColumns: 2, formats: [{ key: 'total_week_hours', format: '0.00' }] })
  const matrix = builderPool.map((builder) => {
    const row = { builder: builder.name, badge_type: builder.badgeType || 'day', skills_roles: skills(builder) }
    weekDays.forEach((day) => {
      const a = getDayData(day).assignments?.[builder.id]
      row[`${day}_status`] = a?.status || ''
      row[`${day}_area`] = a?.area || ''
      row[`${day}_role`] = a?.role || ''
      row[`${day}_clock_in`] = a?.clockInTime || ''
      row[`${day}_clock_out`] = a?.leaveTime || ''
    })
    return row
  })
  appendSheet(wb, 'Weekly Staff Matrix', matrix, { title: 'Weekly Staff Matrix', meta: reportMeta, accent: C.blue, freezeColumns: 3 })
  appendSheet(wb, 'Builder Hours by Area', hours.totals, { title: 'Builder Hours by Area', meta: reportMeta, accent: C.green, freezeColumns: 2, formats: [{ key: 'total_week_hours', format: '0.00' }] })
  appendSheet(wb, 'Builder Hours Detail', hours.details, { title: 'Builder Hours Detail', meta: reportMeta, accent: C.green, freezeColumns: 2, formats: [{ key: 'hours', format: '0.00' }] })
  appendSheet(wb, 'Area Coverage by Day', coverage, { title: 'Area Coverage by Day', meta: reportMeta, accent: C.orange, freezeColumns: 2, formats: [{ key: 'utilization_pct', format: '0.0%' }] })
  const areaNames = [...new Set(coverage.map((row) => row.area))]
  const rollup = areaNames.map((name) => {
    const rows = coverage.filter((row) => row.area === name)
    return { area: name, area_type: rows[0]?.area_type || '', days_reported: rows.length, avg_active_builders: r(rows.reduce((total, row) => total + n(row.active_builders), 0) / Math.max(1, rows.length)), avg_production_hc: r(rows.reduce((total, row) => total + n(row.production_hc), 0) / Math.max(1, rows.length)), min_production_hc: Math.min(...rows.map((row) => n(row.production_hc))), max_production_hc: Math.max(...rows.map((row) => n(row.production_hc))), capacity: rows[0]?.capacity || '', over_capacity_days: rows.filter((row) => row.coverage_status === 'Over Capacity').length, empty_days: rows.filter((row) => row.coverage_status === 'Empty').length }
  })
  appendSheet(wb, 'Area Weekly Summary', rollup, { title: 'Area Weekly Summary', meta: reportMeta, accent: C.orange, freezeColumns: 2 })
  appendSheet(wb, 'Skill Coverage', weekDays.flatMap((day) => skillRows(getDayData(day), builderPool).map((row) => ({ day, ...row }))), { title: 'Weekly Skill Coverage', meta: reportMeta, accent: C.green, freezeColumns: 2 })
  appendSheet(wb, 'Rack Detail', racks, { title: 'Weekly Rack Detail', meta: reportMeta, accent: C.purple, freezeColumns: 2 })
  appendSheet(wb, 'Material Summary', materialSummary(racks), { title: 'Weekly Material Summary', meta: reportMeta, accent: C.purple })
  appendSheet(wb, 'Weekly Labor Share', weekDays.flatMap((day) => laborRows(state, getDayData(day), builderPool, day, computeHoursForAssignment)), { title: 'Weekly Labor Share', meta: reportMeta, accent: C.orange, formats: [{ key: 'labor_share_hours', format: '0.00' }] })
  const speed = weekDays.map((day) => speedLiteRows(getDayData(day), builderPool, day, state, computeHoursForAssignment))
  appendSheet(wb, 'Speed Lite Teams', speed.flatMap((row) => row.teamRows), { title: 'Weekly Speed Lite Teams', meta: reportMeta, accent: C.green })
  appendSheet(wb, 'Speed Lite Members', speed.flatMap((row) => row.memberRows), { title: 'Weekly Speed Lite Members', meta: reportMeta, accent: C.green, formats: [{ key: 'team_hours', format: '0.00' }] })
  appendSheet(wb, 'Data Quality', quality, { title: 'Weekly Data Quality', subtitle: 'Resolve exceptions before sharing', meta: reportMeta, accent: C.red, freezeColumns: 2 })
  weekDays.forEach((day) => appendSheet(wb, `${day} Staff`, staffRows(state, getDayData(day), builderPool, day, computeHoursForAssignment), { title: `${day} Staffing Detail`, meta: meta(state, admin, day), accent: C.blue, freezeColumns: 2, formats: [{ key: 'estimated_hours', format: '0.00' }] }))
  appendSheet(wb, 'Report Guide', guideRows('Weekly'), { title: 'Weekly Report Guide', accent: C.navy })
  return wb
}

export function exportWeeklyExcel(args) {
  const wb = buildWeeklyWorkbook(args)
  const admin = args.adminName || args.state.adminName || args.state.boardLead || 'StaffBoard'
  wb.Props = { Title: 'Weekly StaffBoard Operations Report', Subject: 'StaffBoard Operations Report', Author: admin, Company: 'StaffBoard', CreatedDate: new Date() }
  XLSX.writeFile(wb, `weekly-operations-${args.state.currentBoardId || 'board'}-${args.state.weekStartDate}.xlsx`, { bookType: 'xlsx', cellStyles: true, compression: true })
}

export const __reportingV2 = { areaCoverageRows: areaRows, closureForDay: closureFor, dataQualityRows: qualityRows, materialSummaryRows: materialSummary, opsMetrics: ops, rackRowsForDay: parseRacks, skillCoverageRows: skillRows, statusCounts: countStatus, weeklyHoursRows: weeklyHours }
