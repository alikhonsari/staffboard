import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { injectMutationAwareTimeouts } from '../request-timeout-plugin.js'

const fixture = `const REQUEST_TIMEOUT_MS = 12000

async function requestWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}`

const gateway = fs.readFileSync(new URL('../production-server.js', import.meta.url), 'utf8')

 test('frontend keeps reads bounded while allowing mutations up to sixty seconds', () => {
  const transformed = injectMutationAwareTimeouts(fixture)
  assert.match(transformed, /READ_REQUEST_TIMEOUT_MS = 12000/)
  assert.match(transformed, /MUTATION_REQUEST_TIMEOUT_MS = 60000/)
  assert.match(transformed, /\['POST', 'PUT', 'PATCH', 'DELETE'\]\.includes\(method\)/)
  assert.match(transformed, /StaffBoard is still saving this change/)
  assert.doesNotMatch(transformed, /setTimeout\(\(\) => controller\.abort\(\), REQUEST_TIMEOUT_MS\)/)
})

test('timeout transform is idempotent', () => {
  const once = injectMutationAwareTimeouts(fixture)
  assert.equal(injectMutationAwareTimeouts(once), once)
})

test('production gateway gives mutations more time than reads', () => {
  assert.match(gateway, /readProxyTimeoutMs[\s\S]*25000/)
  assert.match(gateway, /mutationProxyTimeoutMs[\s\S]*65000/)
  assert.match(gateway, /\['POST', 'PUT', 'PATCH', 'DELETE'\]\.includes\(method\)/)
  assert.match(gateway, /proxy\.setTimeout\(timeoutMs/)
  assert.match(gateway, /publicServer\.requestTimeout = 70_000/)
  assert.match(gateway, /publicServer\.headersTimeout = 75_000/)
})
