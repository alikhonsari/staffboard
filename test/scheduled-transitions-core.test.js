import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyImmediateTransition,
  applyManualAssignmentOverride,
  buildScheduledTimestamp,
  cancelScheduledTransition,
  createScheduledTransition,
  getNextPendingTransitionAt,
  processDueScheduledTransitions,
} from '../scheduled-transitions-core.js'

function baseState({ shift = 'Day Shift', boardId = 'speed_day', status = 'Present', area = 'Speed Line 1' } = {}) {
  const day = {
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
  const weeklyData = { Monday: day, Tuesday: {}, Wednesday: {}, Thursday: {}, Friday: {} }
  return {
    currentBoardId: boardId,
    boardTitle: 'SPEED Staffing Board',
    boardShift: shift,
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

const opts = { timeZone: 'America/New_York', actor: 'Ali' }
const scheduleOut = (state = baseState(), time = '14:30', now = '2026-07-13T16:00:00.000Z') => createScheduledTransition(
  state,
  { boardId: state.currentBoardId, weekStartDate: '2026-07-13', day: 'Monday', builderId: 'b1', type: 'clock_out', time },
  { ...opts, now: new Date(now) },
)

test('day clock-out timestamp uses the operational date and site timezone', () => {
  assert.equal(
    buildScheduledTimestamp({ weekStartDate: '2026-07-13', day: 'Monday', time: '14:30', boardShift: 'Day Shift', boardId: 'speed_day' }).scheduledAt,
    '2026-07-13T18:30:00.000Z',
  )
})

test('night after-midnight time stays attached to the prior operational day', () => {
  const result = buildScheduledTimestamp({ weekStartDate: '2026-07-13', day: 'Monday', time: '01:00', boardShift: 'Night Shift', boardId: 'speed_night' })
  assert.equal(result.operationalDate, '2026-07-13')
  assert.equal(result.calendarDate, '2026-07-14')
  assert.equal(result.scheduledAt, '2026-07-14T05:00:00.000Z')
})

test('builder remains assigned one minute before clock-out', () => {
  const scheduled = scheduleOut()
  const before = processDueScheduledTransitions(scheduled.state, new Date('2026-07-13T18:29:00.000Z'), opts)
  const assignment = before.state.weeklyData.Monday.assignments.b1
  assert.equal(before.changed, false)
  assert.equal(assignment.status, 'Present')
  assert.equal(assignment.area, 'Speed Line 1')
})

test('builder moves to PTO and leaves the board exactly at clock-out', () => {
  const scheduled = scheduleOut()
  const atTime = processDueScheduledTransitions(scheduled.state, new Date('2026-07-13T18:30:00.000Z'), opts)
  const assignment = atTime.state.weeklyData.Monday.assignments.b1
  assert.equal(atTime.changed, true)
  assert.equal(assignment.status, 'PTO')
  assert.equal(assignment.area, '')
  assert.equal(assignment.effectiveClockOutIso, '2026-07-13T18:30:00.000Z')
})

test('clock-out closes historical area time at the scheduled effective time', () => {
  const scheduled = scheduleOut()
  const atTime = processDueScheduledTransitions(scheduled.state, new Date('2026-07-13T18:42:00.000Z'), opts)
  const history = atTime.state.weeklyData.Monday.assignments.b1.areaHistory
  assert.equal(history.at(-1).endIso, '2026-07-13T18:30:00.000Z')
})

test('builder remains PTO one minute before clock-in', () => {
  const state = baseState({ status: 'PTO', area: '' })
  const scheduled = createScheduledTransition(state, { boardId: 'speed_day', weekStartDate: '2026-07-13', day: 'Monday', builderId: 'b1', type: 'clock_in', time: '10:00' }, { ...opts, now: new Date('2026-07-13T12:00:00.000Z') })
  const before = processDueScheduledTransitions(scheduled.state, new Date('2026-07-13T13:59:00.000Z'), opts)
  assert.equal(before.state.weeklyData.Monday.assignments.b1.status, 'PTO')
})

test('builder changes from PTO to Present and Unassigned exactly at clock-in', () => {
  const state = baseState({ status: 'PTO', area: '' })
  const scheduled = createScheduledTransition(state, { boardId: 'speed_day', weekStartDate: '2026-07-13', day: 'Monday', builderId: 'b1', type: 'clock_in', time: '10:00' }, { ...opts, now: new Date('2026-07-13T12:00:00.000Z') })
  const atTime = processDueScheduledTransitions(scheduled.state, new Date('2026-07-13T14:00:00.000Z'), opts)
  const assignment = atTime.state.weeklyData.Monday.assignments.b1
  assert.equal(assignment.status, 'Present')
  assert.equal(assignment.area, '')
  assert.equal(assignment.effectiveClockInIso, '2026-07-13T14:00:00.000Z')
})

test('processing the same transition twice is idempotent', () => {
  const scheduled = scheduleOut()
  const first = processDueScheduledTransitions(scheduled.state, new Date('2026-07-13T18:30:00.000Z'), opts)
  const second = processDueScheduledTransitions(first.state, new Date('2026-07-13T18:31:00.000Z'), opts)
  assert.equal(second.changed, false)
  assert.equal(first.state.auditLog.filter((row) => row.action === 'Automatic Clock Out').length, 1)
  assert.equal(first.state.weeklyData.Monday.movementLog.filter((row) => row.action === 'Automatic Clock Out').length, 1)
})

test('serialized pending schedules survive a simulated server restart', () => {
  const scheduled = scheduleOut()
  const restored = JSON.parse(JSON.stringify(scheduled.state))
  assert.equal(restored.weeklyData.Monday.assignments.b1.scheduledClockOut.status, 'pending')
  assert.equal(getNextPendingTransitionAt(restored), '2026-07-13T18:30:00.000Z')
})

test('startup reconciliation processes an overdue transition once', () => {
  const scheduled = scheduleOut()
  const restored = JSON.parse(JSON.stringify(scheduled.state))
  const result = processDueScheduledTransitions(restored, new Date('2026-07-13T18:42:00.000Z'), opts)
  assert.equal(result.events.length, 1)
  assert.equal(result.state.weeklyData.Monday.assignments.b1.status, 'PTO')
})

test('editing a scheduled time cancels the prior pending event', () => {
  const first = scheduleOut()
  const second = scheduleOut(first.state, '15:00', '2026-07-13T16:05:00.000Z')
  const assignment = second.state.weeklyData.Monday.assignments.b1
  assert.equal(assignment.scheduledClockOut.localTime, '15:00')
  assert.equal(assignment.scheduleHistory[0].status, 'canceled')
  assert.equal(assignment.scheduleHistory[0].cancelReason, 'Replaced by a newer scheduled time')
})

test('canceling a scheduled transition prevents execution', () => {
  const scheduled = scheduleOut()
  const canceled = cancelScheduledTransition(scheduled.state, { boardId: 'speed_day', weekStartDate: '2026-07-13', day: 'Monday', builderId: 'b1', type: 'clock_out' }, { ...opts, now: new Date('2026-07-13T17:00:00.000Z') })
  const later = processDueScheduledTransitions(canceled.state, new Date('2026-07-13T19:00:00.000Z'), opts)
  assert.equal(later.changed, false)
  assert.equal(later.state.weeklyData.Monday.assignments.b1.status, 'Present')
})

test('manual area override cancels a stale pending transition', () => {
  const scheduled = scheduleOut()
  const override = applyManualAssignmentOverride(scheduled.state, { boardId: 'speed_day', weekStartDate: '2026-07-13', day: 'Monday', builderId: 'b1', patch: { area: 'OB1', status: 'Present' } }, { ...opts, now: new Date('2026-07-13T17:00:00.000Z') })
  const assignment = override.state.weeklyData.Monday.assignments.b1
  assert.equal(assignment.scheduledClockOut, null)
  assert.equal(assignment.area, 'OB1')
})

test('manual inactive status clears the old area and cancels pending schedules', () => {
  const scheduled = scheduleOut()
  const override = applyManualAssignmentOverride(scheduled.state, { boardId: 'speed_day', weekStartDate: '2026-07-13', day: 'Monday', builderId: 'b1', patch: { status: 'PTO' } }, { ...opts, now: new Date('2026-07-13T17:00:00.000Z') })
  const assignment = override.state.weeklyData.Monday.assignments.b1
  assert.equal(assignment.status, 'PTO')
  assert.equal(assignment.area, '')
  assert.equal(assignment.scheduledClockOut, null)
})

test('manual immediate clock-out keeps the permanent Builder Master List intact', () => {
  const result = applyImmediateTransition(baseState(), { boardId: 'speed_day', weekStartDate: '2026-07-13', day: 'Monday', builderId: 'b1', type: 'clock_out' }, { ...opts, now: new Date('2026-07-13T17:15:00.000Z') })
  assert.equal(result.state.builderPool.length, 1)
  assert.equal(result.state.builderPool[0].name, 'John Smith')
  assert.equal(result.state.weeklyData.Monday.assignments.b1.status, 'PTO')
})

test('late reconciliation stores scheduled and actual processing timestamps separately', () => {
  const scheduled = scheduleOut()
  const late = processDueScheduledTransitions(scheduled.state, new Date('2026-07-13T18:42:00.000Z'), opts)
  const event = late.state.weeklyData.Monday.assignments.b1.scheduleHistory[0]
  assert.equal(event.effectiveAt, '2026-07-13T18:30:00.000Z')
  assert.equal(event.processedAt, '2026-07-13T18:42:00.000Z')
  assert.equal(event.delayed, true)
})

test('day and night board schedules remain isolated', () => {
  const day = baseState()
  const nightDay = baseState({ shift: 'Night Shift', boardId: 'speed_night' })
  day.boardStore.speed_night = {
    boardTitle: nightDay.boardTitle,
    boardShift: nightDay.boardShift,
    weekStartDate: nightDay.weekStartDate,
    selectedDay: nightDay.selectedDay,
    weeklyData: nightDay.weeklyData,
    weeklyBoards: nightDay.weeklyBoards,
    lockedWeeks: {},
  }
  const scheduled = scheduleOut(day)
  const result = processDueScheduledTransitions(scheduled.state, new Date('2026-07-13T18:30:00.000Z'), opts)
  assert.equal(result.state.weeklyData.Monday.assignments.b1.status, 'PTO')
  assert.equal(result.state.boardStore.speed_night.weeklyData.Monday.assignments.b1.status, 'Present')
})

test('copied schedule metadata with the wrong day is canceled as stale', () => {
  const scheduled = scheduleOut()
  const copied = JSON.parse(JSON.stringify(scheduled.state))
  copied.weeklyData.Tuesday = JSON.parse(JSON.stringify(copied.weeklyData.Monday))
  copied.weeklyBoards['2026-07-13'].Tuesday = copied.weeklyData.Tuesday
  delete copied.weeklyData.Monday.assignments.b1
  delete copied.weeklyBoards['2026-07-13'].Monday.assignments.b1
  const result = processDueScheduledTransitions(copied, new Date('2026-07-14T18:30:00.000Z'), opts)
  const assignment = result.state.weeklyData.Tuesday.assignments.b1
  assert.equal(assignment.scheduledClockOut, null)
  assert.equal(assignment.scheduleHistory[0].status, 'canceled')
})

test('past scheduled time is reconciled immediately rather than waiting for a browser', () => {
  const result = scheduleOut(baseState(), '14:30', '2026-07-13T18:42:00.000Z')
  assert.equal(result.state.weeklyData.Monday.assignments.b1.status, 'PTO')
  assert.equal(result.state.weeklyData.Monday.assignments.b1.area, '')
})

test('locked weeks reject scheduling changes', () => {
  const state = baseState()
  state.lockedWeeks['2026-07-13'] = true
  assert.throws(() => scheduleOut(state), /week is locked/i)
})

test('invalid day shift scheduled time is rejected', () => {
  assert.throws(() => scheduleOut(baseState(), '07:59'), /Day Shift scheduled times/i)
})

test('clock-in requires PTO and clock-out requires an active status', () => {
  assert.throws(() => createScheduledTransition(baseState(), { boardId: 'speed_day', weekStartDate: '2026-07-13', day: 'Monday', builderId: 'b1', type: 'clock_in', time: '10:00' }, opts), /requires the builder to be in PTO/i)
  assert.throws(() => scheduleOut(baseState({ status: 'LOA', area: '' })), /requires an active working status/i)
})

test('clock-in and clock-out cannot share the same timestamp', () => {
  const state = baseState({ status: 'PTO', area: '' })
  const scheduledIn = createScheduledTransition(state, { boardId: 'speed_day', weekStartDate: '2026-07-13', day: 'Monday', builderId: 'b1', type: 'clock_in', time: '10:00' }, { ...opts, now: new Date('2026-07-13T12:00:00.000Z') })
  scheduledIn.state.weeklyData.Monday.assignments.b1.status = 'Present'
  scheduledIn.state.weeklyBoards['2026-07-13'].Monday.assignments.b1.status = 'Present'
  assert.throws(() => createScheduledTransition(scheduledIn.state, { boardId: 'speed_day', weekStartDate: '2026-07-13', day: 'Monday', builderId: 'b1', type: 'clock_out', time: '10:00' }, { ...opts, now: new Date('2026-07-13T12:01:00.000Z') }), /same timestamp/i)
})
