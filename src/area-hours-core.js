const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const ACTIVE_STATUSES = new Set(['Present', 'Training', 'Indirect'])
const PAID_SHIFT_HOURS = 8
const DEPENDENCY_WARNING_PERCENT = 50

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0
const round = (value, digits = 2) => {
  const power = 10 ** digits
  return Math.round(number(value) * power) / power
}
const clean = (value) => String(value ?? '').trim()
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value))
const activeStatus = (status) => ACTIVE_STATUSES.has(status || 'Present')

function dayDate(weekStartDate, day) {
  const date = new Date(`${weekStartDate}T00:00:00`)
  const index = Math.max(0, WEEKDAYS.indexOf(day))
  date.setDate(date.getDate() + index)
  return date
}

function dateKey(weekStartDate, day) {
  const date = dayDate(weekStartDate, day)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

function isNightShift(shift) {
  return clean(shift).toLowerCase().includes('night')
}

function shiftWindow(weekStartDate, day, shift) {
  const start = dayDate(weekStartDate, day)
  const end = dayDate(weekStartDate, day)
  if (isNightShift(shift)) {
    start.setHours(17, 0, 0, 0)
    end.setDate(end.getDate() + 1)
    end.setHours(1, 30, 0, 0)
  } else {
    start.setHours(8, 0, 0, 0)
    end.setHours(16, 30, 0, 0)
  }
  return { start, end, paidHours: PAID_SHIFT_HOURS }
}

function dateAtTime(weekStartDate, day, shift, value, fallbackDate = null) {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return fallbackDate
  const date = dayDate(weekStartDate, day)
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (isNightShift(shift) && hour < 12) date.setDate(date.getDate() + 1)
  date.setHours(hour, minute, 0, 0)
  return date
}

function parseDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function hoursBetween(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date)) return 0
  return round(Math.max(0, (end.getTime() - start.getTime()) / 3_600_000), 4)
}

function areaType(areaDefs, name) {
  const areaName = clean(name) || 'Unassigned'
  const explicit = (areaDefs || []).find((area) => clean(area.name) === areaName)?.areaType
  if (explicit) return explicit
  const value = areaName.toLowerCase()
  if (value === 'unassigned') return 'unassigned'
  if (value === 'fa' || value === 'fa metal removal') return 'labor_share'
  if (['shipping', 'eos pull racks', 'projects', 'learning', '1:1'].includes(value)) return 'support'
  return 'production'
}

function builderSkills(builder) {
  return [
    builder.trainedTdr && 'TDR',
    builder.trainedForklift && 'Forklift',
    builder.trainedCenterRider && 'Center Rider',
    builder.trainedClampTruck && 'Clamp Truck',
    builder.trainedRackMover && 'Rack Mover',
    builder.trainedReachTruck && 'Reach Truck',
    builder.isTrainer && 'Trainer',
    builder.isSafetyMember && 'Safety',
    builder.isLineLead && 'Line Lead',
  ].filter(Boolean)
}

function closureFor(state, day) {
  const boardId = clean(state.currentBoardId || 'speed_day')
  const operationId = boardId.replace(/_(day|night)$/i, '')
  const record = state.dayClosures?.[operationId]?.[state.weekStartDate]?.[day]
  if (!record) return null
  if (record.entireDay?.closed) return { ...record.entireDay, scope: 'Entire Day' }
  const selected = isNightShift(state.boardShift) ? record.nightShift : record.dayShift
  return selected?.closed ? { ...selected, scope: isNightShift(state.boardShift) ? 'Night Shift' : 'Day Shift' } : null
}

function snapshotAssignment(snapshot, builderId) {
  if (!snapshot || typeof snapshot !== 'object') return null
  return snapshot.assignments?.[builderId]
    || snapshot.staffing?.assignments?.[builderId]
    || snapshot.board?.assignments?.[builderId]
    || snapshot[builderId]
    || null
}

function speedLiteTeam(dayData, assignment) {
  const id = clean(assignment?.speedLiteTeamId)
  if (!id) return ''
  return (dayData.speedLiteTeams || []).find((team) => clean(team.id) === id)?.name || id
}

function warningRow(code, severity, details = {}) {
  return {
    severity,
    code,
    board_id: details.boardId || '',
    shift: details.shift || '',
    week_start_date: details.weekStartDate || '',
    operational_day: details.day || '',
    builder_id: details.builderId || '',
    builder: details.builder || '',
    area: details.area || '',
    record_id: details.recordId || '',
    issue: details.issue || code,
    recommended_action: details.action || 'Review the source record before relying on the affected hours.',
  }
}

