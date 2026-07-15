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

test('guarded backend runs in a supervised API-only child process', () => {
  assert.match(gateway, /spawn\(process\.execPath, \[backendEntry\]/)
  assert.doesNotMatch(gateway, /await import\('\.\/server-guarded-closures\.js'\)/)
  assert.match(gateway, /STAFFBOARD_API_ONLY: '1'/)
  assert.match(gateway, /NODE_ENV: 'production'/)
  assert.match(gateway, /backendChild\.on\('exit'/)
  assert.match(gateway, /scheduleBackendRestart\(reason\)/)
  assert.match(gateway, /STAFFBOARD_BACKEND_RESTART_DELAY_MS/)
})

test('backend failure does not terminate the public gateway', () => {
  const exitHandler = gateway.slice(gateway.indexOf("backendChild.on('exit'"), gateway.indexOf('function buildFrontendIfNeeded'))
  assert.doesNotMatch(exitHandler, /process\.exit/)
  assert.match(exitHandler, /backendReady = false/)
  assert.match(exitHandler, /backendChild = null/)
  assert.match(gateway, /StaffBoard backend is recovering\. Retry shortly\./)
})

test('client-aborted requests do not poison backend readiness', () => {
  assert.match(gateway, /let clientAborted = false/)
  assert.match(gateway, /req\.once\('aborted'/)
  assert.match(gateway, /if \(clientAborted \|\| req\.aborted \|\| res\.destroyed\) return/)
  const proxyError = gateway.slice(gateway.indexOf("proxy.on('error'"), gateway.indexOf('const frontend = express()'))
  assert.doesNotMatch(proxyError, /backendReady = false/)
})

test('gateway re-probes backend readiness instead of remaining stuck false', () => {
  assert.match(gateway, /let backendProbePromise = null/)
  assert.match(gateway, /function refreshBackendReadiness/)
  assert.match(gateway, /if \(backendProbePromise\) return backendProbePromise/)
  assert.match(gateway, /if \(!backendReady\) refreshBackendReadiness/)
  assert.match(gateway, /backendReady = ready/)
  assert.match(gateway, /backendProbeIntervalMs/)
})

test('production gateway serves static dist assets and SPA fallback', () => {
  assert.match(gateway, /express\.static\(distDir/)
  assert.match(gateway, /res\.sendFile\(indexFile/)
  assert.match(gateway, /cache-control': 'no-cache'/)
})

test('liveness is always local and never proxied to the backend', () => {
  const healthIndex = gateway.indexOf("requestPath === '/api/health'")
  const apiProxyIndex = gateway.indexOf("requestPath.startsWith('/api/')")
  assert.ok(healthIndex >= 0, 'local /api/health route must exist')
  assert.ok(apiProxyIndex > healthIndex, 'liveness must be handled before generic API proxying')
  assert.match(gateway, /requestPath === '\/healthz'/)
  assert.match(gateway, /return sendJson\(res, 200, healthPayload\(\)\)/)
  assert.match(gateway, /service: 'staffboard-gateway'/)
})

test('readiness is separate and reports backend state explicitly', () => {
  assert.match(gateway, /requestPath === '\/api\/ready'/)
  assert.match(gateway, /requestPath === '\/readyz'/)
  assert.match(gateway, /const ready = frontendReady && backendReady/)
  assert.match(gateway, /ready \? 200 : 503/)
  assert.match(gateway, /backendRestartCount/)
  assert.match(gateway, /backendStartedAt/)
})

test('API proxy has bounded read and mutation timeouts with controlled failure response', () => {
  assert.match(gateway, /readProxyTimeoutMs[\s\S]*25000/)
  assert.match(gateway, /mutationProxyTimeoutMs[\s\S]*65000/)
  assert.match(gateway, /proxy\.setTimeout\(timeoutMs/)
  assert.match(gateway, /StaffBoard backend is temporarily unavailable/)
  assert.match(gateway, /sendJson\(res, 503/)
})

test('missing dist starts a background build after the public server exists', () => {
  assert.match(gateway, /spawn\('npm', \['run', 'build'\]/)
  assert.match(gateway, /Production dist\/index\.html is missing/)
  assert.match(gateway, /buildFrontendIfNeeded\(\)[\s\S]*startBackend\(\)/)
})

test('shutdown terminates probes and supervised backend before exiting gateway', () => {
  assert.match(gateway, /clearInterval\(backendProbeTimer\)/)
  assert.match(gateway, /backendChild\.kill\('SIGTERM'\)/)
  assert.match(gateway, /if \(shuttingDown\) return/)
})
