import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mergeIncomingState } from '../status-save-hotfix.js'

function day(status = 'Present') {
  return {
    assignments: { b1: { status, area: 'Rack Prep' } },
    movementLog: [], attendanceLog: [], opsMetrics: {}, rackLists: {}, snapshots: {},
  }
}

test('fast merge preserves unrelated boards while applying LOA/PTO status changes', () => {
  const existing = {
    currentBoardId: 'speed_day',
    weekStartDate: '2026-07-13',
    selectedDay: 'Monday',
    weeklyData: { Monday: day('Present') },
    weeklyBoards: { '2026-07-13': { Monday: day('Present') } },
    boardStore: {
      speed_day: { weekStartDate: '2026-07-13', weeklyData: { Monday: day('Present') }, weeklyBoards: {} },
      speed_night: { weekStartDate: '2026-07-13', weeklyData: { Monday: day('PTO') }, weeklyBoards: {} },
      fa_day: { weekStartDate: '2026-07-13', weeklyData: { Monday: day('LOA') }, weeklyBoards: {} },
    },
  }
  const incoming = structuredClone(existing)
  incoming.weeklyData.Monday.assignments.b1.status = 'LOA'
  incoming.weeklyBoards['2026-07-13'].Monday.assignments.b1.status = 'LOA'
  incoming.boardStore.speed_day.weeklyData.Monday.assignments.b1.status = 'LOA'

  const merged = mergeIncomingState(existing, incoming)
  assert.equal(merged.weeklyData.Monday.assignments.b1.status, 'LOA')
  assert.equal(merged.boardStore.speed_day.weeklyData.Monday.assignments.b1.status, 'LOA')
  assert.equal(merged.boardStore.speed_night.weeklyData.Monday.assignments.b1.status, 'PTO')
  assert.equal(merged.boardStore.fa_day.weeklyData.Monday.assignments.b1.status, 'LOA')
})

test('empty incoming board snapshots cannot erase populated stored boards', () => {
  const existing = {
    currentBoardId: 'speed_day',
    weekStartDate: '2026-07-13',
    weeklyData: { Monday: day('Present') },
    weeklyBoards: {},
    boardStore: { speed_night: { weekStartDate: '2026-07-13', weeklyData: { Monday: day('PTO') }, weeklyBoards: {} } },
  }
  const incoming = {
    ...existing,
    boardStore: { speed_night: { weekStartDate: '2026-07-13', weeklyData: {}, weeklyBoards: {} } },
  }
  const merged = mergeIncomingState(existing, incoming)
  assert.equal(merged.boardStore.speed_night.weeklyData.Monday.assignments.b1.status, 'PTO')
})

test('server bootstrap installs hotfix before guarded polling routes and uses fast state wrappers', () => {
  const source = fs.readFileSync(new URL('../server-guarded-closures.js', import.meta.url), 'utf8')
  assert.match(source, /installStatusSaveHotfix\(this\)[\s\S]*installGuardedRoutes\(this\)/)
  assert.match(source, /wrapFastStateGet/)
  assert.match(source, /wrapFastStateSave/)
})

test('hotfix keeps response-critical save separate from post-save maintenance', () => {
  const source = fs.readFileSync(new URL('../status-save-hotfix.js', import.meta.url), 'utf8')
  const responseIndex = source.indexOf('res.json(payload)')
  const maintenanceIndex = source.indexOf('queuePostSave(async () =>')
  assert.ok(responseIndex > 0)
  assert.ok(maintenanceIndex > responseIndex)
  assert.match(source, /app\.get\('\/api\/scheduled-transitions\/status'/)
  assert.match(source, /app\.get\('\/api\/day-closures\/status'/)
  assert.doesNotMatch(source.slice(source.indexOf('installStatusSaveHotfix')), /enqueue\(.*status/)
})
