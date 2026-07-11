import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CLOSURE_SCOPES,
  assertClosedDayDataUnchanged,
  assertOperationalDayOpen,
  closeOperationalDay,
  getOperationalClosure,
  listActiveClosures,
  preserveServerManagedClosures,
  reconcileClosedDaySchedules,
  reopenOperationalDay,
} from '../day-closures-core.js'

function assignment(overrides = {}) {
  return {
    status: 'Present',
    area: 'Rack Prep',
    clockInTime: '08:00',
    leaveTime: '16:30',
    areaHistory: [{ area: 'Rack Prep', startIso: '2026-07-06T12:00:00.000Z', endIso: '' }],
    ...overrides,
  }
}

function board(shift, builderId, assignmentValue) {
  const day = {
    updatedAt: '',
    assignments: { [builderId]: assignmentValue },
    movementLog: [],
    attendanceLog: [],
    opsMetrics: { targetRackMediaRecovery: '10', racksProcessed: '3' },
    rackLists: { processed: 'R1 Decom', prepped: '' },
  }
  return {
    boardTitle: 'SPEED Staffing Board',
    boardShift: shift,
    weekStartDate: '2026-07-06',
    selectedDay: 'Monday',
    weeklyData: { Monday: day },
    weeklyBoards: { '2026-07-06': { Monday: day } },
    lockedWeeks: {},
    areaDefs: [],
    commentsBoard: {},
    auditLog: [],
  }
}

function stateWithSchedules() {
  const builderId = 'b-1'
  const dayAssignment = assignment({
    scheduledClockOut: {
      id: 'out-1', type: 'clock_out', status: 'pending', localTime: '16:00', scheduledAt: '2026-07-06T20:00:00.000Z',
    },
  })
  const nightAssignment = assignment({
    clockInTime: '17:00', leaveTime: '01:30',
    scheduledClockOut: {
      id: 'out-2', type: 'clock_out', status: 'pending', localTime: '01:00', scheduledAt: '2026-07-07T05:00:00.000Z',
    },
  })
  const active = board('Day Shift', builderId, dayAssignment)
  return {
    ...active,
    currentBoardId: 'speed_day',
    boardStore: {
      speed_day: structuredClone(active),
      speed_night: board('Night Shift', builderId, nightAssignment),
    },
    builderPool: [{ id: builderId, name: 'Alex' }],
    dayClosures: {},
    closureRevision: 0,
    closureNotifications: [],
    scheduleRevision: 0,
    scheduleNotifications: [],
    auditLog: [],
  }
}

const closeInput = {
  boardId: 'speed_day',
  weekStartDate: '2026-07-06',
  day: 'Monday',
  scope: CLOSURE_SCOPES.ENTIRE_DAY,
  reason: 'Holiday',
  note: 'Site holiday',
  effectiveDate: '2026-07-06',
}

test('entire-day closure applies to both shifts and cancels pending schedules without changing attendance or assignments', () => {
  const initial = stateWithSchedules()
  const result = closeOperationalDay(initial, closeInput, { actor: 'ali', now: new Date('2026-07-05T14:00:00.000Z') })
  assert.equal(result.changed, true)
  assert.equal(result.canceledTransitionCount, 2)
  assert.equal(getOperationalClosure(result.state, { ...closeInput, boardId: 'speed_day' }).reason, 'Holiday')
  assert.equal(getOperationalClosure(result.state, { ...closeInput, boardId: 'speed_night' }).reason, 'Holiday')
  assert.equal(result.state.weeklyData.Monday.assignments['b-1'].status, 'Present')
  assert.equal(result.state.weeklyData.Monday.assignments['b-1'].area, 'Rack Prep')
  assert.equal(result.state.weeklyData.Monday.assignments['b-1'].scheduledClockOut, null)
  assert.equal(result.state.boardStore.speed_night.weeklyData.Monday.assignments['b-1'].status, 'Present')
  assert.equal(result.state.boardStore.speed_night.weeklyData.Monday.assignments['b-1'].scheduledClockOut, null)
  assert.equal(result.state.auditLog.filter((row) => row.actionType === 'SCHEDULE_CANCELED_BY_CLOSURE').length, 2)
  assert.equal(result.state.auditLog.some((row) => row.actionType === 'DAY_CLOSED'), true)
})

test('day-shift closure remains isolated from night shift', () => {
  const initial = stateWithSchedules()
  const result = closeOperationalDay(initial, { ...closeInput, scope: CLOSURE_SCOPES.DAY_SHIFT }, { actor: 'ali', now: new Date('2026-07-05T14:00:00.000Z') })
  assert.equal(result.canceledTransitionCount, 1)
  assert.ok(getOperationalClosure(result.state, { ...closeInput, boardId: 'speed_day' }))
  assert.equal(getOperationalClosure(result.state, { ...closeInput, boardId: 'speed_night' }), null)
  assert.ok(result.state.boardStore.speed_night.weeklyData.Monday.assignments['b-1'].scheduledClockOut)
})

