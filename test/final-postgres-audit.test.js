import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { diagnosticsSnapshot } from '../platform/diagnostics.js'
import { validateEnvironment } from '../platform/config.js'

const routes = fs.readFileSync(new URL('../platform/routes.js', import.meta.url), 'utf8')
const diagnostics = fs.readFileSync(new URL('../platform/diagnostics.js', import.meta.url), 'utf8')
const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8')
const runtime = fs.readFileSync(new URL('../guarded-server-runtime.js', import.meta.url), 'utf8')
const diagnosticsPanel = fs.readFileSync(new URL('../src/DiagnosticsPanel.jsx', import.meta.url), 'utf8')

test('platform readiness and diagnostics depend on PostgreSQL, never Spaces', () => {
  assert.match(routes, /config\.postgresConfigured/)
  assert.doesNotMatch(routes, /config\.spacesConfigured/)
  assert.match(diagnostics, /baseConfig\.postgresConfigured/)
  assert.doesNotMatch(diagnostics, /baseConfig\.spacesConfigured/)
  assert.doesNotMatch(diagnosticsPanel, /<dt>Spaces<\/dt>|spacesConfigured/)
  assert.match(diagnosticsPanel, /<dt>PostgreSQL<\/dt>/)
})

test('large-state warnings degrade diagnostics without marking PostgreSQL unavailable', () => {
  const snapshot = diagnosticsSnapshot(
    { storageBackend: 'postgres', postgresConfigured: true },
    { builderPool: [], oversized: 'x'.repeat(8 * 1024 * 1024) },
  )
  assert.equal(snapshot.postgresConfigured, true)
  assert.equal(snapshot.degraded, true)
  assert.equal(snapshot.warnings.length > 0, true)
  assert.match(routes, /res\.status\(storageHealthy \? 200 : 503\)/)
})

test('production validation recognizes numbered admins and requires a dedicated session secret', () => {
  const valid = validateEnvironment(
    { postgresConfigured: true, timeZone: 'America\/New_York' },
    {
      NODE_ENV: 'production',
      STAFFBOARD_ADMIN_1_USER: 'ali',
      STAFFBOARD_ADMIN_1_PASS: 'secret',
      AUTH_SECRET: 'session-secret',
    },
  )
  assert.equal(valid.ok, true)

  const missingSecret = validateEnvironment(
    { postgresConfigured: true, timeZone: 'America\/New_York' },
    {
      NODE_ENV: 'production',
      STAFFBOARD_ADMIN_1_USER: 'ali',
      STAFFBOARD_ADMIN_1_PASS: 'secret',
    },
  )
  assert.equal(missingSecret.ok, false)
  assert.match(missingSecret.errors.join(' '), /session signing/i)
})

test('session signing never falls back to the PostgreSQL password', () => {
  assert.doesNotMatch(server, /AUTH_SECRET[^\n]*PGPASSWORD/)
  assert.doesNotMatch(runtime, /authSecret:[^\n]*PGPASSWORD/)
  assert.match(server, /STAFFBOARD_SESSION_SECRET/)
  assert.match(runtime, /STAFFBOARD_SESSION_SECRET/)
})

test('selected day is browser navigation and is not persisted in board-scoped server state', () => {
  const scopedKeys = server.match(/const BOARD_SCOPED_KEYS = \[([^\]]+)\]/)?.[1] || ''
  assert.doesNotMatch(scopedKeys, /selectedDay/)
  assert.match(server, /delete output\.selectedDay/)
  assert.match(server, /delete merged\.selectedDay/)
  assert.match(server, /selectedDay: clean\(req\.body\?\.viewContext\?\.day\)/)
})

test('public backend health does not expose admin usernames or internal document keys', () => {
  const healthRoute = server.slice(server.indexOf("app.get('/api/health'"), server.indexOf("app.post('/api/login'"))
  assert.doesNotMatch(healthRoute, /admins:/)
  assert.doesNotMatch(healthRoute, /stateKey|historyKey|versionHistoryKey/)
  assert.match(healthRoute, /storageBackend: 'postgres'/)
})
