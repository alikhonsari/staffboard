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

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
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

function assignmentFor(board, event) {
  if (!board || !event) return null
  let weekData = board.weeklyBoards?.[event.weekStartDate]
  if (!isObject(weekData) && board.weekStartDate === event.weekStartDate) weekData = board.weeklyData
  return weekData?.[event.day]?.assignments?.[event.builderId] || null
}

function mutateEventAssignment(state, event, mutation) {
  if (!event?.boardId || !event?.weekStartDate || !event?.day || !event?.builderId) return
  for (const board of boardViews(state, event.boardId)) {
    const assignment = assignmentFor(board, event)
    if (assignment) mutation(assignment)
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
      const weekEntries = new Map(Object.entries(board.weeklyBoards || {}))
      if (board.weekStartDate && board.weeklyData) weekEntries.set(board.weekStartDate, board.weeklyData)
      for (const [, weekData] of weekEntries) {
        for (const day of WEEKDAYS) {
          for (const assignment of Object.values(weekData?.[day]?.assignments || {})) {
            const history = Array.isArray(assignment.scheduleHistory) ? assignment.scheduleHistory : []
            for (const type of ['clock_in', 'clock_out']) {
              const latest = history.find((event) => event?.type === type)
              if (latest?.status === 'canceled' && !assignment[eventField(type)]) assignment[timeField(type)] = ''
            }
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
    const existingBoard = boardId === (existingState.currentBoardId || 'speed_day') ? existingState : existingState.boardStore?.[boardId]
    const incomingBoard = boardId === (merged.currentBoardId || 'speed_day') ? merged : merged.boardStore?.[boardId]
    if (!existingBoard || !incomingBoard) continue
    const existingWeeks = new Map(Object.entries(existingBoard.weeklyBoards || {}))
    if (existingBoard.weekStartDate && existingBoard.weeklyData) existingWeeks.set(existingBoard.weekStartDate, existingBoard.weeklyData)
    for (const [weekStartDate, existingWeek] of existingWeeks) {
      let incomingWeek = incomingBoard.weeklyBoards?.[weekStartDate]
      if (!incomingWeek && incomingBoard.weekStartDate === weekStartDate) incomingWeek = incomingBoard.weeklyData
      if (!incomingWeek) continue
      for (const day of WEEKDAYS) {
        for (const [builderId, existingAssignment] of Object.entries(existingWeek?.[day]?.assignments || {})) {
          const incomingAssignment = incomingWeek?.[day]?.assignments?.[builderId]
          if (!incomingAssignment) continue
          for (const type of ['clock_in', 'clock_out']) {
            const field = eventField(type)
            const pending = existingAssignment[field]
            if (pending?.status === 'pending' && !incomingAssignment[field]) incomingAssignment[field] = clone(pending)
          }
          if (!Array.isArray(incomingAssignment.scheduleHistory) && Array.isArray(existingAssignment.scheduleHistory)) {
            incomingAssignment.scheduleHistory = clone(existingAssignment.scheduleHistory)
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
