import crypto from 'crypto'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value))
const clean = (value) => String(value || '').trim()
const same = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null)

function makeId(prefix = 'version') {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}`
}

function dayHasData(day = {}) {
  if (!day || typeof day !== 'object') return false
  if (Object.keys(day.assignments || {}).length) return true
  if ((day.movementLog || []).length || (day.attendanceLog || []).length) return true
  if (Object.values(day.opsMetrics || {}).some((value) => clean(value))) return true
  if (Object.values(day.rackLists || {}).some((value) => clean(value))) return true
  if (clean(day.shiftNotes || day.notes)) return true
  return false
}

function versionRecord(context, change) {
  return {
    id: makeId('version'),
    timestamp: context.timestamp || new Date().toISOString(),
    admin: context.actor || 'System',
    boardId: change.boardId || context.boardId || '',
    shift: change.shift || context.shift || '',
    week: change.week || context.week || '',
    day: change.day || '',
    actionType: change.actionType || context.actionType || 'STATE_UPDATED',
    entityType: change.entityType || 'state',
    entityId: change.entityId || '',
    previousValue: clone(change.previousValue),
    newValue: clone(change.newValue),
    stateRevision: context.stateRevision || '',
    source: context.source || 'state-save',
    reason: context.reason || '',
    relatedRecordId: context.relatedRecordId || '',
    reversible: change.reversible !== false,
  }
}

function builderChanges(beforeAssignments = {}, afterAssignments = {}, context, day) {
  const records = []
  const ids = new Set([...Object.keys(beforeAssignments || {}), ...Object.keys(afterAssignments || {})])
  for (const builderId of ids) {
    const before = beforeAssignments?.[builderId]
    const after = afterAssignments?.[builderId]
    if (same(before, after)) continue
    records.push(versionRecord(context, {
      day,
      entityType: 'builder_assignment',
      entityId: builderId,
      previousValue: before ?? null,
      newValue: after ?? null,
      actionType: before == null ? 'BUILDER_ASSIGNED' : after == null ? 'BUILDER_REMOVED_FROM_DAY' : 'BUILDER_ASSIGNMENT_UPDATED',
    }))
  }
  return records
}

export function buildVersionRecords(beforeState = {}, afterState = {}, context = {}) {
  const records = []
  const boardId = afterState.currentBoardId || beforeState.currentBoardId || context.boardId || 'speed_day'
  const shift = afterState.boardShift || beforeState.boardShift || context.shift || ''
  const week = afterState.weekStartDate || beforeState.weekStartDate || context.week || ''
  const shared = { ...context, boardId, shift, week }

  if (!same(beforeState.builderPool || [], afterState.builderPool || [])) {
    records.push(versionRecord(shared, {
      entityType: 'builder_master_list', entityId: 'builderPool', actionType: 'BUILDER_MASTER_LIST_UPDATED',
      previousValue: beforeState.builderPool || [], newValue: afterState.builderPool || [],
    }))
  }
  if (!same(beforeState.areaDefs || [], afterState.areaDefs || [])) {
    records.push(versionRecord(shared, {
      entityType: 'area_definitions', entityId: boardId, actionType: 'AREA_DEFINITIONS_UPDATED',
      previousValue: beforeState.areaDefs || [], newValue: afterState.areaDefs || [],
    }))
  }
  if (!same(beforeState.commentsBoard || {}, afterState.commentsBoard || {})) {
    records.push(versionRecord(shared, {
      entityType: 'board_comments', entityId: boardId, actionType: 'BOARD_COMMENTS_UPDATED',
      previousValue: beforeState.commentsBoard || {}, newValue: afterState.commentsBoard || {},
    }))
  }
  if (!same(beforeState.dayTemplates || [], afterState.dayTemplates || [])) {
    records.push(versionRecord(shared, {
      entityType: 'day_templates', entityId: boardId, actionType: 'DAY_TEMPLATES_UPDATED',
      previousValue: beforeState.dayTemplates || [], newValue: afterState.dayTemplates || [],
    }))
  }

  for (const day of WEEKDAYS) {
    const beforeDay = beforeState.weeklyData?.[day] || {}
    const afterDay = afterState.weeklyData?.[day] || {}
    if (same(beforeDay, afterDay)) continue

    records.push(versionRecord(shared, {
      day, entityType: 'operational_day', entityId: `${week}:${day}`, actionType: dayHasData(beforeDay) && !dayHasData(afterDay) ? 'CLEAR_DAY' : 'OPERATIONAL_DAY_UPDATED',
      previousValue: beforeDay, newValue: afterDay,
    }))
    records.push(...builderChanges(beforeDay.assignments || {}, afterDay.assignments || {}, shared, day))

    if (!same(beforeDay.assignments || {}, afterDay.assignments || {})) {
      records.push(versionRecord(shared, {
        day, entityType: 'day_assignments', entityId: `${week}:${day}:assignments`, actionType: 'DAY_ASSIGNMENTS_UPDATED',
        previousValue: beforeDay.assignments || {}, newValue: afterDay.assignments || {},
      }))
    }
    if (!same(beforeDay.opsMetrics || {}, afterDay.opsMetrics || {})) {
      records.push(versionRecord(shared, {
        day, entityType: 'day_goals', entityId: `${week}:${day}:goals`, actionType: 'DAY_GOALS_UPDATED',
        previousValue: beforeDay.opsMetrics || {}, newValue: afterDay.opsMetrics || {},
      }))
    }
    if (!same(beforeDay.rackLists || {}, afterDay.rackLists || {})) {
      records.push(versionRecord(shared, {
        day, entityType: 'day_racks', entityId: `${week}:${day}:racks`, actionType: 'DAY_RACKS_UPDATED',
        previousValue: beforeDay.rackLists || {}, newValue: afterDay.rackLists || {},
      }))
    }
    const beforeNotes = { shiftNotes: beforeDay.shiftNotes || '', notes: beforeDay.notes || '' }
    const afterNotes = { shiftNotes: afterDay.shiftNotes || '', notes: afterDay.notes || '' }
    if (!same(beforeNotes, afterNotes)) {
      records.push(versionRecord(shared, {
        day, entityType: 'day_notes', entityId: `${week}:${day}:notes`, actionType: 'DAY_NOTES_UPDATED',
        previousValue: beforeNotes, newValue: afterNotes,
      }))
    }
  }

  if (!records.length && !same(beforeState, afterState)) {
    records.push(versionRecord(shared, {
      entityType: 'board_state', entityId: boardId, actionType: context.actionType || 'BOARD_STATE_UPDATED',
      previousValue: beforeState, newValue: afterState,
    }))
  }
  return records.slice(0, 80)
}

function boardFor(state, boardId) {
  if ((state.currentBoardId || 'speed_day') === boardId) return state
  state.boardStore = state.boardStore && typeof state.boardStore === 'object' ? state.boardStore : {}
  state.boardStore[boardId] = state.boardStore[boardId] && typeof state.boardStore[boardId] === 'object' ? state.boardStore[boardId] : {}
  return state.boardStore[boardId]
}

function ensureDay(board, week, day) {
  board.weeklyBoards = board.weeklyBoards && typeof board.weeklyBoards === 'object' ? board.weeklyBoards : {}
  let weekData = board.weeklyBoards[week]
  if ((!weekData || typeof weekData !== 'object') && board.weekStartDate === week) weekData = board.weeklyData
  weekData = weekData && typeof weekData === 'object' ? clone(weekData) : {}
  weekData[day] = weekData[day] && typeof weekData[day] === 'object' ? clone(weekData[day]) : {}
  board.weeklyBoards[week] = weekData
  if (board.weekStartDate === week) board.weeklyData = weekData
  return weekData[day]
}

function preserveScheduleFields(current = {}, restored = {}) {
  const result = clone(restored || {}) || {}
  for (const field of ['scheduledClockIn', 'scheduledClockOut', 'scheduleHistory', 'effectiveClockInIso', 'effectiveClockOutIso']) {
    if (current?.[field] !== undefined) result[field] = clone(current[field])
    else delete result[field]
  }
  return result
}

function preserveDaySchedules(currentDay = {}, restoredDay = {}) {
  const result = clone(restoredDay || {}) || {}
  const currentAssignments = currentDay.assignments || {}
  const restoredAssignments = result.assignments || {}
  const ids = new Set([...Object.keys(currentAssignments), ...Object.keys(restoredAssignments)])
  result.assignments = { ...restoredAssignments }
  for (const builderId of ids) {
    if (restoredAssignments[builderId] == null) continue
    result.assignments[builderId] = preserveScheduleFields(currentAssignments[builderId] || {}, restoredAssignments[builderId])
  }
  return result
}

export function applyVersionRestore(inputState, version, options = {}) {
  if (!version?.reversible) throw new Error('This version cannot be restored.')
  const state = clone(inputState)
  const useValue = options.direction === 'redo' ? version.newValue : version.previousValue
  const board = boardFor(state, version.boardId || state.currentBoardId || 'speed_day')
  const week = version.week || board.weekStartDate
  if (board.lockedWeeks?.[week]) throw new Error('This week is locked. Unlock it before restoring data.')
  const day = version.day
  let targetDay

  switch (version.entityType) {
    case 'operational_day':
      targetDay = ensureDay(board, week, day)
      Object.assign(targetDay, preserveDaySchedules(targetDay, clone(useValue || {})))
      break
    case 'builder_assignment': {
      targetDay = ensureDay(board, week, day)
      targetDay.assignments = { ...(targetDay.assignments || {}) }
      if (useValue == null) delete targetDay.assignments[version.entityId]
      else targetDay.assignments[version.entityId] = preserveScheduleFields(targetDay.assignments[version.entityId] || {}, useValue)
      break
    }
    case 'day_assignments': {
      targetDay = ensureDay(board, week, day)
      const restored = { ...targetDay, assignments: clone(useValue || {}) }
      targetDay.assignments = preserveDaySchedules(targetDay, restored).assignments
      break
    }
    case 'day_goals':
      targetDay = ensureDay(board, week, day)
      targetDay.opsMetrics = clone(useValue || {})
      break
    case 'day_racks':
      targetDay = ensureDay(board, week, day)
      targetDay.rackLists = clone(useValue || {})
      break
    case 'day_notes':
      targetDay = ensureDay(board, week, day)
      targetDay.shiftNotes = useValue?.shiftNotes || ''
      targetDay.notes = useValue?.notes || ''
      break
    case 'builder_master_list':
      state.builderPool = clone(useValue || [])
      break
    case 'area_definitions':
      board.areaDefs = clone(useValue || [])
      break
    case 'board_comments':
      board.commentsBoard = clone(useValue || {})
      break
    case 'day_templates':
      board.dayTemplates = clone(useValue || [])
      break
    default:
      throw new Error(`Restore is not supported for ${version.entityType || 'this record'}.`)
  }

  const now = options.now instanceof Date ? options.now.toISOString() : new Date(options.now || Date.now()).toISOString()
  state.auditLog = [{
    id: makeId('audit'), timestamp: now, admin: options.actor || 'System', board: version.boardId,
    shift: version.shift || '', week, day: day || '', action: options.direction === 'redo' ? 'Redo Version' : 'Restore Version',
    oldValue: version.newValue, newValue: useValue, reason: options.reason || '', source: 'Data Recovery', relatedRecordId: version.id,
  }, ...(Array.isArray(state.auditLog) ? state.auditLog : [])].slice(0, 500)
  state.recoveryRevision = Number(state.recoveryRevision || 0) + 1
  return { state, restoredVersionId: version.id, entityType: version.entityType }
}

export function previewVersionRestore(state, version, options = {}) {
  const value = options.direction === 'redo' ? version?.newValue : version?.previousValue
  return {
    versionId: version?.id || '',
    action: options.direction === 'redo' ? 'Redo' : 'Restore',
    entityType: version?.entityType || '',
    entityId: version?.entityId || '',
    boardId: version?.boardId || '',
    shift: version?.shift || '',
    week: version?.week || '',
    day: version?.day || '',
    recordedAt: version?.timestamp || '',
    recordedBy: version?.admin || '',
    currentRevision: state?.updatedAt || '',
    restoreValue: clone(value),
    warning: version?.entityType === 'operational_day'
      ? 'This restores the selected operational day while preserving current pending scheduled-transition fields and closure state.'
      : 'Only the selected entity will be restored. Unrelated state is preserved.',
  }
}

export function detectBackupReason(beforeState = {}, afterState = {}) {
  const beforeDays = WEEKDAYS.filter((day) => dayHasData(beforeState.weeklyData?.[day])).length
  const afterDays = WEEKDAYS.filter((day) => dayHasData(afterState.weeklyData?.[day])).length
  if (beforeDays > 0 && afterDays === 0) return 'RESET_WEEK'
  for (const day of WEEKDAYS) {
    if (dayHasData(beforeState.weeklyData?.[day]) && !dayHasData(afterState.weeklyData?.[day])) return `CLEAR_DAY:${day}`
  }
  const assignmentChanges = WEEKDAYS.reduce((count, day) => {
    const before = beforeState.weeklyData?.[day]?.assignments || {}
    const after = afterState.weeklyData?.[day]?.assignments || {}
    const ids = new Set([...Object.keys(before), ...Object.keys(after)])
    return count + [...ids].filter((id) => !same(before[id], after[id])).length
  }, 0)
  if (assignmentChanges >= 10) return 'BULK_EDIT'
  if (!same(beforeState.dayTemplates || [], afterState.dayTemplates || [])) return 'TEMPLATE_CHANGE'
  return ''
}

export function buildEmergencyExport(state = {}, scope = 'current', context = {}) {
  const boardId = context.boardId || state.currentBoardId || 'speed_day'
  const board = (state.currentBoardId || 'speed_day') === boardId ? state : state.boardStore?.[boardId] || {}
  const week = context.weekStartDate || board.weekStartDate || state.weekStartDate || ''
  const day = context.day || board.selectedDay || state.selectedDay || 'Monday'
  const weekData = board.weeklyBoards?.[week] || (board.weekStartDate === week ? board.weeklyData : {}) || {}
  const payloads = {
    current: state,
    week: { boardId, weekStartDate: week, weeklyData: weekData },
    day: { boardId, weekStartDate: week, day, data: weekData?.[day] || {} },
    builders: state.builderPool || [],
    audit: state.auditLog || [],
    actions: state.operationalActions || [],
    impact: state.leadershipImpactEvents || [],
  }
  if (!(scope in payloads)) throw new Error('Unknown administrative export scope.')
  return { exportedAt: new Date().toISOString(), scope, boardId, weekStartDate: week, day, data: clone(payloads[scope]) }
}

export { WEEKDAYS, dayHasData }
