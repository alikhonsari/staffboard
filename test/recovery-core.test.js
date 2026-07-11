import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyVersionRestore, buildEmergencyExport, buildVersionRecords, detectBackupReason, previewVersionRestore,
} from '../recovery-core.js'

function day(overrides = {}) {
  return {
    assignments: {}, movementLog: [], attendanceLog: [], opsMetrics: {}, rackLists: {}, shiftNotes: '',
    ...overrides,
  }
}

function baseState() {
  return {
    currentBoardId: 'speed_day', boardShift: 'Day Shift', weekStartDate: '2026-07-06', selectedDay: 'Monday',
    weeklyData: { Monday: day(), Tuesday: day(), Wednesday: day(), Thursday: day(), Friday: day() },
    weeklyBoards: {}, boardStore: {}, lockedWeeks: {}, builderPool: [{ id: 'b1', name: 'Builder One' }],
    dayClosures: { speed: { '2026-07-06': { Monday: { entireDay: { closed: true, reason: 'Holiday' } } } } },
    closureRevision: 2, auditLog: [],
  }
}

function version(fields = {}) {
  return {
    id: 'version-1', timestamp: '2026-07-11T10:00:00.000Z', admin: 'ali', boardId: 'speed_day',
    shift: 'Day Shift', week: '2026-07-06', day: 'Monday', reversible: true,
    ...fields,
  }
}

test('version records capture day, builder, goals, rack, and note changes', () => {
  const before = baseState()
  const after = structuredClone(before)
  after.weeklyData.Monday.assignments.b1 = { status: 'Present', area: 'Rack Prep' }
  after.weeklyData.Monday.opsMetrics = { racksProcessed: '4' }
  after.weeklyData.Monday.rackLists = { processed: 'R1 decom' }
  after.weeklyData.Monday.shiftNotes = 'Started late'
  const records = buildVersionRecords(before, after, { actor: 'ali', stateRevision: 'rev-2' })
  const types = new Set(records.map((row) => row.entityType))
  for (const required of ['operational_day', 'builder_assignment', 'day_assignments', 'day_goals', 'day_racks', 'day_notes']) {
    assert.equal(types.has(required), true, `missing ${required}`)
  }
  assert.equal(records.every((row) => row.admin === 'ali' && row.boardId === 'speed_day' && row.week === '2026-07-06'), true)
})

test('operational-day restore preserves current scheduled transitions and closure state', () => {
  const current = baseState()
  current.weeklyData.Monday = day({
    assignments: {
      b1: {
        status: 'Present', area: 'Shipping', scheduledClockOut: { id: 's1', status: 'pending', localTime: '15:00' },
        scheduleHistory: [{ id: 'old' }],
      },
    },
    opsMetrics: { racksProcessed: '9' },
  })
  const previous = day({ assignments: { b1: { status: 'Training', area: 'Rack Prep' } }, opsMetrics: { racksProcessed: '2' } })
  const result = applyVersionRestore(current, version({ entityType: 'operational_day', entityId: 'day', previousValue: previous, newValue: current.weeklyData.Monday }), { actor: 'manager', reason: 'Recover day' })
  const restored = result.state.weeklyData.Monday
  assert.equal(restored.assignments.b1.status, 'Training')
  assert.equal(restored.assignments.b1.area, 'Rack Prep')
  assert.equal(restored.assignments.b1.scheduledClockOut.id, 's1')
  assert.deepEqual(restored.assignments.b1.scheduleHistory, [{ id: 'old' }])
  assert.equal(restored.opsMetrics.racksProcessed, '2')
  assert.deepEqual(result.state.dayClosures, current.dayClosures)
  assert.equal(result.state.auditLog[0].action, 'Restore Version')
})

test('builder restore changes only the selected builder', () => {
  const current = baseState()
  current.weeklyData.Monday.assignments = {
    b1: { status: 'Present', area: 'Shipping', scheduledClockOut: { id: 's1', status: 'pending' } },
    b2: { status: 'Present', area: 'OB1' },
  }
  const result = applyVersionRestore(current, version({
    entityType: 'builder_assignment', entityId: 'b1',
    previousValue: { status: 'PTO', area: '' }, newValue: current.weeklyData.Monday.assignments.b1,
  }), { actor: 'ali' })
  assert.equal(result.state.weeklyData.Monday.assignments.b1.status, 'PTO')
  assert.equal(result.state.weeklyData.Monday.assignments.b1.scheduledClockOut.id, 's1')
  assert.deepEqual(result.state.weeklyData.Monday.assignments.b2, current.weeklyData.Monday.assignments.b2)
})

