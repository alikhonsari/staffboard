import test from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import fs from 'node:fs'
import { decodeRestorePayload, validateRestorePayload } from '../postgres-restore.js'

test('restore decoder accepts plain JSON and gzip JSON', () => {
  const payload = { state: { boardTitle: 'SPEED Staffing Board' }, stateRevision: 221 }
  const json = Buffer.from(JSON.stringify(payload))
  assert.deepEqual(decodeRestorePayload(json, { 'content-type': 'application/json' }), payload)
  assert.deepEqual(
    decodeRestorePayload(zlib.gzipSync(json), { 'content-type': 'application/gzip' }),
    payload,
  )
})

test('restore validation recognizes all three StaffBoard backup formats', () => {
  assert.deepEqual(validateRestorePayload('state', { state: { boardTitle: 'SPEED' } }), { count: 1 })
  assert.deepEqual(validateRestorePayload('history', { events: [{ id: 'one' }, { id: 'two' }] }), { count: 2 })
  assert.deepEqual(validateRestorePayload('versions', { versions: [{ id: 'version-one' }] }), { count: 1 })
})

test('restore validation rejects malformed or unknown payloads', () => {
  assert.throws(() => validateRestorePayload('state', { events: [] }), /state object/)
  assert.throws(() => validateRestorePayload('history', { events: {} }), /events array/)
  assert.throws(() => validateRestorePayload('versions', { versions: {} }), /versions array/)
  assert.throws(() => validateRestorePayload('other', {}), /state, history, or versions/)
})

test('server mounts restore route before the normal JSON body parser', () => {
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8')
  const restorePosition = server.indexOf('installPostgresRestoreRoutes(app')
  const jsonPosition = server.indexOf('app.use(express.json({ limit: STATE_JSON_LIMIT }))')
  assert.ok(restorePosition >= 0)
  assert.ok(jsonPosition > restorePosition)
  assert.match(server, /STAFFBOARD_STATE_JSON_LIMIT/)
  assert.match(server, /STAFFBOARD_VERSION_HISTORY_KEY/)
  assert.match(server, /restoreEnabled/)
})
