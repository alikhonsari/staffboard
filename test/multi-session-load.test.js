import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const statusSource = fs.readFileSync(new URL('../status-save-hotfix.js', import.meta.url), 'utf8')
const pollingSource = fs.readFileSync(new URL('../authenticated-polling-plugin.js', import.meta.url), 'utf8')

 test('state and status reads are coalesced behind one in-flight request', () => {
  assert.match(statusSource, /let sharedReadPromise = null/)
  assert.match(statusSource, /if \(sharedReadPromise\) return sharedReadPromise/)
  assert.match(statusSource, /reconcilePersistedState\(source\)/)
  assert.match(statusSource, /sharedReadPromise = null/)
})

test('status reads use a bounded cache and saves refresh it authoritatively', () => {
  assert.match(statusSource, /STATUS_CACHE_MS = Number\(process\.env\.STAFFBOARD_STATUS_CACHE_MS \|\| 5000\)/)
  assert.match(statusSource, /coalescedStateRead\(STATUS_CACHE_MS, 'status-read-coalesced'\)/)
  assert.match(statusSource, /rememberSharedPayload\(payload\)/)
  assert.match(statusSource, /invalidateSharedRead\(\)/)
})

test('full state GET requests share a short cache instead of serializing every browser read', () => {
  assert.match(statusSource, /STATE_GET_CACHE_MS = Number\(process\.env\.STAFFBOARD_STATE_GET_CACHE_MS \|\| 1500\)/)
  assert.match(statusSource, /coalescedStateRead\(STATE_GET_CACHE_MS, 'state-get-coalesced'\)/)
})

test('only one tab per device owns each background polling lease', () => {
  assert.match(pollingSource, /staffboard_polling_tab_id/)
  assert.match(pollingSource, /claimStaffBoardPollingLease/)
  assert.match(pollingSource, /staffboard_polling_lease_/)
  assert.match(pollingSource, /scheduled-status/)
  assert.match(pollingSource, /closure-status/)
  assert.match(pollingSource, /expiresAt: now \+ ttlMs/)
})

test('polling stays authenticated and at ten-second cadence', () => {
  assert.match(pollingSource, /if \(!hasStaffBoardAuthToken\(\)\) return/)
  assert.match(pollingSource, /const POLL_INTERVAL_MS = 10000/)
  assert.doesNotMatch(pollingSource, /setInterval\(pollScheduledStatus, 2000\)/)
  assert.doesNotMatch(pollingSource, /setInterval\(pollClosures, 2000\)/)
})
