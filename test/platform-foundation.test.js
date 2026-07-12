import test from 'node:test'
import assert from 'node:assert/strict'
import { validateEnvironment, safeConfigSummary } from '../platform/config.js'
import { errorPayload, errors } from '../platform/errors.js'
import { __test as loggerTest } from '../platform/logger.js'
import { hasPermission, normalizeRole } from '../platform/permissions.js'

test('production environment validation requires auth and Spaces without exposing secrets', () => {
  const result = validateEnvironment({ bucket: '', endpoint: '', accessKey: '', secretKey: '', timeZone: 'America/New_York' }, { NODE_ENV: 'production' })
  assert.equal(result.ok, false)
  assert.match(result.errors.join(' '), /authentication/i)
  assert.match(result.errors.join(' '), /Spaces/i)

  const summary = safeConfigSummary({ authToken: 'secret', authSecret: 'secret', spacesConfigured: true, key: 'state.json', historyKey: 'history.json', timeZone: 'America/New_York' })
  assert.equal(summary.authConfigured, true)
  assert.equal(Object.hasOwn(summary, 'authToken'), false)
  assert.equal(Object.hasOwn(summary, 'authSecret'), false)
})

test('structured errors keep the legacy error string and request ID', () => {
  const payload = errorPayload(errors.conflict('Changed elsewhere.', { revision: 4 }), 'req-1')
  assert.equal(payload.error, 'Changed elsewhere.')
  assert.equal(payload.errorDetail.code, 'STATE_REVISION_CONFLICT')
  assert.equal(payload.errorDetail.retryable, true)
  assert.equal(payload.requestId, 'req-1')
})

test('logger redacts nested credentials', () => {
  const value = loggerTest.redact({ token: 'abc', nested: { password: 'secret', value: 2 }, authorization: 'Bearer x' })
  assert.equal(value.token, '[REDACTED]')
  assert.equal(value.nested.password, '[REDACTED]')
  assert.equal(value.nested.value, 2)
  assert.equal(value.authorization, '[REDACTED]')
})

test('permission model preserves admin access and limits read only users', () => {
  assert.equal(normalizeRole('Read Only'), 'read_only')
  assert.equal(hasPermission({ role: 'admin' }, 'backup:restore'), true)
  assert.equal(hasPermission({ role: 'read only' }, 'board:view'), true)
  assert.equal(hasPermission({ role: 'read only' }, 'board:edit'), false)
})