function baseSession(context, values = {}) {
  const { state, dayData, assignment, builder, day, weekStartDate, areaDefs } = context
  const area = clean(values.area || assignment.area) || 'Unassigned'
  return {
    builder_id: builder.id,
    builder: builder.name,
    badge_type: builder.badgeType || 'day',
    board_id: state.currentBoardId || '',
    board: state.boardTitle || '',
    shift: state.boardShift || '',
    week_start_date: weekStartDate,
    operational_day: day,
    calendar_date: dateKey(weekStartDate, day),
    operating_status: closureFor({ ...state, weekStartDate }, day) ? 'Closed' : 'Open',
    area,
    area_type: areaType(areaDefs, area),
    sub_area: values.subArea || assignment.subArea || '',
    speed_lite_team: values.speedLiteTeam || speedLiteTeam(dayData, assignment),
    role: values.role || assignment.role || '',
    status: assignment.status || 'Present',
    line_lead: builder.isLineLead ? 'Yes' : 'No',
    production_labor: (!builder.isLineLead || builder.countsAsProductionLabor) ? 'Yes' : 'No',
    start_time: values.start ? values.start.toISOString() : '',
    end_time: values.end ? values.end.toISOString() : '',
    calculated_hours: round(values.hours),
    calculation_source: values.source || 'Estimated from Assignment',
    accuracy: values.accuracy || 'Estimated',
    snapshot_context: values.snapshotContext || '',
    record_id: values.recordId || '',
    admin: values.admin || assignment.updatedBy || dayData.updatedBy || state.adminName || '',
    updated_at: values.updatedAt || assignment.updatedAt || dayData.updatedAt || '',
    notes: values.notes || assignment.comment || assignment.builderNotes || '',
    valid: values.valid === false ? 'No' : 'Yes',
    issue: values.issue || '',
    _start_ms: values.start?.getTime?.() || null,
    _end_ms: values.end?.getTime?.() || null,
    _builder: builder,
  }
}

function normalizeExactSessions(rawSessions, context, warnings) {
  const unique = new Set()
  const sorted = rawSessions
    .map((session, index) => {
      const start = parseDate(session.startIso || session.start || session.startedAt)
      const end = parseDate(session.endIso || session.end || session.endedAt)
      return { session, index, start, end }
    })
    .sort((a, b) => (a.start?.getTime?.() || 0) - (b.start?.getTime?.() || 0))

  const accepted = []
  let previousEnd = null
  sorted.forEach(({ session, index, start, end }) => {
    const area = clean(session.area || session.toArea || session.assignmentArea) || 'Unassigned'
    const recordId = clean(session.id || session.sessionId || session.movementId) || `area-session-${context.builder.id}-${context.day}-${index + 1}`
    if (!start || !end) {
      warnings.push(warningRow('MISSING_SESSION_TIME', 'Warning', { ...context, builderId: context.builder.id, builder: context.builder.name, area, recordId, issue: 'Area session is missing a valid start or end time.' }))
      return
    }
    if (end.getTime() <= start.getTime()) {
      warnings.push(warningRow('END_BEFORE_START', 'High', { ...context, builderId: context.builder.id, builder: context.builder.name, area, recordId, issue: 'Area session end time is not after its start time.' }))
      return
    }
    const duplicateKey = `${area}|${start.toISOString()}|${end.toISOString()}`
    if (unique.has(duplicateKey)) {
      warnings.push(warningRow('DUPLICATE_SESSION', 'Warning', { ...context, builderId: context.builder.id, builder: context.builder.name, area, recordId, issue: 'Duplicate area session was excluded from totals.' }))
      return
    }
    unique.add(duplicateKey)
    let adjustedStart = start
    if (previousEnd && adjustedStart.getTime() < previousEnd.getTime()) {
      warnings.push(warningRow('OVERLAPPING_SESSION', 'High', { ...context, builderId: context.builder.id, builder: context.builder.name, area, recordId, issue: 'Overlapping area time was trimmed and excluded from duplicate totals.' }))
      adjustedStart = new Date(previousEnd)
    }
    if (end.getTime() <= adjustedStart.getTime()) return
    accepted.push(baseSession(context, {
      area,
      subArea: session.subArea,
      role: session.role,
      start: adjustedStart,
      end,
      hours: hoursBetween(adjustedStart, end),
      source: session.source || 'Area Movement History',
      accuracy: 'Exact',
      recordId,
      admin: session.admin || session.updatedBy,
      updatedAt: session.updatedAt || session.endIso || session.end,
      notes: session.note || session.notes,
    }))
    previousEnd = !previousEnd || end > previousEnd ? end : previousEnd
  })

  const total = accepted.reduce((sum, row) => sum + row.calculated_hours, 0)
  if (total > PAID_SHIFT_HOURS) {
    const overage = round(total - PAID_SHIFT_HOURS, 4)
    const largest = accepted.reduce((best, row) => !best || row.calculated_hours > best.calculated_hours ? row : best, null)
    if (largest) largest.calculated_hours = round(Math.max(0, largest.calculated_hours - overage))
    warnings.push(warningRow(total <= 8.5 ? 'UNPAID_BREAK_DEDUCTED' : 'HOURS_EXCEED_SHIFT', total <= 8.5 ? 'Info' : 'High', {
      ...context,
      builderId: context.builder.id,
      builder: context.builder.name,
      issue: total <= 8.5
        ? 'The 30-minute unpaid break was deducted once from exact session totals.'
        : `Recorded sessions exceeded the normal paid shift and were capped at ${PAID_SHIFT_HOURS} hours.`,
    }))
  }
  return accepted.filter((row) => row.calculated_hours > 0)
}

