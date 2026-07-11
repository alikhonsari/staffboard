import {
  ACTIVE_WORK_STATUSES,
  DEFAULT_SITE_TIME_ZONE,
  INACTIVE_STATUSES,
  WEEKDAYS,
  applyImmediateTransition as applyImmediateTransitionCore,
  applyManualAssignmentOverride as applyManualAssignmentOverrideCore,
  buildScheduledTimestamp,
  cancelScheduledTransition as cancelScheduledTransitionCore,
  createScheduledTransition,
  formatInTimeZone,
  getNextPendingTransitionAt,
  processDueScheduledTransitions as processDueScheduledTransitionsCore,
  reconcileIncomingManualChanges as reconcileIncomingManualChangesCore,
  zonedDateTimeToUtc,
} from './scheduled-transitions-engine.js'

export {
  ACTIVE_WORK_STATUSES,
  DEFAULT_SITE_TIME_ZONE,
  INACTIVE_STATUSES,
  WEEKDAYS,
  buildScheduledTimestamp,
  createScheduledTransition,
  formatInTimeZone,
  getNextPendingTransitionAt,
  zonedDateTimeToUtc,
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function eventField(type) {
  return type === 'clock_in' ? 'scheduledClockIn' : 'scheduledClockOut'
}

function timeField(type) {
  return type === 'clock_in' ? 'clockInTime' : 'leaveTime'
}

function boardViews(state, boardId) {
  const views = []
  const activeId = state.currentBoardId || 'speed_day'
  if (boardId === activeId) views.push(state)
  const stored = state.boardStore?.[boardId]
  if (stored && stored !== state) views.push(stored)
  return views
}

function assignmentRefs(board, context) {
  if (!board || !context) return []
  const refs = []
  const fromArchive = board.weeklyBoards?.[context.weekStartDate]?.[context.day]?.assignments?.[context.builderId]
  if (fromArchive) refs.push(fromArchive)
  if (board.weekStartDate === context.weekStartDate) {
    const fromActive = board.weeklyData?.[context.day]?.assignments?.[context.builderId]
    if (fromActive && !refs.includes(fromActive)) refs.push(fromActive)
  }
  return refs
}

function mutateEventAssignment(state, event, mutation) {
  if (!event?.boardId || !event?.weekStartDate || !event?.day || !event?.builderId) return
  for (const board of boardViews(state, event.boardId)) {
    for (const assignment of assignmentRefs(board, event)) mutation(assignment)
  }
}

function clearCanceledEventTimes(state, events = []) {
  for (const event of events) {
    if (event?.status !== 'canceled') continue
    mutateEventAssignment(state, event, (assignment) => {
      if (!assignment[eventField(event.type)]) assignment[timeField(event.type)] = ''
    })
  }
  return state
}

function setImmediateEffectiveTimes(state, events = []) {
  for (const event of events) {
    if (event?.status !== 'processed' || !event.manual) continue
    mutateEventAssignment(state, event, (assignment) => {
      assignment[timeField(event.type)] = event.localTime || assignment[timeField(event.type)] || ''
    })
  }
  return state
}

function sweepLatestCanceledTimes(state) {
  const boardIds = Array.from(new Set([state.currentBoardId || 'speed_day', ...Object.keys(state.boardStore || {})]))
  for (const boardId of boardIds) {
    for (const board of boardViews(state, boardId)) {
      const contexts = new Map()
      for (const [weekStartDate, weekData] of Object.entries(board.weeklyBoards || {})) {
        for (const day of WEEKDAYS) {
          for (const builderId of Object.keys(weekData?.[day]?.assignments || {})) {
            contexts.set(`${weekStartDate}:${day}:${builderId}`, { weekStartDate, day, builderId })
          }
        }
      }
      if (board.weekStartDate && board.weeklyData) {
        for (const day of WEEKDAYS) {
          for (const builderId of Object.keys(board.weeklyData?.[day]?.assignments || {})) {
            contexts.set(`${board.weekStartDate}:${day}:${builderId}`, { weekStartDate: board.weekStartDate, day, builderId })
          }
        }
      }
      for (const context of contexts.values()) {
        for (const assignment of assignmentRefs(board, context)) {
          const history = Array.isArray(assignment.scheduleHistory) ? assignment.scheduleHistory : []
          for (const type of ['clock_in', 'clock_out']) {
            const latest = history.find((event) => event?.type === type)
            if (latest?.status === 'canceled' && !assignment[eventField(type)]) assignment[timeField(type)] = ''
          }
        }
      }
    }
  }
  return state
}

function copyPendingSchedules(existingState, incomingState) {
  const merged = clone(incomingState)
  const boardIds = Array.from(new Set([existingState.currentBoardId || 'speed_day', ...Object.keys(existingState.boardStore || {})]))

  for (const boardId of boardIds) {
    const existingViews = boardViews(existingState, boardId)
    const incomingViews = boardViews(merged, boardId)
    if (!existingViews.length || !incomingViews.length) continue
    const contexts = new Map()
    for (const existingBoard of existingViews) {
      for (const [weekStartDate, weekData] of Object.entries(existingBoard.weeklyBoards || {})) {
        for (const day of WEEKDAYS) {
          for (const builderId of Object.keys(weekData?.[day]?.assignments || {})) {
            contexts.set(`${weekStartDate}:${day}:${builderId}`, { weekStartDate, day, builderId })
          }
        }
      }
      if (existingBoard.weekStartDate && existingBoard.weeklyData) {
        for (const day of WEEKDAYS) {
          for (const builderId of Object.keys(existingBoard.weeklyData?.[day]?.assignments || {})) {
            contexts.set(`${existingBoard.weekStartDate}:${day}:${builderId}`, { weekStartDate: existingBoard.weekStartDate, day, builderId })
          }
        }
      }
    }

    for (const context of contexts.values()) {
      const existingAssignments = existingViews.flatMap((board) => assignmentRefs(board, context))
      const source = existingAssignments.find((assignment) => assignment.scheduledClockIn?.status === 'pending' || assignment.scheduledClockOut?.status === 'pending') || existingAssignments[0]
      if (!source) continue
      for (const incomingBoard of incomingViews) {
        for (const incomingAssignment of assignmentRefs(incomingBoard, context)) {
          for (const type of ['clock_in', 'clock_out']) {
            const field = eventField(type)
            const pending = source[field]
            if (pending?.status === 'pending' && !incomingAssignment[field]) incomingAssignment[field] = clone(pending)
          }
          if (!Array.isArray(incomingAssignment.scheduleHistory) && Array.isArray(source.scheduleHistory)) {
            incomingAssignment.scheduleHistory = clone(source.scheduleHistory)
          }
        }
      }
    }
  }
  return merged
}

export function cancelScheduledTransition(inputState, input, options = {}) {
  const result = cancelScheduledTransitionCore(inputState, input, options)
  if (!result.changed) return result
  const state = clearCanceledEventTimes(clone(result.state), result.events)
  return { ...result, state, nextDueAt: getNextPendingTransitionAt(state) }
}

export function processDueScheduledTransitions(inputState, now = new Date(), options = {}) {
  const result = processDueScheduledTransitionsCore(inputState, now, options)
  if (!result.changed) return result
  const state = clearCanceledEventTimes(clone(result.state), result.events)
  return { ...result, state, nextDueAt: getNextPendingTransitionAt(state) }
}

export function applyImmediateTransition(inputState, input, options = {}) {
  const result = applyImmediateTransitionCore(inputState, input, options)
  const state = setImmediateEffectiveTimes(sweepLatestCanceledTimes(clone(result.state)), result.events)
  return { ...result, state, nextDueAt: getNextPendingTransitionAt(state) }
}

export function applyManualAssignmentOverride(inputState, input, options = {}) {
  const result = applyManualAssignmentOverrideCore(inputState, input, options)
  const state = sweepLatestCanceledTimes(clearCanceledEventTimes(clone(result.state), result.events))
  return { ...result, state, nextDueAt: getNextPendingTransitionAt(state) }
}

export function reconcileIncomingManualChanges(existingState, incomingState, options = {}) {
  const withPendingSchedules = copyPendingSchedules(existingState, incomingState)
  const result = reconcileIncomingManualChangesCore(existingState, withPendingSchedules, options)
  if (!result.changed) return { ...result, state: withPendingSchedules }
  return { ...result, state: sweepLatestCanceledTimes(clone(result.state)) }
}
