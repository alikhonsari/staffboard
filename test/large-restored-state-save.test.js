import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { hardenPostgresStateClient } from '../postgres-state-save-plugin.js'

const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8')
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const vite = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

test('large restored board state uses a configurable 64 MB JSON limit', () => {
  assert.match(server, /STAFFBOARD_STATE_JSON_LIMIT/)
  assert.match(server, /'64mb'/)
  assert.match(server, /express\.json\(\{ limit: STATE_JSON_LIMIT \}\)/)
  assert.match(server, /STATE_PAYLOAD_TOO_LARGE/)
  assert.match(server, /stateJsonLimit: STATE_JSON_LIMIT/)
})

test('legacy imported Spaces configuration is replaced by PostgreSQL status', () => {
  const transformed = hardenPostgresStateClient(app)
  assert.match(transformed, /mode: 'postgres'/)
  assert.match(transformed, /backend: 'postgres'/)
  assert.doesNotMatch(transformed, /mode: 'spaces-auto'/)
  assert.match(server, /storageConfig: \{ mode: 'postgres', backend: 'postgres' \}/)
})

test('save failures display the actual server error instead of Save pending', () => {
  const transformed = hardenPostgresStateClient(app)
  assert.match(transformed, /setSyncStatus\('Save failed: ' \+ message\)/)
  assert.doesNotMatch(transformed, /setSyncStatus\('Save pending'\)/)
})

test('PostgreSQL state-save hardening is wired before App transforms', () => {
  assert.match(vite, /postgresStateSavePlugin/)
  assert.match(vite, /requestTimeoutPlugin\(\), postgresStateSavePlugin\(\)/)
})