function snapshotSessions(context) {
  const { dayData, builder, assignment } = context
  const snapshotKeys = ['q1', 'q2', 'q3']
  const rows = snapshotKeys.flatMap((key) => {
    const snap = snapshotAssignment(dayData.snapshots?.[key], builder.id)
    const area = clean(snap?.area)
    if (!area || area === 'Unassigned' || !activeStatus(snap?.status || assignment.status)) return []
    return [baseSession(context, {
      area,
      subArea: snap.subArea,
      role: snap.role,
      hours: PAID_SHIFT_HOURS / snapshotKeys.length,
      source: 'Snapshot Transition',
      accuracy: 'Estimated',
      snapshotContext: key.toUpperCase(),
      recordId: `snapshot-${builder.id}-${context.day}-${key}`,
      updatedAt: dayData.snapshots?.[key]?.capturedAt || dayData.snapshots?.[key]?.timestamp || '',
    })]
  })
  return rows.map((row) => ({ ...row, calculated_hours: round(row.calculated_hours) }))
}

function importedSessions(context) {
  const imported = context.assignment.importedAreaHours || context.assignment.areaHours
  if (!imported || typeof imported !== 'object' || Array.isArray(imported)) return []
  return Object.entries(imported).flatMap(([area, hours], index) => number(hours) > 0 ? [baseSession(context, {
    area,
    hours,
    source: 'Imported Historical Record',
    accuracy: 'Estimated',
    recordId: `imported-${context.builder.id}-${context.day}-${index + 1}`,
  })] : [])
}

function fallbackSession(context) {
  const { assignment, weekStartDate, day, state } = context
  if (!activeStatus(assignment.status)) return []
  const area = clean(assignment.area) || 'Unassigned'
  const window = shiftWindow(weekStartDate, day, state.boardShift)
  const start = dateAtTime(weekStartDate, day, state.boardShift, assignment.clockInTime, window.start)
  const end = dateAtTime(weekStartDate, day, state.boardShift, assignment.leaveTime, window.end)
  let elapsed = hoursBetween(start, end)
  if (elapsed <= 0) elapsed = PAID_SHIFT_HOURS
  const hours = Math.min(PAID_SHIFT_HOURS, elapsed)
  const hasClock = Boolean(clean(assignment.clockInTime) || clean(assignment.leaveTime))
  return [baseSession(context, {
    area,
    start: hasClock ? start : null,
    end: hasClock ? end : null,
    hours,
    source: hasClock ? 'Clock In / Clock Out' : 'Estimated from Assignment',
    accuracy: 'Estimated',
    recordId: `assignment-${context.builder.id}-${day}`,
  })]
}

