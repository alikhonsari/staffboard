import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function requestJson(port, path, timeoutMs = 1000) {
  return await new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, path, timeout: timeoutMs }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        try {
          resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) })
        } catch (error) {
          reject(error)
        }
      })
    })
    request.once('timeout', () => request.destroy(new Error('request timed out')))
    request.once('error', reject)
  })
}

async function waitForHealth(port, child, stderr, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`production gateway exited with code ${child.exitCode}: ${stderr.join('')}`)
    }
    try {
      return await requestJson(port, '/healthz')
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw new Error(`${lastError?.message || 'health endpoint did not become available'}; stderr: ${stderr.join('')}`)
}

test('DigitalOcean web process binds immediately even when backend cannot become ready', async (t) => {
  const publicPort = await getFreePort()
  const internalPort = await getFreePort()
  const stderr = []
  const child = spawn(process.execPath, ['production-server.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(publicPort),
      STAFFBOARD_INTERNAL_PORT: String(internalPort),
      STAFFBOARD_BACKEND_RESTART_DELAY_MS: '60000',
      STAFFBOARD_BACKEND_PROBE_INTERVAL_MS: '60000',
      STAFFBOARD_BACKEND_PROBE_TIMEOUT_MS: '100',
      STAFFBOARD_PG_CONNECT_TIMEOUT_MS: '100',
      PGHOST: '',
      PGUSER: '',
      PGPASSWORD: '',
      PGDATABASE: '',
      DATABASE_URL: '',
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk).toString('utf8')))

  t.after(() => {
    if (!child.killed) child.kill('SIGTERM')
  })

  const result = await waitForHealth(publicPort, child, stderr)
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
  assert.equal(result.body.service, 'staffboard-gateway')
})

test('Procfile explicitly launches the production gateway', () => {
  const procfile = fs.readFileSync(new URL('../Procfile', import.meta.url), 'utf8').trim()
  assert.equal(procfile, 'web: node production-server.js')
})