test('goals, racks, notes, and assignments restore independently', () => {
  const current = baseState()
  current.weeklyData.Monday = day({
    assignments: { b1: { status: 'Present', area: 'OB1' } },
    opsMetrics: { racksProcessed: '10' }, rackLists: { processed: 'R10 speed' }, shiftNotes: 'Current',
  })
  const goals = applyVersionRestore(current, version({ entityType: 'day_goals', previousValue: { racksProcessed: '3' }, newValue: {} }), { actor: 'ali' }).state
  assert.equal(goals.weeklyData.Monday.opsMetrics.racksProcessed, '3')
  assert.equal(goals.weeklyData.Monday.rackLists.processed, 'R10 speed')

  const racks = applyVersionRestore(current, version({ entityType: 'day_racks', previousValue: { processed: 'R2 decom' }, newValue: {} }), { actor: 'ali' }).state
  assert.equal(racks.weeklyData.Monday.rackLists.processed, 'R2 decom')
  assert.equal(racks.weeklyData.Monday.opsMetrics.racksProcessed, '10')

  const notes = applyVersionRestore(current, version({ entityType: 'day_notes', previousValue: { shiftNotes: 'Earlier', notes: 'Legacy' }, newValue: {} }), { actor: 'ali' }).state
  assert.equal(notes.weeklyData.Monday.shiftNotes, 'Earlier')
  assert.equal(notes.weeklyData.Monday.notes, 'Legacy')
})

test('locked week blocks scoped restore', () => {
  const current = baseState()
  current.lockedWeeks['2026-07-06'] = true
  assert.throws(() => applyVersionRestore(current, version({ entityType: 'day_goals', previousValue: {} }), { actor: 'ali' }), /locked/i)
})

test('restore respects board isolation for a stored Night board', () => {
  const current = baseState()
  current.boardStore.speed_night = {
    boardShift: 'Night Shift', weekStartDate: '2026-07-06', lockedWeeks: {},
    weeklyData: { Monday: day({ opsMetrics: { racksProcessed: '8' } }) }, weeklyBoards: {},
  }
  const result = applyVersionRestore(current, version({
    boardId: 'speed_night', shift: 'Night Shift', entityType: 'day_goals',
    previousValue: { racksProcessed: '1' }, newValue: { racksProcessed: '8' },
  }), { actor: 'ali' })
  assert.equal(result.state.boardStore.speed_night.weeklyData.Monday.opsMetrics.racksProcessed, '1')
  assert.deepEqual(result.state.weeklyData, current.weeklyData)
})

test('backup reason detects reset, clear, bulk edit, and template changes', () => {
  const initial = baseState()
  initial.weeklyData.Monday.assignments.b1 = { status: 'Present', area: 'OB1' }
  const reset = structuredClone(initial)
  reset.weeklyData = { Monday: day(), Tuesday: day(), Wednesday: day(), Thursday: day(), Friday: day() }
  assert.equal(detectBackupReason(initial, reset), 'RESET_WEEK')

  const clear = structuredClone(initial)
  clear.weeklyData.Monday = day()
  clear.weeklyData.Tuesday.assignments.x = { status: 'Present' }
  assert.equal(detectBackupReason(initial, clear), 'CLEAR_DAY:Monday')

  const bulkBefore = baseState()
  const bulkAfter = structuredClone(bulkBefore)
  for (let index = 0; index < 10; index += 1) bulkAfter.weeklyData.Monday.assignments[`b${index}`] = { status: 'Present' }
  assert.equal(detectBackupReason(bulkBefore, bulkAfter), 'BULK_EDIT')

  const templateAfter = baseState()
  templateAfter.dayTemplates = [{ id: 't1' }]
  assert.equal(detectBackupReason(baseState(), templateAfter), 'TEMPLATE_CHANGE')
})

test('preview includes scope and restore warning', () => {
  const preview = previewVersionRestore(baseState(), version({ entityType: 'operational_day', previousValue: day() }))
  assert.equal(preview.entityType, 'operational_day')
  assert.match(preview.warning, /scheduled-transition fields/i)
})

test('emergency exports isolate current, week, day, roster, audit, actions, and impact', () => {
  const state = baseState()
  state.weeklyData.Monday.opsMetrics = { racksProcessed: '5' }
  state.operationalActions = [{ id: 'a1' }]
  state.leadershipImpactEvents = [{ id: 'i1' }]
  assert.equal(buildEmergencyExport(state, 'day').data.data.opsMetrics.racksProcessed, '5')
  assert.equal(buildEmergencyExport(state, 'week').data.weeklyData.Monday.opsMetrics.racksProcessed, '5')
  assert.equal(buildEmergencyExport(state, 'builders').data[0].id, 'b1')
  assert.equal(buildEmergencyExport(state, 'actions').data[0].id, 'a1')
  assert.equal(buildEmergencyExport(state, 'impact').data[0].id, 'i1')
  assert.throws(() => buildEmergencyExport(state, 'unknown'), /Unknown administrative export scope/)
})

test('legacy state without optional recovery fields remains restorable', () => {
  const legacy = { currentBoardId: 'speed_day', boardShift: 'Day Shift', weekStartDate: '2026-07-06', weeklyData: { Monday: day() }, boardStore: {}, lockedWeeks: {} }
  const result = applyVersionRestore(legacy, version({ entityType: 'day_goals', previousValue: { mediaProcessed: '7' } }), { actor: 'ali' })
  assert.equal(result.state.weeklyData.Monday.opsMetrics.mediaProcessed, '7')
  assert.equal(result.state.recoveryRevision, 1)
})