function assignmentExpectedHours(context, sessions) {
  const { assignment, weekStartDate, day, state } = context
  if (clean(assignment.clockInTime) || clean(assignment.leaveTime)) {
    const window = shiftWindow(weekStartDate, day, state.boardShift)
    const start = dateAtTime(weekStartDate, day, state.boardShift, assignment.clockInTime, window.start)
    const end = dateAtTime(weekStartDate, day, state.boardShift, assignment.leaveTime, window.end)
    const elapsed = hoursBetween(start, end)
    return round(Math.min(PAID_SHIFT_HOURS, elapsed || PAID_SHIFT_HOURS))
  }
  return round(Math.min(PAID_SHIFT_HOURS, sessions.reduce((sum, row) => sum + number(row.calculated_hours), 0)))
}

function buildAssignmentSessions(context, warnings, expectedHours) {
  const { assignment } = context
  if (!assignment || !activeStatus(assignment.status)) return []
  let sessions = []
  if (Array.isArray(assignment.areaHistory) && assignment.areaHistory.length) {
    sessions = normalizeExactSessions(assignment.areaHistory, context, warnings)
  }
  if (!sessions.length) sessions = importedSessions(context)
  if (!sessions.length) sessions = snapshotSessions(context)
  if (!sessions.length) sessions = fallbackSession(context)
  const expected = assignmentExpectedHours(context, sessions)
  expectedHours.set(`${context.builder.id}|${context.day}`, expected)
  return sessions
}

function aggregateBuilderAreas(validSessions) {
  const map = new Map()
  validSessions.forEach((session) => {
    const key = `${session.builder_id}|${session.area}`
    const row = map.get(key) || {
      builder_id: session.builder_id,
      builder: session.builder,
      badge_type: session.badge_type,
      shift: session.shift,
      area: session.area,
      area_type: session.area_type,
      total_hours: 0,
      exact_hours: 0,
      estimated_hours: 0,
      days: new Set(),
      sessions: 0,
      first_worked_date: session.calendar_date,
      most_recent_worked_date: session.calendar_date,
      line_lead: session.line_lead,
      trainer: session._builder?.isTrainer ? 'Yes' : 'No',
      safety: session._builder?.isSafetyMember ? 'Yes' : 'No',
      skills: builderSkills(session._builder || {}).join(', '),
      warning_count: 0,
    }
    row.total_hours += number(session.calculated_hours)
    if (session.accuracy === 'Exact') row.exact_hours += number(session.calculated_hours)
    else row.estimated_hours += number(session.calculated_hours)
    row.days.add(session.operational_day)
    row.sessions += 1
    if (session.calendar_date < row.first_worked_date) row.first_worked_date = session.calendar_date
    if (session.calendar_date > row.most_recent_worked_date) row.most_recent_worked_date = session.calendar_date
    map.set(key, row)
  })
  return [...map.values()].map((row) => ({
    ...row,
    total_hours: round(row.total_hours),
    exact_hours: round(row.exact_hours),
    estimated_hours: round(row.estimated_hours),
    days_worked: row.days.size,
    average_hours_per_day: round(row.total_hours / Math.max(1, row.days.size)),
    _days: row.days,
  }))
}

function rankAreaRows(builderAreaRows, warnings) {
  const byArea = new Map()
  builderAreaRows.filter((row) => row.area !== 'Unassigned').forEach((row) => {
    if (!byArea.has(row.area)) byArea.set(row.area, [])
    byArea.get(row.area).push(row)
  })
  const ranked = []
  byArea.forEach((rows, area) => {
    const areaHours = rows.reduce((sum, row) => sum + row.total_hours, 0)
    rows.sort((a, b) => b.total_hours - a.total_hours
      || b.days_worked - a.days_worked
      || b.most_recent_worked_date.localeCompare(a.most_recent_worked_date)
      || a.builder.localeCompare(b.builder))
    let rank = 0
    let previousKey = ''
    rows.forEach((row) => {
      const tieKey = `${row.total_hours.toFixed(2)}|${row.days_worked}`
      if (tieKey !== previousKey) rank += 1
      previousKey = tieKey
      ranked.push({
        rank,
        area,
        area_type: row.area_type,
        builder_id: row.builder_id,
        builder: row.builder,
        badge_type: row.badge_type,
        shift: row.shift,
        total_hours: row.total_hours,
        area_hours_percentage: areaHours > 0 ? row.total_hours / areaHours : 0,
        days_worked: row.days_worked,
        average_hours_per_day: row.average_hours_per_day,
        session_count: row.sessions,
        first_worked_date: row.first_worked_date,
        most_recent_worked_date: row.most_recent_worked_date,
        exact_hours: row.exact_hours,
        estimated_hours: row.estimated_hours,
        primary_area: 'No',
        line_lead: row.line_lead,
        trainer: row.trainer,
        safety: row.safety,
        relevant_skills: row.skills,
        data_quality_warning_count: warnings.filter((warning) => warning.builder_id === row.builder_id && warning.area === area).length,
      })
    })
  })
  return ranked
}

