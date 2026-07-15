import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { injectAuthenticatedPolling } from '../authenticated-polling-plugin.js'

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

test('polling stays authenticated and at ten-second cadence after transformation', () => {
  const input = `function StaffBoardApp({ user, onLogout }) {
  useEffect(() => {
    const pollScheduledStatus = async () => {
      await loadScheduledTransitionStatus()
    }
    const timer = setInterval(pollScheduledStatus, 2000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const pollClosures = async () => {
      await loadDayClosureStatus()
    }
    const timer = setInterval(pollClosures, 2000)
    return () => clearInterval(timer)
  }, [])
}`
  const output = injectAuthenticatedPolling(input)
  assert.match(output, /if \(!hasStaffBoardAuthToken\(\)\) return/)
  assert.match(output, /claimStaffBoardPollingLease\('scheduled-status'\)/)
  assert.match(output, /claimStaffBoardPollingLease\('closure-status'\)/)
  assert.match(output, /setInterval\(pollScheduledStatus, 10000\)/)
  assert.match(output, /setInterval\(pollClosures, 10000\)/)
  assert.doesNotMatch(output, /setInterval\(pollScheduledStatus, 2000\)/)
  assert.doesNotMatch(output, /setInterval\(pollClosures, 2000\)/)
})
