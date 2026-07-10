export function laborShareExcelPlugin() {
  return {
    name: 'staffboard-labor-share-excel',
    enforce: 'pre',
    transform(code, id) {
      let next = code

      if (id.endsWith('/src/App.jsx')) {
        next = next.replace(
          '              selectedDay: state.selectedDay,\n              adminName: reportAdminName,',
          '              selectedDay: state.selectedDay,\n              adminName: reportAdminName,\n              computeHoursForAssignment,'
        )
        next = next.replace(
          '              areaDefs: AREA_DEFS,\n              adminName: reportAdminName,',
          '              areaDefs: effectiveAreaDefs,\n              adminName: reportAdminName,'
        )
        return next === code ? null : { code: next, map: null }
      }

      if (!id.endsWith('/src/reporting.js')) return null

      if (!next.includes('function laborShareRowsForDay')) {
        const marker = 'function statusCounts(dayData, builderPool = []) {'
        const helper = `function reportingAreaType(state, areaName) {
  const name = areaName || 'Unassigned'
  const explicit = (state.areaDefs || []).find((area) => area.name === name)?.areaType
  if (explicit) return explicit
  const normalized = String(name).trim().toLowerCase()
  if (!normalized || normalized === 'unassigned') return 'unassigned'
  if (normalized === 'fa' || normalized === 'fa metal removal') return 'labor_share'
  if (['shipping', 'eos pull racks', 'projects', 'learning', '1:1'].includes(normalized)) return 'support'
  return 'production'
}

function basicAssignmentHours(assignment = {}) {
  const parse = (value) => {
    const match = String(value || '').match(/^(\\d{1,2}):(\\d{2})$/)
    return match ? Number(match[1]) + Number(match[2]) / 60 : null
  }
  const start = parse(assignment.clockInTime)
  const end = parse(assignment.leaveTime)
  if (start === null && end === null) return SHIFT_HOURS
  const from = start === null ? 8 : start
  let to = end === null ? from + SHIFT_HOURS : end
  if (to < from) to += 24
  return Math.max(0, Math.min(SHIFT_HOURS, to - from))
}

function laborShareRowsForDay({ state, dayData, builderPool, day, weekStartDate, computeHoursForAssignment }) {
  const rows = []
  builderPool.forEach((builder) => {
    const assignment = dayData.assignments?.[builder.id]
    if (!assignment || !['Present', 'Training', 'Indirect'].includes(assignment.status || 'Present')) return
    if (reportingAreaType(state, assignment.area || 'Unassigned') !== 'labor_share') return
    const areaHours = typeof computeHoursForAssignment === 'function' ? computeHoursForAssignment(assignment, day, weekStartDate) : null
    const hours = areaHours ? number(areaHours[assignment.area || 'Unassigned']) : basicAssignmentHours(assignment)
    const movement = (dayData.movementLog || []).find((row) => row.builder === builder.name && (row.toArea || row.to || '').includes(assignment.area || ''))
    rows.push({
      day,
      builder: builder.name,
      line_lead: builder.isLineLead ? 'Yes' : 'No',
      labor_share_area: assignment.area || 'Unassigned',
      status: assignment.status || 'Present',
      clock_in: assignment.clockInTime || '',
      clock_out: assignment.leaveTime || '',
      labor_share_hours: round(hours),
      previous_production_area: assignment.previousProductionArea || movement?.previousProductionArea || '',
      moved_by: movement?.admin || 'System / Legacy',
    })
  })
  return rows
}

function laborAllocationSummary({ state, dayData, builderPool }) {
  const active = builderPool.filter((builder) => {
    const assignment = dayData.assignments?.[builder.id]
    return assignment && ['Present', 'Training', 'Indirect'].includes(assignment.status || 'Present')
  })
  const typeCount = (type) => active.filter((builder) => reportingAreaType(state, dayData.assignments[builder.id].area || 'Unassigned') === type).length
  const productionHC = active.filter((builder) => {
    const assignment = dayData.assignments[builder.id]
    return reportingAreaType(state, assignment.area || 'Unassigned') === 'production' && (!builder.isLineLead || builder.countsAsProductionLabor)
  }).length
  const laborShareBuilders = active.filter((builder) => reportingAreaType(state, dayData.assignments[builder.id].area || 'Unassigned') === 'labor_share')
  return {
    totalShiftHC: active.length,
    productionHC,
    laborShareHC: laborShareBuilders.length,
    laborSharedLineLeads: laborShareBuilders.filter((builder) => builder.isLineLead).length,
    lineLeads: active.filter((builder) => builder.isLineLead).length,
    supportHC: typeCount('support'),
    unassignedHC: typeCount('unassigned'),
  }
}

`
        next = next.replace(marker, helper + marker)
      }

      next = next.replace(
        'export function exportEndOfShiftExcel({ state, dayState, metrics, counts, areaCounts, totalHeadCount, rackWeight, getAssignment, activeBuilders, selectedDay, adminName }) {',
        'export function exportEndOfShiftExcel({ state, dayState, metrics, counts, areaCounts, totalHeadCount, rackWeight, getAssignment, activeBuilders, selectedDay, adminName, computeHoursForAssignment }) {'
      )
      next = next.replace(
        '  const calc = { ...opsMetrics(dayState, rackWeight, totalHeadCount, shift), ...metrics }',
        `  const allocation = laborAllocationSummary({ state, dayData: dayState, builderPool: state.builderPool || activeBuilders })
  const laborRows = laborShareRowsForDay({ state, dayData: dayState, builderPool: state.builderPool || activeBuilders, day: selectedDay, weekStartDate: state.weekStartDate, computeHoursForAssignment })
  const laborHours = laborRows.reduce((sum, row) => sum + number(row.labor_share_hours), 0)
  const reportTPHHeadcount = String(state.currentBoardId || '').startsWith('speed_') ? allocation.productionHC : totalHeadCount
  const calc = { ...opsMetrics(dayState, rackWeight, reportTPHHeadcount, shift), ...metrics }`
      )
      next = next.replace(
        "    ['Generated', new Date().toLocaleString()], ['Current Time', shift.nowLabel],",
        "    ['Total Shift HC', allocation.totalShiftHC], ['SPEED Production HC', allocation.productionHC],\n    ['Labor Share HC', allocation.laborShareHC], ['Labor-Shared Line Leads', allocation.laborSharedLineLeads],\n    ['Labor Share Hours', round(laborHours)], ['Current Time', shift.nowLabel],\n    ['Generated', new Date().toLocaleString()], ['Line Leads', allocation.lineLeads],"
      )
      next = next.replace(
        `      {
        title: 'OPERATIONS PERFORMANCE',`,
        `      {
        title: 'LABOR ALLOCATION',
        headers: ['Metric', 'Value', 'Metric', 'Value', 'Metric', 'Value', 'Metric', 'Value'],
        rows: [[
          'Total Shift HC', allocation.totalShiftHC,
          'SPEED Production HC', allocation.productionHC,
          'Labor Share HC', allocation.laborShareHC,
          'Labor-Shared Line Leads', allocation.laborSharedLineLeads,
        ], [
          'Line Leads', allocation.lineLeads,
          'Support / Indirect HC', allocation.supportHC,
          'Unassigned HC', allocation.unassignedHC,
          'Labor Share Hours', round(laborHours),
        ]],
      },
      {
        title: 'OPERATIONS PERFORMANCE',`
      )
      next = next.replace(
        "  appendDataSheet(wb, 'Attendance History', (dayState.attendanceLog || []).map((a) => ({ timestamp: a.timestamp, clock_time: a.clock_time, builder: a.builder, event: a.event, note: a.note })), { title: `${selectedDay} Attendance History`, meta, accent: COLORS.red })",
        "  appendDataSheet(wb, 'Attendance History', (dayState.attendanceLog || []).map((a) => ({ timestamp: a.timestamp, clock_time: a.clock_time, builder: a.builder, event: a.event, note: a.note })), { title: `${selectedDay} Attendance History`, meta, accent: COLORS.red })\n  appendDataSheet(wb, 'Labor Share Detail', laborRows, { title: `${selectedDay} Labor Share Detail`, subtitle: 'Builders and line leads excluded from SPEED Production HC', meta, accent: COLORS.orange })"
      )

      next = next.replace(
        `    const hc = statusCounts(dayData, builderPool)
    const shift = shiftInfo(day, state.weekStartDate, state.boardShift)
    const ops = opsMetrics(dayData, RACK_WEIGHT, hc.active, shift)`,
        `    const hc = statusCounts(dayData, builderPool)
    const allocation = laborAllocationSummary({ state, dayData, builderPool })
    const shift = shiftInfo(day, state.weekStartDate, state.boardShift)
    const dayTPHHeadcount = String(state.currentBoardId || '').startsWith('speed_') ? allocation.productionHC : hc.active
    const ops = opsMetrics(dayData, RACK_WEIGHT, dayTPHHeadcount, shift)`
      )
      next = next.replace(
        '  const allRacks = weekDays.flatMap((day) => rackRowsForDay(getDayData(day), day))',
        `  const allRacks = weekDays.flatMap((day) => rackRowsForDay(getDayData(day), day))
  const weeklyLaborRows = weekDays.flatMap((day) => laborShareRowsForDay({ state, dayData: getDayData(day), builderPool, day, weekStartDate: state.weekStartDate, computeHoursForAssignment }))
  const weeklyLaborHours = weeklyLaborRows.reduce((sum, row) => sum + number(row.labor_share_hours), 0)
  const dailyAllocation = weekDays.map((day) => ({ day, ...laborAllocationSummary({ state, dayData: getDayData(day), builderPool }) }))`
      )
      next = next.replace(
        "    ['Generated', new Date().toLocaleString()], ['Roster Size', builderPool.length],",
        "    ['Weekly Labor Share Hours', round(weeklyLaborHours)], ['Roster Size', builderPool.length],\n    ['Generated', new Date().toLocaleString()], ['Labor Share Entries', weeklyLaborRows.length],"
      )
      next = next.replace(
        `      {
        title: 'DAILY PERFORMANCE SUMMARY',`,
        `      {
        title: 'DAILY LABOR ALLOCATION',
        headers: ['Day', 'Total Shift HC', 'Production HC', 'Labor Share HC', 'Labor-Shared LL', 'Line Leads', 'Support HC', 'Unassigned HC'],
        rows: dailyAllocation.map((row) => [row.day, row.totalShiftHC, row.productionHC, row.laborShareHC, row.laborSharedLineLeads, row.lineLeads, row.supportHC, row.unassignedHC]),
      },
      {
        title: 'DAILY PERFORMANCE SUMMARY',`
      )
      next = next.replace(
        "  appendDataSheet(wb, 'Weekly Rack IDs Materials', allRacks, { title: 'Weekly Rack IDs & Material Types', subtitle: 'All processed and prepared rack entries for the week', meta, accent: COLORS.purple })",
        "  appendDataSheet(wb, 'Weekly Rack IDs Materials', allRacks, { title: 'Weekly Rack IDs & Material Types', subtitle: 'All processed and prepared rack entries for the week', meta, accent: COLORS.purple })\n  appendDataSheet(wb, 'Weekly Labor Share', weeklyLaborRows, { title: 'Weekly Labor Share Detail', subtitle: 'Labor-share hours by day, builder, and area', meta, accent: COLORS.orange })"
      )

      return next === code ? null : { code: next, map: null }
    },
  }
}