function builderSummaries(builderAreaRows, warnings, expectedHours, sessions) {
  const builderIds = [...new Set(builderAreaRows.map((row) => row.builder_id))]
  return builderIds.map((builderId) => {
    const rows = builderAreaRows.filter((row) => row.builder_id === builderId)
    const validAreas = rows.filter((row) => row.area !== 'Unassigned')
    const sorted = [...validAreas].sort((a, b) => b.total_hours - a.total_hours
      || b.days_worked - a.days_worked
      || b.most_recent_worked_date.localeCompare(a.most_recent_worked_date)
      || a.area.localeCompare(b.area))
    const allSessions = sessions.filter((row) => row.builder_id === builderId)
    const totalAssigned = rows.reduce((sum, row) => sum + row.total_hours, 0)
    const totalActive = validAreas.reduce((sum, row) => sum + row.total_hours, 0)
    const expected = [...expectedHours.entries()].filter(([key]) => key.startsWith(`${builderId}|`)).reduce((sum, [, value]) => sum + value, 0)
    const first = [...allSessions].sort((a, b) => a.calendar_date.localeCompare(b.calendar_date))[0]
    const recent = [...allSessions].sort((a, b) => b.calendar_date.localeCompare(a.calendar_date))[0]
    const primary = sorted[0]
    const second = sorted[1]
    const third = sorted[2]
    return {
      builder_id: builderId,
      builder: rows[0]?.builder || '',
      badge_type: rows[0]?.badge_type || '',
      shift: rows[0]?.shift || '',
      total_assigned_hours: round(totalAssigned),
      total_active_hours: round(totalActive),
      total_production_hours: round(rows.filter((row) => row.area_type === 'production').reduce((sum, row) => sum + row.total_hours, 0)),
      total_support_hours: round(rows.filter((row) => row.area_type === 'support').reduce((sum, row) => sum + row.total_hours, 0)),
      total_labor_share_hours: round(rows.filter((row) => row.area_type === 'labor_share').reduce((sum, row) => sum + row.total_hours, 0)),
      total_unassigned_hours: round(rows.filter((row) => row.area === 'Unassigned').reduce((sum, row) => sum + row.total_hours, 0)),
      number_of_areas_worked: validAreas.length,
      primary_area: primary?.area || (rows.length ? 'Unassigned' : ''),
      primary_area_hours: primary?.total_hours || 0,
      primary_area_percentage: totalActive > 0 ? number(primary?.total_hours) / totalActive : 0,
      second_area: second?.area || '',
      second_area_hours: second?.total_hours || 0,
      third_area: third?.area || '',
      third_area_hours: third?.total_hours || 0,
      operational_days_worked: new Set(validAreas.flatMap((row) => [...row._days])).size,
      average_active_hours_per_day: round(totalActive / Math.max(1, new Set(validAreas.flatMap((row) => [...row._days])).size)),
      area_movements: Math.max(0, allSessions.length - new Set(allSessions.map((row) => row.operational_day)).size),
      most_recent_area: recent?.area || '',
      first_recorded_area: first?.area || '',
      exact_hours: round(rows.reduce((sum, row) => sum + row.exact_hours, 0)),
      estimated_hours: round(rows.reduce((sum, row) => sum + row.estimated_hours, 0)),
      data_quality_warning_count: warnings.filter((warning) => warning.builder_id === builderId && !['Info'].includes(warning.severity)).length,
      expected_paid_hours: round(expected),
      area_hours_difference: round(totalAssigned - expected),
    }
  }).sort((a, b) => b.total_active_hours - a.total_active_hours || a.builder.localeCompare(b.builder))
}

function addReconciliationWarnings(builderSummary, warnings, context) {
  builderSummary.filter((row) => Math.abs(row.area_hours_difference) >= 0.01).forEach((row) => {
    warnings.push(warningRow('AREA_HOURS_RECONCILIATION', 'Warning', {
      ...context,
      builderId: row.builder_id,
      builder: row.builder,
      issue: `Area hours differ from expected paid hours by ${row.area_hours_difference.toFixed(2)} hours.`,
      action: 'Review clock times and area-history sessions for gaps or overlaps.',
    }))
  })
}

