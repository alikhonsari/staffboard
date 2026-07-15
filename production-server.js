import express from 'express'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const publicPort = Number(process.env.PORT || 8080)
const backendPort = Number(process.env.STAFFBOARD_INTERNAL_PORT || publicPort + 1000)
const distDir = path.join(__dirname, 'dist')
const indexFile = path.join(distDir, 'index.html')
const backendEntry = path.join(__dirname, 'server-guarded-closures.js')
const backendRestartDelayMs = Number(process.env.STAFFBOARD_BACKEND_RESTART_DELAY_MS || 1500)
const readProxyTimeoutMs = Number(process.env.STAFFBOARD_READ_PROXY_TIMEOUT_MS || 25000)
const mutationProxyTimeoutMs = Number(process.env.STAFFBOARD_MUTATION_PROXY_TIMEOUT_MS || 65000)
const backendProbeTimeoutMs = Number(process.env.STAFFBOARD_BACKEND_PROBE_TIMEOUT_MS || 2000)

let frontendReady = fs.existsSync(indexFile)
let backendReady = false
let backendFailure = ''
let buildFailure = ''
let backendChild = null
let backendRestartTimer = null
let backendProbePromise = null
let shuttingDown = false

function sendJson(res, status, payload) {
  if (res.destroyed || res.writableEnded) return
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function probeBackendOnce(timeoutMs = backendProbeTimeoutMs) {
  return new Promise((resolve) => {
    const request = http.get({
      hostname: '127.0.0.1',
      port: backendPort,
      path: '/api/health',
      timeout: timeoutMs,
    }, (response) => {
      response.resume()
      resolve(response.statusCode === 200)
    })
    request.once('timeout', () => { request.destroy(); resolve(false) })
    request.once('error', () => resolve(false))
  })
}

function refreshBackendReadiness(reason = '') {
  if (shuttingDown) return Promise.resolve(false)
  if (backendProbePromise) return backendProbePromise
  backendProbePromise = probeBackendOnce().then((ready) => {
    backendReady = ready
    if (ready) {
      backendFailure = ''
    } else if (reason) {
      backendFailure = reason
    }
    return ready
  }).finally(() => {
    backendProbePromise = null
  })
  return backendProbePromise
}

function proxyApi(req, res) {
  const method = String(req.method || 'GET').toUpperCase()
  const timeoutMs = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
    ? mutationProxyTimeoutMs
    : readProxyTimeoutMs
  let clientAborted = false

  const proxy = http.request({
    hostname: '127.0.0.1',
    port: backendPort,
    method: req.method,
    path: req.url,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${backendPort}`,
      'x-forwarded-host': req.headers.host || '',
      'x-forwarded-proto': req.headers['x-forwarded-proto'] || 'https',
    },
  }, (upstream) => {
    backendReady = true
    backendFailure = ''
    if (res.destroyed || res.writableEnded) {
      upstream.destroy()
      return
    }
    res.writeHead(upstream.statusCode || 502, upstream.headers)
    upstream.pipe(res)
  })

  req.once('aborted', () => {
    clientAborted = true
    proxy.destroy()
  })
  res.once('close', () => {
    if (!res.writableEnded) {
      clientAborted = true
      proxy.destroy()
    }
  })

  proxy.setTimeout(timeoutMs, () => {
    proxy.destroy(new Error(`StaffBoard backend ${method} request timed out after ${timeoutMs}ms.`))
  })
  proxy.on('error', (error) => {
    if (clientAborted || req.aborted || res.destroyed) return

    backendFailure = error.message || String(error)
    refreshBackendReadiness(backendFailure).catch(() => {})
    sendJson(res, 503, {
      error: 'StaffBoard backend is temporarily unavailable.',
      detail: backendFailure,
      retryable: true,
    })
  })
  req.pipe(proxy)
}

const frontend = express()
frontend.disable('x-powered-by')
frontend.use(express.static(distDir, {
  index: false,
  maxAge: '1h',
  immutable: true,
  fallthrough: true,
}))
frontend.get('*', (req, res) => {
  if (!frontendReady) {
    return res.status(503).json({
      error: 'StaffBoard frontend is preparing. Retry shortly.',
      retryable: true,
      buildFailure: buildFailure || undefined,
    })
  }
  return res.sendFile(indexFile, { headers: { 'cache-control': 'no-cache' } })
})

const publicServer = http.createServer((req, res) => {
  if (req.url?.startsWith('/api/')) {
    if (!backendReady) refreshBackendReadiness(backendFailure || 'Backend readiness probe failed.').catch(() => {})
    if (req.url.startsWith('/api/health') && !backendReady) {
      return sendJson(res, 200, {
        ok: true,
        ready: false,
        frontendReady,
        backendReady,
        backendFailure: backendFailure || undefined,
        buildFailure: buildFailure || undefined,
      })
    }
    if (!backendReady) {
      return sendJson(res, 503, {
        error: 'StaffBoard backend is recovering. Retry shortly.',
        retryable: true,
        backendFailure: backendFailure || undefined,
      })
    }
    return proxyApi(req, res)
  }
  return frontend(req, res)
})

publicServer.requestTimeout = 70_000
publicServer.headersTimeout = 75_000
publicServer.keepAliveTimeout = 5_000

publicServer.listen(publicPort, '0.0.0.0', () => {
  console.log(`StaffBoard production gateway listening on 0.0.0.0:${publicPort}`)
  console.log(`Static frontend ready: ${frontendReady}`)
})

async function waitForBackend(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (!shuttingDown && Date.now() < deadline) {
    if (await probeBackendOnce(1000)) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

function scheduleBackendRestart(reason) {
  if (shuttingDown || backendRestartTimer) return
  backendFailure = reason || 'Guarded backend exited unexpectedly.'
  backendRestartTimer = setTimeout(() => {
    backendRestartTimer = null
    startBackend()
  }, backendRestartDelayMs)
  backendRestartTimer.unref?.()
}

function startBackend() {
  if (shuttingDown || backendChild) return
  backendReady = false
  backendFailure = ''
  backendChild = spawn(process.execPath, [backendEntry], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(backendPort),
      STAFFBOARD_PUBLIC_PORT: String(publicPort),
      NODE_ENV: 'production',
    },
    stdio: 'inherit',
  })

  backendChild.on('error', (error) => {
    backendFailure = error.message || String(error)
    console.error('Guarded backend process could not start:', error)
  })
  backendChild.on('exit', (code, signal) => {
    const reason = `Guarded backend exited with code ${code ?? 'null'}${signal ? ` from ${signal}` : ''}.`
    console.error(reason)
    backendReady = false
    backendChild = null
    scheduleBackendRestart(reason)
  })

  waitForBackend().then((ready) => {
    if (backendChild && !shuttingDown) {
      backendReady = ready
      if (!ready) backendFailure = 'The guarded backend did not become ready within 30 seconds.'
      console.log(`Guarded backend ready: ${backendReady} on 127.0.0.1:${backendPort}`)
    }
  }).catch((error) => {
    backendReady = false
    backendFailure = error.message || String(error)
  })
}

function buildFrontendIfNeeded() {
  if (frontendReady) return
  console.warn('Production dist/index.html is missing; starting a one-time background build.')
  const child = spawn('npm', ['run', 'build'], {
    cwd: __dirname,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(publicPort) },
    stdio: 'inherit',
  })
  child.on('error', (error) => {
    buildFailure = error.message || String(error)
    console.error('Frontend build could not start:', error)
  })
  child.on('exit', (code) => {
    frontendReady = code === 0 && fs.existsSync(indexFile)
    if (!frontendReady) buildFailure = `Frontend build exited with code ${code}.`
    console.log(`Static frontend ready after build: ${frontendReady}`)
  })
}

buildFrontendIfNeeded()
startBackend()

function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Production gateway received ${signal}.`)
  if (backendRestartTimer) clearTimeout(backendRestartTimer)
  if (backendChild && !backendChild.killed) backendChild.kill('SIGTERM')
  publicServer.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))