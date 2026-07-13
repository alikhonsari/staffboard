import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDayClosurePayload, createDayClosureError, validateDayClosurePayload, validateDayClosureSuccess,
} from '../src/day-closure-client-core.js'
import { evaluateMutationRevision } from '../platform/mutation-revision.js'
import { validateActionPayload } from '../platform/validation.js'

const baseDetails = {
  boardId: 'speed_day',
  weekStartDate: '2026-07-13',
  day: 'Monday',
  scope: 'entire_day',
  reason: 'Holiday',
  customReason: '',
  note: 'Site holiday',
}

test('closure payload includes authoritative timestamp and numeric revision', () => {
  const payload = buildDayClosurePayload('close', { ...baseDetails, requestId: 'closure-request-1' }, {
    updatedAt: '2026-07-13T12:00:00.000Z',
    stateRevision: 42,
  })
  assert.equal(payload.action, 'close')
  assert.equal(payload.requestId, 'closure-request-1')
  assert.equal(payload.baseUpdatedAt, '2026-07-13T12:00:00.000Z')
  assert.equal(payload.baseStateRevision, 42)
  assert.equal(validateDayClosurePayload(payload).ok, true)
})

test('close validation requires a supported reason and custom reason for Other', () => {
  const missing = validateDayClosurePayload({ ...baseDetails, action: 'close', reason: '' })
  assert.equal(missing.ok, false)
  assert.match(missing.issues.join(' '), /reason/i)

  const custom = validateDayClosurePayload({ ...baseDetails, action: 'close', reason: 'Other', customReason: '' })
  assert.equal(custom.ok, false)
  assert.match(custom.issues.join(' '), /custom closure reason/i)

  const serverValidation = validateActionPayload('closure', { ...baseDetails, action: 'close', reason: 'Other', customReason: '' })
  assert.equal(serverValidation.ok, false)
  assert.ok(serverValidation.issues.some((issue) => issue.path === 'customReason'))
})

test('reopen validation does not require a new closure reason', () => {
  const payload = { ...baseDetails, action: 'reopen', reason: '', customReason: '' }
  assert.equal(validateDayClosurePayload(payload).ok, true)
  assert.equal(validateActionPayload('closure', payload).ok, true)
})

test('closure errors preserve conflict status code and request ID', () => {
  const error = createDayClosureError(409, {
    error: 'The board changed in another session.',
    conflict: true,
    requestId: 'req-409',
    errorDetail: {
      code: 'STATE_REVISION_CONFLICT',
      message: 'The board changed in another session.',
      retryable: true,
      details: { currentStateRevision: 43 },
      requestId: 'req-409',
    },
  })
  assert.equal(error.conflict, true)
  assert.equal(error.code, 'STATE_REVISION_CONFLICT')
  assert.equal(error.requestId, 'req-409')
  assert.equal(error.details.currentStateRevision, 43)
})

test('closure success requires a persisted state payload', () => {
  assert.throws(() => validateDayClosureSuccess({ message: 'ok' }), /did not return the persisted/i)
  const state = { currentBoardId: 'speed_day', dayClosures: { speed: {} } }
  assert.equal(validateDayClosureSuccess({ state }), state)
  assert.equal(validateDayClosureSuccess({ normalizedState: state }), state)
})

test('mutation revision guard accepts current revision and rejects missing or stale clients', () => {
  const current = { updatedAt: '2026-07-13T12:00:00.000Z', stateRevision: 8, state: { stateRevision: 8 } }
  assert.equal(evaluateMutationRevision({ baseStateRevision: 8, baseUpdatedAt: current.updatedAt }, current).ok, true)

  const missing = evaluateMutationRevision({}, current)
  assert.equal(missing.ok, false)
  assert.equal(missing.reason, 'missing')

  const stale = evaluateMutationRevision({ baseStateRevision: 7, baseUpdatedAt: current.updatedAt }, current)
  assert.equal(stale.ok, false)
  assert.equal(stale.reason, 'revision')
  assert.equal(stale.currentRevision, 8)
})