function areaSummaries(areaDefs, builderAreaRows, leaderboards, sessions, warnings, dependencyPercent) {
  const names = [...new Set([...(areaDefs || []).map((area) => area.name), ...builderAreaRows.map((row) => row.area)])]
  return names.map((area) => {
    const rows = builderAreaRows.filter((row) => row.area === area)
    const leaders = leaderboards.filter((row) => row.area === area).sort((a, b) => a.rank - b.rank || b.total_hours - a.total_hours)
    const areaSessions = sessions.filter((row) => row.area === area)
    const total = rows.reduce((sum, row) => sum + row.total_hours, 0)
    const perDay = new Map()
    areaSessions.forEach((row) => {
      if (!perDay.has(row.operational_day)) perDay.set(row.operational_day, new Set())
      perDay.get(row.operational_day).add(row.builder_id)
    })
    const dailyCounts = [...perDay.values()].map((set) => set.size)
    const definition = (areaDefs || []).find((item) => item.name === area) || {}
    const top = leaders[0]
    const dependency = total > 0 ? number(top?.total_hours) / total : 0
    if (dependency * 100 > dependencyPercent && top) {
      warnings.push(warningRow('SINGLE_BUILDER_DEPENDENCY', 'Warning', {
        area,
        issue: `High dependency: ${top.builder} represents ${round(dependency * 100, 1)}% of ${area} hours.`,
        action: 'Review rotation and cross-training coverage for this area.',
      }))
    }
    return {
      area,
      area_type: rows[0]?.area_type || areaType(areaDefs, area),
      total_hours: round(total),
      production_hours: round(areaSessions.filter((row) => row.area_type === 'production' && row.production_labor === 'Yes').reduce((sum, row) => sum + row.calculated_hours, 0)),
      labor_share_hours: round(areaSessions.filter((row) => row.area_type === 'labor_share').reduce((sum, row) => sum + row.calculated_hours, 0)),
      support_hours: round(areaSessions.filter((row) => row.area_type === 'support').reduce((sum, row) => sum + row.calculated_hours, 0)),
      unique_builders: rows.length,
      worked_days: perDay.size,
      average_hours_per_builder: round(total / Math.max(1, rows.length)),
      average_daily_headcount: round(dailyCounts.reduce((sum, value) => sum + value, 0) / Math.max(1, dailyCounts.length)),
      maximum_daily_headcount: dailyCounts.length ? Math.max(...dailyCounts) : 0,
      minimum_staffed_headcount: dailyCounts.length ? Math.min(...dailyCounts) : 0,
      capacity: definition.capacity || '',
      utilization_percentage: number(definition.capacity) > 0 && dailyCounts.length ? (dailyCounts.reduce((sum, value) => sum + value, 0) / dailyCounts.length) / number(definition.capacity) : '',
      top_builder: top?.builder || '',
      top_builder_hours: top?.total_hours || 0,
      top_builder_percentage: dependency,
      second_ranked_builder: leaders.find((row) => row.rank === 2)?.builder || '',
      third_ranked_builder: leaders.find((row) => row.rank === 3)?.builder || '',
      line_lead_hours: round(areaSessions.filter((row) => row.line_lead === 'Yes').reduce((sum, row) => sum + row.calculated_hours, 0)),
      trainer_hours: round(areaSessions.filter((row) => row._builder?.isTrainer).reduce((sum, row) => sum + row.calculated_hours, 0)),
      safety_member_hours: round(areaSessions.filter((row) => row._builder?.isSafetyMember).reduce((sum, row) => sum + row.calculated_hours, 0)),
      exact_hour_percentage: total > 0 ? rows.reduce((sum, row) => sum + row.exact_hours, 0) / total : 0,
      estimated_hour_percentage: total > 0 ? rows.reduce((sum, row) => sum + row.estimated_hours, 0) / total : 0,
      skill_coverage_status: areaSessions.some((row) => builderSkills(row._builder || {}).length) ? 'Covered' : total > 0 ? 'No Qualified Coverage Recorded' : 'No Hours Recorded',
      dependency_warning: dependency * 100 > dependencyPercent ? 'High Dependency' : '',
      data_quality_warning_count: warnings.filter((warning) => warning.area === area && warning.severity !== 'Info').length,
    }
  }).sort((a, b) => b.total_hours - a.total_hours || a.area.localeCompare(b.area))
}

