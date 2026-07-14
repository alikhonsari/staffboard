import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { __test } from '../authenticated-polling-plugin.js'

const source = `
function StaffBoardApp({ user, onLogout }) {
  useEffect(() => {
    let stopped = false
    let polling = false
    const pollScheduledStatus = async () => {
      if (stopped || polling) return
      const status = await loadScheduledTransitionStatus()
      return status
    }
    const pollClosures = async () => {
      if (stopped || polling) return
      const status = await loadDayClosureStatus()
      return status
    }
  }, [])
}
`

test('both protected status pollers require a stored StaffBoard token', () => {
  const output = __test.injectAuthenticatedPolling(source)
  assert.match(output, /localStorage\.getItem\('staffboard2_token'\)/)
  assert.match(output, /localStorage\.getItem\('staffboard_shared_auth_token'\)/)
  assert.equal((output.match(/if \(!hasStaffBoardAuthToken\(\)\) return/g) || []).length, 2)
  assert.match(output, /pollScheduledStatus[\s\S]*if \(!hasStaffBoardAuthToken\(\)\) return/)
  assert.match(output, /pollClosures[\s\S]*if \(!hasStaffBoardAuthToken\(\)\) return/)
})

test('authenticated polling transform is idempotent', () => {
  const once = __test.injectAuthenticatedPolling(source)
  const twice = __test.injectAuthenticatedPolling(once)
  assert.equal(twice, once)
})

test('deployment metadata targets Node 22', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.engines.node, '22.x')
  assert.equal(fs.readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim(), '22')
})
