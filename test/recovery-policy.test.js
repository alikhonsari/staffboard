import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarBackupPlan, mondayKey, retainUniqueNewest, retentionSummary } from '../recovery-policy.js'

test('retention keeps newest unique backups and identifies objects to prune', () => {
  const rows = [
    { id: 'a', createdAt: '2026-07-01T00:00:00.000Z' },
    { id: 'b', createdAt: '2026-07-03T00:00:00.000Z' },
    { id: 'a', createdAt: '2026-07-04T00:00:00.000Z' },
    { id: 'c', createdAt: '2026-07-02T00:00:00.000Z' },
  ]
  const { keep, remove } = retainUniqueNewest(rows, 2)
  assert.deepEqual(keep.map((row) => row.id), ['a', 'b'])
  assert.deepEqual(remove.map((row) => row.id), ['c'])
  assert.deepEqual(retentionSummary(rows, 2), {
    kept: 2,
    removed: 1,
    oldestKept: '2026-07-03T00:00:00.000Z',
    newestKept: '2026-07-04T00:00:00.000Z',
  })
})

test('calendar policy creates at most one daily and weekly snapshot for the period', () => {
  const now = new Date('2026-07-11T12:00:00.000Z')
  assert.equal(mondayKey(now), '2026-07-06')
  const empty = calendarBackupPlan([], now)
  assert.equal(empty.needsDaily, true)
  assert.equal(empty.needsWeekly, true)

  const complete = calendarBackupPlan([
    { kind: 'daily', createdAt: '2026-07-11T08:00:00.000Z' },
    { kind: 'weekly', weekBackupKey: '2026-07-06', createdAt: '2026-07-07T08:00:00.000Z' },
  ], now)
  assert.equal(complete.needsDaily, false)
  assert.equal(complete.needsWeekly, false)
})
