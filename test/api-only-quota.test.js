import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { injectQuotaSafeStorage } from '../quota-safe-storage-plugin.js'

const serverSource = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8')
const storageSource = fs.readFileSync(new URL('../src/storageAdapter.js', import.meta.url), 'utf8')

function transformStorage() {
  return injectQuotaSafeStorage(storageSource)
}

test('production server only loads Vite outside production and API-only mode', () => {
  assert.doesNotMatch(serverSource, /^import .*from ['"]vite['"]/m)
  assert.match(serverSource, /process\.env\.NODE_ENV !== 'production'/)
  assert.match(serverSource, /process\.env\.STAFFBOARD_API_ONLY !== '1'/)
  assert.match(serverSource, /await import\('vite'\)/)
  assert.match(serverSource, /mode: process\.env\.NODE_ENV === 'production' \? 'api-only'/)
})

test('quota-safe transform replaces every full state cache write', () => {
  const output = transformStorage()
  assert.match(output, /function persistLocalStateSafely/)
  assert.match(output, /LOCAL_STATE_CACHE_MAX_BYTES = 1500000/)
  assert.match(output, /__staffboardCompactCache: true/)
  assert.match(output, /persistLocalStateSafely\(normalized, lastRemoteStateJson\)/)
  assert.match(output, /persistLocalStateSafely\(state\)/)
  assert.match(output, /persistLocalStateSafely\(savedState, lastRemoteStateJson\)/)
  assert.doesNotMatch(output, /localStorage\.setItem\(STORAGE_KEY, lastRemoteStateJson\)/)
  assert.doesNotMatch(output, /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(state\)\)/)
})

test('quota failure falls back to compact cache without throwing', () => {
  const output = transformStorage()
  assert.match(output, /catch \(error\)/)
  assert.match(output, /localStorage\.removeItem\(STORAGE_KEY\)/)
  assert.match(output, /localStorage\.setItem\(STORAGE_KEY, compactJson\)/)
  assert.match(output, /catch \(fallbackError\)/)
  assert.match(output, /return false/)
  assert.match(output, /localCacheError: lastLocalCacheError/)
})

test('quota-safe transform is idempotent', () => {
  const once = transformStorage()
  const twice = injectQuotaSafeStorage(once)
  assert.equal(twice, once)
})
