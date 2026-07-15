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

let frontendReady = fs.existsSync(indexFile)
let backendReady = false
let backendFailure = ''
let buildFailure = ''

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function proxyApi(req, res) {
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
    res.writeHead(upstream.statusCode || 502, upstream.headers)
    upstream.pipe(res)
  })

  proxy.setTimeout(25_000, () => {
    proxy.destroy(new Error('StaffBoard backend request timed out.'))
  })
  proxy.on('error', (error) => {
    if (!res.headersSent) {
      sendJson(res, 503, {
        error: 'StaffBoard backend is temporarily unavailable.',
        detail: error.message,
        retryable: true,
      })
    } else {
      res.destroy(error)
    }
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
        error: 'StaffBoard backend is starting. Retry shortly.',
        retryable: true,
        backendFailure: backendFailure || undefined,
      })
    }
    return proxyApi(req, res)
  }
  return frontend(req, res)
})

publicServer.requestTimeout = 30_000
publicServer.headersTimeout = 35_000
publicServer.keepAliveTimeout = 5_000

publicServer.listen(publicPort, '0.0.0.0', () => {
  console.log(`StaffBoard production gateway listening on 0.0.0.0:${publicPort}`)
  console.log(`Static frontend ready: ${frontendReady}`)
})

async function waitForBackend(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const request = http.get({ hostname: '127.0.0.1', port: backendPort, path: '/api/health', timeout: 1000 }, (response) => {
        response.resume()
        resolve(response.statusCode === 200)
      })
      request.on('timeout', () => { request.destroy(); resolve(false) })
      request.on('error', () => resolve(false))
    })
    if (ready) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

async function startBackend() {
  try {
    process.env.PORT = String(backendPort)
    await import('./server-guarded-closures.js')
    backendReady = await waitForBackend()
    if (!backendReady) backendFailure = 'The guarded backend did not become ready within 30 seconds.'
    console.log(`Guarded backend ready: ${backendReady} on 127.0.0.1:${backendPort}`)
  } catch (error) {
    backendFailure = error.message || String(error)
    console.error('Guarded backend failed to start:', error)
  }
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
  console.log(`Production gateway received ${signal}.`)
  publicServer.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))