function areaDailyTrend(validSessions, areaDefs) {
  const map = new Map()
  validSessions.filter((row) => row.area !== 'Unassigned').forEach((row) => {
    const key = `${row.area}|${row.operational_day}`
    const item = map.get(key) || { area: row.area, area_type: row.area_type, operational_day: row.operational_day, total_hours: 0, builders: new Map() }
    item.total_hours += row.calculated_hours
    item.builders.set(row.builder, (item.builders.get(row.builder) || 0) + row.calculated_hours)
    map.set(key, item)
  })
  return [...map.values()].map((row) => {
    const sorted = [...row.builders.entries()].sort((a, b) => b[1] - a[1])
    const capacity = (areaDefs || []).find((area) => area.name === row.area)?.capacity || ''
    return {
      area: row.area,
      area_type: row.area_type,
      operational_day: row.operational_day,
      total_hours: round(row.total_hours),
      unique_builders: row.builders.size,
      average_headcount: round(row.total_hours / PAID_SHIFT_HOURS),
      top_builder: sorted[0]?.[0] || '',
      top_builder_hours: round(sorted[0]?.[1] || 0),
      capacity,
      utilization_percentage: number(capacity) > 0 ? (row.total_hours / PAID_SHIFT_HOURS) / number(capacity) : '',
      coverage_status: row.total_hours > 0 ? 'Covered' : 'No Hours Recorded',
    }
  }).sort((a, b) => WEEKDAYS.indexOf(a.operational_day) - WEEKDAYS.indexOf(b.operational_day) || a.area.localeCompare(b.area))
}

function areaMatrix(builderSummariesRows, builderAreaRows) {
  const areas = [...new Set(builderAreaRows.filter((row) => row.area !== 'Unassigned').map((row) => row.area))].sort()
  const rows = builderSummariesRows.map((builder) => {
    const row = { builder: builder.builder, badge_type: builder.badge_type }
    areas.forEach((area) => {
      row[area] = builderAreaRows.find((item) => item.builder_id === builder.builder_id && item.area === area)?.total_hours || 0
    })
    row.total_hours = builder.total_active_hours
    row.production_hours = builder.total_production_hours
    row.support_labor_share_hours = round(builder.total_support_hours + builder.total_labor_share_hours)
    return row
  })
  const totals = { builder: 'AREA TOTAL', badge_type: '' }
  areas.forEach((area) => { totals[area] = round(builderAreaRows.filter((item) => item.area === area).reduce((sum, item) => sum + item.total_hours, 0)) })
  totals.total_hours = round(builderSummariesRows.reduce((sum, row) => sum + row.total_active_hours, 0))
  totals.production_hours = round(builderSummariesRows.reduce((sum, row) => sum + row.total_production_hours, 0))
  totals.support_labor_share_hours = round(builderSummariesRows.reduce((sum, row) => sum + row.total_support_hours + row.total_labor_share_hours, 0))
  return { areas, rows: [...rows, totals] }
}

function weeklyBuilderAreaRows(builderAreaRows, days) {
  const rows = builderAreaRows.map((row) => {
    const output = {
      builder: row.builder,
      badge_type: row.badge_type,
      area: row.area,
      area_type: row.area_type,
    }
    days.forEach((day) => {
      output[day] = round([...row._days].includes(day)
        ? row._sessionRows?.filter((session) => session.operational_day === day).reduce((sum, session) => sum + session.calculated_hours, 0) || 0
        : 0)
    })
    output.total_hours = row.total_hours
    output.percent_of_builder_week = 0
    output.rank_in_area = ''
    return output
  })
  return rows
}

