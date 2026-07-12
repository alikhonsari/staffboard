import test from 'node:test'
import assert from 'node:assert/strict'
import { validateActionPayload, validateBackupEnvelope, validateStateShape } from '../platform/validation.js'
import { checksumBackup, verifyBackupEnvelope } from '../platform/backup-verification.js'

function validState() {
  return {
    currentBoardId: 'speed_day',
    weekStartDate: '2026-07-06',
    selectedDay: 'Monday',
    weeklyData: { Monday: { assignments: {} } },
    builderPool: [],
    boardStore: {},
    stateRevision: 3,
  }
}

test('state validation accepts compatible production state and rejects unknown boards', () => {
  assert.equal(validateStateShape(validState()).ok, true)
  const invalid = validState()
  invalid.currentBoardId = 'unknown'
  const result = validateStateShape(invalid)
  assert.equal(result.ok, false)
  assert.match(result.issues[0].path, /currentBoardId/)
})

test('action validation identifies malformed scheduling and closure requests', () => {
  const schedule = validateActionPayload('schedule', { action: 'schedule', boardId: 'speed_day', weekStartDate: '2026-07-06', day: 'Monday' })
  assert.equal(schedule.ok, false)
  assert.ok(schedule.issues.some((issue) => issue.path === 'builderId'))

  const closure = validateActionPayload('closure', { action: 'close', boardId: 'speed_day', weekStartDate: '2026-07-06', day: 'Monday', scope: 'invalid' })
  assert.equal(closure.ok, false)
  assert.ok(closure.issues.some((issue) => issue.path === 'scope'))
})

test('backup verification calculates stable checksum and validates required structure', () => {
  const envelope = {
    metadata: { id: 'backup-1', createdAt: '2026-07-12T00:00:00.000Z' },
    state: validState(),
  }
  const first = checksumBackup(envelope)
  const second = checksumBackup(envelope)
  assert.equal(first, second)
  assert.equal(first.length, 64)

  const result = verifyBackupEnvelope(envelope, { actor: 'Ali' })
  assert.equal(result.valid, true)
  assert.equal(result.verifiedBy, 'Ali')
  assert.equal(result.stateRevision, 3)
})

test('corrupt and incomplete backups fail verification', () => {
  const incomplete = validateBackupEnvelope({ metadata: { id: '', createdAt: '' }, state: {} })
  assert.equal(incomplete.ok, false)
  assert.ok(incomplete.issues.length >= 3)

  const result = verifyBackupEnvelope({ not: 'a backup' })
  assert.equal(result.valid, false)
  assert.equal(result.status, 'invalid')
})
