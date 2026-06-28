import * as XLSX from 'xlsx'

function autoWidthFromJson(rows) {
  const keys = rows.length ? Object.keys(rows[0]) : ['note']
  return keys.map((key) => {
    const maxLen = Math.max(key.length, ...rows.map((row) => String(row[key] ?? '').length))
    return { wch: Math.min(Math.max(maxLen + 2, 12), 42) }
  })
}
function setCellStyle(ws, ref, style) {
  if (!ws[ref]) return
  ws[ref].s = style
}
function border(color='D1D5DB') {
  return {
    top: { style: 'thin', color: { rgb: color } },
    bottom: { style: 'thin', color: { rgb: color } },
    left: { style: 'thin', color: { rgb: color } },
    right: { style: 'thin', color: { rgb: color } },
  }
}
function paintTitle(ws, ref='A1', color='0F172A') {
  setCellStyle(ws, ref, {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 15 },
    fill: { fgColor: { rgb: color } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: border(color),
  })
}
function styleHeaderRow(ws, rowIndex = 0, color='1D4ED8') {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1')
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const ref = XLSX.utils.encode_cell({ r: rowIndex, c })
    setCellStyle(ws, ref, {
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      fill: { fgColor: { rgb: color } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: border(),
    })
  }
}
function styleDataRows(ws, startRow = 1) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1')
  ws['!freeze'] = { xSplit: 0, ySplit: startRow }
  for (let r = startRow; r <= range.e.r; r += 1) {
    for (let c = 0; c <= range.e.c; c += 1) {
      const ref = XLSX.utils.encode_cell({ r, c })
      setCellStyle(ws, ref, {
        alignment: { vertical: 'top', wrapText: true },
        fill: { fgColor: { rgb: r % 2 === 0 ? 'F8FBFF' : 'FFFFFF' } },
        border: border('E5E7EB'),
      })
    }
  }
}
function appendJsonSheet(wb, name, rows, headerColor='1D4ED8') {
  const safeRows = rows.length ? rows : [{ note: '' }]
  const ws = XLSX.utils.json_to_sheet(safeRows)
  ws['!cols'] = autoWidthFromJson(safeRows)
  styleHeaderRow(ws, 0, headerColor)
  styleDataRows(ws, 1)
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
}
function appendOverviewSheet(wb, title, rows, name='Overview', titleColor='0F172A') {
  const aoa = [[title, ''], ...rows]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 30 }, { wch: 38 }]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]
  paintTitle(ws, 'A1', titleColor)
  for (let r = 1; r < aoa.length; r += 1) {
    const left = XLSX.utils.encode_cell({ r, c: 0 })
    const right = XLSX.utils.encode_cell({ r, c: 1 })
    const fill = r % 2 === 0 ? 'EFF6FF' : 'FFFFFF'
    setCellStyle(ws, left, {
      font: { bold: true, color: { rgb: '334155' } },
      fill: { fgColor: { rgb: fill } },
      border: border('E5E7EB'),
    })
    setCellStyle(ws, right, {
      fill: { fgColor: { rgb: fill } },
      border: border('E5E7EB'),
    })
  }
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
}
function appendKpiSheet(wb, title, cards, name='KPI Summary') {
  const aoa = [[title, '', '', '']]
  const rows = []
  for (let i = 0; i < cards.length; i += 2) {
    const left = cards[i]
    const right = cards[i + 1]
    rows.push([left?.label || '', left?.value || '', right?.label || '', right?.value || ''])
  }
  aoa.push(['Metric', 'Value', 'Metric', 'Value'], ...rows)
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 24 }, { wch: 16 }]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }]
  paintTitle(ws, 'A1', '1E293B')
  styleHeaderRow(ws, 1, '2563EB')
  styleDataRows(ws, 2)
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
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
function dailyExecutiveRows({ state, selectedDay, counts, metrics, totalHeadCount }) {
  return [
    ['Board', state.boardTitle],
    ['Day', selectedDay],
    ['Headcount', `${totalHeadCount} total, ${counts.present} present, ${counts.staffed} staffed, ${counts.lineLeads || 0} line leads`],
    ['TPH', `Goal ${metrics.targetTPH.toFixed(2)} | Required live ${metrics.requiredTPH.toFixed(2)}`],
    ['Recovery', `Goal ${metrics.recoveryGoal || 0} | Processed ${metrics.recoveryProcessed || 0}`],
    ['Racks To Prep', `${metrics.rackPrepGoal || 0}`],
    ['Recovered + Prepped', `${metrics.rackPrepOutput.toFixed(2)}`],
    ['Media', `Goal ${metrics.mediaGoal || 0} | Processed ${metrics.mediaProcessed || 0}`],
    ['Remaining Work', metrics.remainingWork.toFixed(1)],
  ]
}
export function exportEndOfShiftExcel({
  state, dayState, metrics, counts, areaCounts, totalHeadCount, shiftHours, rackWeight, getAssignment, activeBuilders, selectedDay,
}) {
  const wb = XLSX.utils.book_new()

  appendOverviewSheet(wb, `Executive Day Report - ${selectedDay}`, dailyExecutiveRows({ state, selectedDay, counts, metrics, totalHeadCount }), 'Executive Summary', '1E293B')
  appendKpiSheet(wb, `TPH / Goal / Headcount Dashboard - ${selectedDay}`, [
    { label: 'Total Head Count', value: totalHeadCount },
    { label: 'Present', value: counts.present },
    { label: 'Staffed', value: counts.staffed },
    { label: 'Line Leads', value: counts.lineLeads || 0 },
    { label: 'Goal TPH', value: Number(metrics.targetTPH.toFixed(2)) },
    { label: 'Required TPH Live', value: Number(metrics.requiredTPH.toFixed(2)) },
    { label: 'Recovery Goal', value: Number(metrics.recoveryGoal || 0) },
    { label: 'Racks Processed', value: Number(metrics.recoveryProcessed || 0) },
    { label: 'Recovered + Prepped', value: Number(metrics.rackPrepOutput.toFixed(2)) },
    { label: 'Media Goal', value: Number(metrics.mediaGoal || 0) },
    { label: 'Media Processed', value: Number(metrics.mediaProcessed || 0) },
    { label: 'Remaining Work', value: Number(metrics.remainingWork.toFixed(2)) },
  ], 'KPI Dashboard')

  appendOverviewSheet(wb, `Operations Overview - ${selectedDay}`, [
    ['Weekly Staffing Board', state.boardTitle],
    ['Week Start', state.weekStartDate],
    ['Day', selectedDay],
    ['Shift', state.boardShift],
    ['Admin', state.adminName || state.boardLead || 'Not set'],
    ['Last Update', dayState.updatedAt || ''],
    ['Total Head Count', totalHeadCount],
    ['Present', counts.present],
    ['Training', counts.training],
    ['Indirect', counts.indirect],
    ['PTO', counts.pto],
    ['LOA', counts.loa],
    ['VTO', counts.vto],
    ['Absent', counts.absent],
    ['Unassigned', counts.unassigned],
    ['Line Leads', counts.lineLeads || 0],
    ['Goal TPH', Number(metrics.targetTPH.toFixed(2))],
    ['Required TPH Live', Number(metrics.requiredTPH.toFixed(2))],
    ['Remaining Work', Number(metrics.remainingWork.toFixed(2))],
    ['Recovery Goal', Number(metrics.recoveryGoal || 0)],
    ['Racks Processed', Number(metrics.recoveryProcessed || 0)],
    ['Racks To Prep Goal', Number(metrics.rackPrepGoal || 0)],
    ['Recovered + Prepped', Number(metrics.rackPrepOutput.toFixed(2))],
    ['Media Goal', Number(metrics.mediaGoal || 0)],
    ['Media Processed', Number(metrics.mediaProcessed || 0)],
    ['Paid Shift Hours', shiftHours],
    ['Rack Weight', rackWeight],
  ], 'Overview', '2563EB')

  appendJsonSheet(wb, 'People', activeBuilders.map((b) => {
    const a = getAssignment(b.id)
    const profile = state.builderPool.find((p) => p.id === b.id) || {}
    return {
      builder: b.name,
      badge_type: profile.badgeType || 'day',
      skills_roles: [
        profile.trainedTdr ? 'TDR' : '',
        profile.trainedForklift ? 'Forklift' : '',
        profile.trainedCenterRider ? 'Center Rider' : '',
        profile.trainedClampTruck ? 'Clamp Truck' : '',
        profile.isTrainer ? 'Trainer' : '',
        profile.isSafetyMember ? 'Safety' : '',
        profile.isLineLead ? 'Line Lead' : '',
      ].filter(Boolean).join(', '),
      status: a.status || 'Present',
      area: a.area || 'Unassigned',
      clock_in_time: a.clockInTime || '',
      leave_time: a.leaveTime || '',
      sub_area: a.subArea || '',
      role: a.role || '',
      comment: a.comment || '',
      builder_notes: a.builderNotes || '',
      updated_at: a.updatedAt || '',
    }
  }), '0EA5E9')

  appendJsonSheet(wb, 'TPH Detail', [{
    goal_tph: Number(metrics.targetTPH.toFixed(2)),
    required_tph_live: Number(metrics.requiredTPH.toFixed(2)),
    remaining_work: Number(metrics.remainingWork.toFixed(2)),
    recovery_goal: Number(metrics.recoveryGoal || 0),
    racks_processed: Number(metrics.recoveryProcessed || 0),
    racks_to_prep_goal: Number(metrics.rackPrepGoal || 0),
    recovered_and_prepped_sum: Number(metrics.rackPrepOutput.toFixed(2)),
    media_goal: Number(metrics.mediaGoal || 0),
    media_processed: Number(metrics.mediaProcessed || 0),
    completed_workload: Number(metrics.completedWorkload.toFixed(2)),
    total_head_count: totalHeadCount,
  }], '7C3AED')

  appendJsonSheet(wb, 'Area Summary', areaCounts.map((a) => ({
    area: a.name,
    count: a.count,
    capacity: a.capacity || '',
    note: a.note || '',
  })), '059669')

  appendJsonSheet(wb, 'Movement History', (dayState.movementLog || []).map((m) => ({
    timestamp: m.timestamp,
    builder: m.builder,
    from_area: m.fromArea,
    to_area: m.toArea,
    from_status: m.fromStatus,
    to_status: m.toStatus,
    notes: m.notes,
  })), 'F59E0B')

  appendJsonSheet(wb, 'Attendance History', (dayState.attendanceLog || []).map((a) => ({
    timestamp: a.timestamp,
    clock_time: a.clock_time,
    builder: a.builder,
    event: a.event,
    note: a.note,
  })), 'DC2626')

  appendSnapshotSheet(wb, 'Q1 Snapshot', dayState.snapshots?.q1, '2563EB')
  appendSnapshotSheet(wb, 'Q2 Snapshot', dayState.snapshots?.q2, '7C3AED')
  appendSnapshotSheet(wb, 'Q3 Snapshot', dayState.snapshots?.q3, '059669')

  XLSX.writeFile(wb, `end-of-shift-${state.weekStartDate}-${selectedDay}.xlsx`)
}