test('night-shift closure remains isolated and blocks new schedule operations', () => {
  const initial = stateWithSchedules()
  const result = closeOperationalDay(initial, { ...closeInput, boardId: 'speed_night', scope: CLOSURE_SCOPES.NIGHT_SHIFT }, { actor: 'ali', now: new Date('2026-07-05T14:00:00.000Z') })
  assert.equal(result.canceledTransitionCount, 1)
  assert.equal(getOperationalClosure(result.state, { ...closeInput, boardId: 'speed_day' }), null)
  assert.ok(getOperationalClosure(result.state, { ...closeInput, boardId: 'speed_night' }))
  assert.throws(() => assertOperationalDayOpen(result.state, { ...closeInput, boardId: 'speed_night' }), /closed/i)
  assert.doesNotThrow(() => assertOperationalDayOpen(result.state, { ...closeInput, boardId: 'speed_day' }))
})

test('reopening does not restore canceled transitions', () => {
  const closed = closeOperationalDay(stateWithSchedules(), closeInput, { actor: 'ali', now: new Date('2026-07-05T14:00:00.000Z') })
  const reopened = reopenOperationalDay(closed.state, { ...closeInput, note: 'Operations resume' }, { actor: 'manager', now: new Date('2026-07-05T15:00:00.000Z') })
  assert.equal(reopened.changed, true)
  assert.equal(getOperationalClosure(reopened.state, { ...closeInput, boardId: 'speed_day' }), null)
  assert.equal(reopened.state.weeklyData.Monday.assignments['b-1'].scheduledClockOut, null)
  assert.equal(reopened.state.boardStore.speed_night.weeklyData.Monday.assignments['b-1'].scheduledClockOut, null)
  assert.equal(reopened.state.auditLog.some((row) => row.actionType === 'DAY_REOPENED'), true)
})

test('custom reasons are required and preserved', () => {
  assert.throws(() => closeOperationalDay(stateWithSchedules(), { ...closeInput, reason: 'Other', customReason: '' }), /custom reason/i)
  const result = closeOperationalDay(stateWithSchedules(), { ...closeInput, reason: 'Other', customReason: 'Utility outage' }, { actor: 'ali' })
  assert.equal(getOperationalClosure(result.state, { ...closeInput, boardId: 'speed_day' }).customReason, 'Utility outage')
})

test('locked weeks reject closure changes', () => {
  const initial = stateWithSchedules()
  initial.lockedWeeks['2026-07-06'] = true
  initial.boardStore.speed_day.lockedWeeks['2026-07-06'] = true
  assert.throws(() => closeOperationalDay(initial, closeInput), /locked/i)
})

test('server-managed closure state survives stale browser saves and closed-day data changes are rejected', () => {
  const closed = closeOperationalDay(stateWithSchedules(), closeInput, { actor: 'ali' }).state
  const stale = stateWithSchedules()
  stale.weeklyData.Monday.opsMetrics.racksProcessed = '999'
  assert.throws(() => assertClosedDayDataUnchanged(closed, stale), /closed/i)
  const preserved = preserveServerManagedClosures(closed, stale)
  assert.deepEqual(preserved.dayClosures, closed.dayClosures)
  assert.equal(preserved.closureRevision, closed.closureRevision)
})

test('startup reconciliation cancels pending schedules accidentally written into a closed day', () => {
  const closed = closeOperationalDay(stateWithSchedules(), { ...closeInput, scope: CLOSURE_SCOPES.DAY_SHIFT }, { actor: 'ali' }).state
  closed.weeklyData.Monday.assignments['b-1'].scheduledClockOut = {
    id: 'stale-out', type: 'clock_out', status: 'pending', localTime: '15:30', scheduledAt: '2026-07-06T19:30:00.000Z',
  }
  closed.weeklyData.Monday.assignments['b-1'].leaveTime = '15:30'
  const result = reconcileClosedDaySchedules(closed, { actor: 'System', now: new Date('2026-07-05T16:00:00.000Z') })
  assert.equal(result.changed, true)
  assert.equal(result.state.weeklyData.Monday.assignments['b-1'].scheduledClockOut, null)
  assert.equal(result.events.some((event) => event.id === 'stale-out'), true)
})

test('board, week, and operational day isolation are preserved', () => {
  const result = closeOperationalDay(stateWithSchedules(), closeInput, { actor: 'ali' })
  assert.equal(listActiveClosures(result.state).length, 1)
  assert.equal(getOperationalClosure(result.state, { boardId: 'fa_day', weekStartDate: '2026-07-06', day: 'Monday' }), null)
  assert.equal(getOperationalClosure(result.state, { boardId: 'speed_day', weekStartDate: '2026-07-13', day: 'Monday' }), null)
  assert.equal(getOperationalClosure(result.state, { boardId: 'speed_day', weekStartDate: '2026-07-06', day: 'Tuesday' }), null)
})
