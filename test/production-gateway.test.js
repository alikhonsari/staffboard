import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const gateway = fs.readFileSync(new URL('../production-server.js', import.meta.url), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const legacyServer = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8')

test('production start uses the immediate gateway rather than Vite middleware', () => {
  assert.equal(packageJson.scripts.start, 'node production-server.js')
  assert.equal(packageJson.scripts.dev, 'node server-guarded-closures.js')
  assert.match(legacyServer, /createViteServer/)
  assert.doesNotMatch(gateway, /createViteServer|vite\.middlewares/)
})

test('production gateway opens the public port before starting the guarded backend', () => {
  const listenIndex = gateway.indexOf("publicServer.listen(publicPort, '0.0.0.0'")
  const backendIndex = gateway.lastIndexOf('startBackend()')
  assert.ok(listenIndex >= 0, 'public gateway must bind to 0.0.0.0')
  assert.ok(backendIndex > listenIndex, 'backend startup must happen after the public listener is installed')
})

test('guarded backend runs in a supervised child process', () => {
  assert.match(gateway, /spawn\(process\.execPath, \[backendEntry\]/)
  assert.doesNotMatch(gateway, /await import\('\.\/server-guarded-closures\.js'\)/)
  assert.match(gateway, /backendChild\.on\('exit'/)
  assert.match(gateway, /scheduleBackendRestart\(reason\)/)
  assert.match(gateway, /STAFFBOARD_BACKEND_RESTART_DELAY_MS/)
})

test('backend failure does not terminate the public gateway', () => {
  const exitHandler = gateway.slice(gateway.indexOf("backendChild.on('exit'"), gateway.indexOf('function buildFrontendIfNeeded'))
  assert.doesNotMatch(exitHandler, /process\.exit/)
  assert.match(exitHandler, /backendReady = false/)
  assert.match(exitHandler, /backendChild = null/)
  assert.match(gateway, /StaffBoard backend is restarting\. Retry shortly\./)
})

test('production gateway serves static dist assets and SPA fallback', () => {
  assert.match(gateway, /express\.static\(distDir/)
  assert.match(gateway, /res\.sendFile\(indexFile/)
  assert.match(gateway, /cache-control': 'no-cache'/)
})

test('health remains responsive while frontend and backend prepare', () => {
  assert.match(gateway, /req\.url\.startsWith\('\/api\/health'\) && !backendReady/)
  assert.match(gateway, /sendJson\(res, 200/)
  assert.match(gateway, /frontendReady/)
  assert.match(gateway, /backendReady/)
})

test('API proxy has a bounded timeout and controlled failure response', () => {
  assert.match(gateway, /proxy\.setTimeout\(25_000/)
  assert.match(gateway, /StaffBoard backend is temporarily unavailable/)
  assert.match(gateway, /sendJson\(res, 503/)
})

test('missing dist starts a background build after the public server exists', () => {
  assert.match(gateway, /spawn\('npm', \['run', 'build'\]/)
  assert.match(gateway, /Production dist\/index\.html is missing/)
  assert.match(gateway, /buildFrontendIfNeeded\(\)[\s\S]*startBackend\(\)/)
})

test('shutdown terminates the supervised backend before exiting gateway', () => {
  assert.match(gateway, /backendChild\.kill\('SIGTERM'\)/)
  assert.match(gateway, /if \(shuttingDown\) return/)
})