export function buildAreaHoursAnalysis({ state, weekData, weekStartDate, days = WEEKDAYS, areaDefs, includeEstimated = true, includeUnassigned = true, dependencyWarningPercent } = {}) {
  const safeState = state || {}
  const selectedWeek = weekStartDate || safeState.weekStartDate || ''
  const selectedData = weekData || safeState.weeklyData || {}
  const definitions = areaDefs || safeState.areaDefs || []
  const builders = safeState.builderPool || []
  const warnings = []
  const expectedHours = new Map()
  const sessions = []

  days.forEach((day) => {
    const dayData = selectedData?.[day] || {}
    builders.forEach((builder) => {
      const assignment = dayData.assignments?.[builder.id]
      if (!assignment) return
      const context = { state: { ...safeState, weekStartDate: selectedWeek }, dayData, assignment, builder, day, weekStartDate: selectedWeek, areaDefs: definitions, boardId: safeState.currentBoardId, shift: safeState.boardShift }
      sessions.push(...buildAssignmentSessions(context, warnings, expectedHours))
    })
  })

  const validSessions = sessions.filter((row) => row.valid === 'Yes' && row.calculated_hours > 0 && (includeEstimated || row.accuracy === 'Exact') && (includeUnassigned || row.area !== 'Unassigned'))
  const builderAreas = aggregateBuilderAreas(validSessions)
  builderAreas.forEach((row) => { row._sessionRows = validSessions.filter((session) => session.builder_id === row.builder_id && session.area === row.area) })
  const builderSummary = builderSummaries(builderAreas, warnings, expectedHours, validSessions)
  addReconciliationWarnings(builderSummary, warnings, { boardId: safeState.currentBoardId, shift: safeState.boardShift, weekStartDate: selectedWeek })
  const leaderboards = rankAreaRows(builderAreas, warnings)
  builderSummary.forEach((summary) => {
    leaderboards.filter((row) => row.builder_id === summary.builder_id && row.area === summary.primary_area).forEach((row) => { row.primary_area = 'Yes' })
  })
  const dependencyPercent = number(dependencyWarningPercent || safeState.areaDependencyWarningPercent || safeState.settings?.areaDependencyWarningPercent || DEPENDENCY_WARNING_PERCENT)
  const areas = areaSummaries(definitions, builderAreas, leaderboards, validSessions, warnings, dependencyPercent)
  const matrix = areaMatrix(builderSummary, builderAreas)
  const trends = areaDailyTrend(validSessions, definitions)
  const weeklyAreas = weeklyBuilderAreaRows(builderAreas, days)
  weeklyAreas.forEach((row) => {
    const summary = builderSummary.find((item) => item.builder === row.builder)
    row.percent_of_builder_week = summary?.total_active_hours > 0 ? row.total_hours / summary.total_active_hours : 0
    row.rank_in_area = leaderboards.find((item) => item.builder === row.builder && item.area === row.area)?.rank || ''
  })

  const totalHours = validSessions.reduce((sum, row) => sum + row.calculated_hours, 0)
  const exactHours = validSessions.filter((row) => row.accuracy === 'Exact').reduce((sum, row) => sum + row.calculated_hours, 0)
  const estimatedHours = totalHours - exactHours
  return {
    sessions: sessions.map(({ _start_ms, _end_ms, _builder, ...row }) => row),
    validSessions,
    warnings,
    builderAreaRows: builderAreas.map(({ _days, _sessionRows, ...row }) => row),
    builderSummary,
    leaderboards,
    areaSummaries: areas,
    areaDailyTrend: trends,
    matrix,
    weeklyBuilderAreaRows: weeklyAreas,
    metrics: {
      total_recorded_hours: round(totalHours),
      exact_hours: round(exactHours),
      estimated_hours: round(estimatedHours),
      exact_hour_percentage: totalHours > 0 ? exactHours / totalHours : 0,
      unique_builders: new Set(validSessions.map((row) => row.builder_id)).size,
      unique_areas: new Set(validSessions.filter((row) => row.area !== 'Unassigned').map((row) => row.area)).size,
      most_staffed_area: areas[0]?.area || '',
      highest_hour_builder: builderSummary[0]?.builder || '',
      highest_area_dependency: Math.max(0, ...areas.map((row) => number(row.top_builder_percentage))),
      data_quality_warning_count: warnings.filter((row) => !['Info'].includes(row.severity)).length,
    },
  }
}

export function resolveWeekData(state, weekStartDate) {
  const week = clean(weekStartDate || state?.weekStartDate)
  if (!week) return {}
  if (week === clean(state?.weekStartDate)) return clone(state?.weeklyData || {})
  return clone(state?.weeklyBoards?.[week] || state?.weeklyHistory?.[week]?.weeklyData || state?.weeklyHistory?.[week] || {})
}

export const __areaHours = {
  PAID_SHIFT_HOURS,
  WEEKDAYS,
  activeStatus,
  areaType,
  dateAtTime,
  shiftWindow,
}