export function exportWeeklyExcel({ state, weekDays, getDayData, builderPool, computeHoursForAssignment, areaDefs }) {
  const wb = XLSX.utils.book_new()

  appendOverviewSheet(wb, 'Weekly Executive Report', [
    ['Board', state.boardTitle],
    ['Week Start', state.weekStartDate],
    ['Shift', state.boardShift],
    ['Admin', state.adminName || state.boardLead || 'Not set'],
    ['Master Roster Size', builderPool.length],
    ['Days Included', weekDays.join(', ')],
  ], 'Weekly Summary', '1E293B')

  weekDays.forEach((day) => {
    const dayData = getDayData(day)
    const activeBuilders = builderPool.filter((b) => dayData.assignments[b.id])
    appendJsonSheet(wb, `${day} Staff`, activeBuilders.map((builder) => {
      const a = dayData.assignments[builder.id]
      return {
        builder: builder.name,
        badge_type: builder.badgeType || 'day',
        skills_roles: [
          builder.trainedTdr ? 'TDR' : '',
          builder.trainedForklift ? 'Forklift' : '',
          builder.trainedCenterRider ? 'Center Rider' : '',
          builder.trainedClampTruck ? 'Clamp Truck' : '',
          builder.isTrainer ? 'Trainer' : '',
          builder.isSafetyMember ? 'Safety' : '',
          builder.isLineLead ? 'Line Lead' : '',
        ].filter(Boolean).join(', '),
        status: a.status || 'Present',
        area: a.area || 'Unassigned',
        clock_in_time: a.clockInTime || '',
        leave_time: a.leaveTime || '',
        sub_area: a.subArea || '',
        role: a.role || '',
        comment: a.comment || '',
        notes: a.builderNotes || '',
      }
    }), '0EA5E9')

    appendJsonSheet(wb, `${day} TPH`, [{
      recovery_goal: Number(dayData.opsMetrics?.targetRackMediaRecovery || 0),
      racks_processed: Number(dayData.opsMetrics?.racksProcessed || 0),
      rack_prep_goal: Number(dayData.opsMetrics?.targetRackPrep || 0),
      racks_prepped: Number(dayData.opsMetrics?.racksPrepped || 0),
      recovered_in_rack_prep: Number(dayData.opsMetrics?.recoveredRackPrep || 0),
      media_goal: Number(dayData.opsMetrics?.totalMediaCount || 0),
      media_processed: Number(dayData.opsMetrics?.mediaProcessed || 0),
      updated_at: dayData.updatedAt || '',
    }], '7C3AED')

    appendSnapshotSheet(wb, `${day} Q1`, dayData.snapshots?.q1, '2563EB')
    appendSnapshotSheet(wb, `${day} Q2`, dayData.snapshots?.q2, '7C3AED')
    appendSnapshotSheet(wb, `${day} Q3`, dayData.snapshots?.q3, '059669')
  })

  const weeklyHours = []
  builderPool.forEach((builder) => {
    weekDays.forEach((day) => {
      const a = getDayData(day).assignments[builder.id]
      if (!a) return
      const totals = computeHoursForAssignment(a, day, state.weekStartDate)
      Object.entries(totals).forEach(([area, hours]) => {
        weeklyHours.push({
          builder: builder.name,
          day,
          area,
          hours: Number(hours.toFixed(2)),
        })
      })
    })
  })
  appendJsonSheet(wb, 'Weekly Hours by Area', weeklyHours, '059669')

  const areaSummary = []
  weekDays.forEach((day) => {
    const dayData = getDayData(day)
    areaDefs.forEach((area) => {
      const count = builderPool.filter((b) => {
        const a = dayData.assignments[b.id]
        if (!a) return false
        return (a.area || 'Unassigned') === area.name && ['Present','Training','Indirect'].includes(a.status || 'Present') && !b.isLineLead
      }).length
      areaSummary.push({ day, area: area.name, count })
    })
  })
  appendJsonSheet(wb, 'Area Counts by Day', areaSummary, 'F59E0B')

  XLSX.writeFile(wb, `weekly-staffing-board-${state.weekStartDate}.xlsx`)
}
