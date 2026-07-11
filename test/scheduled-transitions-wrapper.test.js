import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyImmediateTransition,
  cancelScheduledTransition,
  createScheduledTransition,
  reconcileIncomingManualChanges,
} from '../scheduled-transitions-core.js'

function stateFor(status = 'Present', area = 'Speed Line 1') {
  const monday = {
    assignments: {
      b1: {
        status,
        area,
        clockInTime: status === 'PTO' ? '' : '08:00',
        leaveTime: '',
        areaHistory: area ? [{ area, startIso: '2026-07-13T12:00:00.000Z', endIso: '' }] : [],
      },
    },
    movementLog: [],
    attendanceLog: [],
  }
  const weeklyData = { Monday: monday, Tuesday: {}, Wednesday: {}, Thursday: {}, Friday: {} }
  return {
    currentBoardId: 'speed_day',
    boardTitle: 'SPEED Staffing Board',
    boardShift: 'Day Shift',
    weekStartDate: '2026-07-13',
    selectedDay: 'Monday',
    builderPool: [{ id: 'b1', name: 'John Smith' }],
    weeklyData,
    weeklyBoards: { '2026-07-13': weeklyData },
    boardStore: {},
    lockedWeeks: {},
    auditLog: [],
  }
}

const context = {
  boardId: 'speed_day',
  weekStartDate: '2026-07-13',
  day: 'Monday',
  builderId: 'b1',
}
const options = { actor: 'Ali', timeZone: 'America/New_York' }

test('canceling a clock-out removes both the pending event and its reporting time', () => {
  const scheduled = createScheduledTransition(
    stateFor(),
    { ...context, type: 'clock_out', time: '14:30' },
    { ...options, now: new Date('2026-07-13T16:00:00.000Z') },
  )
  const canceled = cancelScheduledTransition(
    scheduled.state,
    { ...context, type: 'clock_out' },
    { ...options, now: new Date('2026-07-13T17:00:00.000Z') },
  )
  const assignment = canceled.state.weeklyData.Monday.assignments.b1
  assert.equal(assignment.scheduledClockOut, null)
  assert.equal(assignment.leaveTime, '')
})

test('manual immediate clock-out replaces a prior scheduled time with the actual time', () => {
  const scheduled = createScheduledTransition(
    stateFor(),
    { ...context, type: 'clock_out', time: '14:30' },
    { ...options, now: new Date('2026-07-13T16:00:00.000Z') },
  )
  const result = applyImmediateTransition(
    scheduled.state,
    { ...context, type: 'clock_out' },
    { ...options, now: new Date('2026-07-13T17:15:00.000Z') },
  )
  const assignment = result.state.weeklyData.Monday.assignments.b1
  assert.equal(assignment.status, 'PTO')
  assert.equal(assignment.leaveTime, '13:15')
  assert.equal(assignment.effectiveClockOutIso, '2026-07-13T17:15:00.000Z')
})

test('a stale client cannot silently erase a pending schedule', () => {
  const scheduled = createScheduledTransition(
    stateFor(),
    { ...context, type: 'clock_out', time: '14:30' },
    { ...options, now: new Date('2026-07-13T16:00:00.000Z') },
  )
  const staleIncoming = JSON.parse(JSON.stringify(scheduled.state))
  delete staleIncoming.weeklyData.Monday.assignments.b1.scheduledClockOut
  delete staleIncoming.weeklyBoards['2026-07-13'].Monday.assignments.b1.scheduledClockOut
  const reconciled = reconcileIncomingManualChanges(
    scheduled.state,
    staleIncoming,
    { ...options, now: new Date('2026-07-13T17:00:00.000Z') },
  )
  assert.equal(reconciled.state.weeklyData.Monday.assignments.b1.scheduledClockOut.status, 'pending')
  assert.equal(reconciled.state.weeklyData.Monday.assignments.b1.scheduledClockOut.localTime, '14:30')
})

test('a stale client manual move cancels the preserved pending schedule instead of reviving it', () => {
  const scheduled = createScheduledTransition(
    stateFor(),
    { ...context, type: 'clock_out', time: '14:30' },
    { ...options, now: new Date('2026-07-13T16:00:00.000Z') },
  )
  const staleIncoming = JSON.parse(JSON.stringify(scheduled.state))
  delete staleIncoming.weeklyData.Monday.assignments.b1.scheduledClockOut
  delete staleIncoming.weeklyBoards['2026-07-13'].Monday.assignments.b1.scheduledClockOut
  staleIncoming.weeklyData.Monday.assignments.b1.area = 'OB1'
  staleIncoming.weeklyBoards['2026-07-13'].Monday.assignments.b1.area = 'OB1'
  const reconciled = reconcileIncomingManualChanges(
    scheduled.state,
    staleIncoming,
    { ...options, now: new Date('2026-07-13T17:00:00.000Z') },
  )
  const assignment = reconciled.state.weeklyData.Monday.assignments.b1
  assert.equal(assignment.area, 'OB1')
  assert.equal(assignment.scheduledClockOut, null)
  assert.equal(assignment.leaveTime, '')
})
