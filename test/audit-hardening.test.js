import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { injectAuthenticatedPolling, __test as pollingTest } from '../authenticated-polling-plugin.js'
import { injectAreaSessionIntegrity } from '../area-session-integrity-plugin.js'

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

test('protected status middleware is installed before fast and guarded status routes', () => {
  const bootstrap = read('../server-guarded-closures.js')
  const gate = read('../protected-status-gate.js')
  const gateIndex = bootstrap.indexOf('installProtectedStatusGate(this)')
  const hotfixIndex = bootstrap.indexOf('installStatusSaveHotfix(this)')
  const guardedIndex = bootstrap.indexOf('installGuardedRoutes(this)')
  assert.ok(gateIndex > 0)
  assert.ok(hotfixIndex > gateIndex)
  assert.ok(guardedIndex > hotfixIndex)
  assert.match(gate, /app\.use\('\/api\/scheduled-transitions\/status', requireAdminAuth\)/)
  assert.match(gate, /app\.use\('\/api\/day-closures\/status', requireAdminAuth\)/)
})

test('CI validates the declared Node 22 production runtime', () => {
  const workflow = read('../.github/workflows/build.yml')
  const pkg = JSON.parse(read('../package.json'))
  assert.equal(pkg.engines.node, '22.x')
  assert.match(workflow, /node-version:\s*22/)
  assert.doesNotMatch(workflow, /node-version:\s*20/)
})

test('authenticated polling is guarded and reduced to ten seconds', () => {
  const fixture = `
function StaffBoardApp({ user, onLogout }) {
  useEffect(() => {
    const pollScheduledStatus = async () => {
      const status = await loadScheduledTransitionStatus()
    }
    const scheduledTimer = setInterval(pollScheduledStatus, 2000)
    return () => clearInterval(scheduledTimer)
  }, [])
  useEffect(() => {
    const pollClosures = async () => {
      const status = await loadDayClosureStatus()
    }
    const closureTimer = setInterval(pollClosures, 2000)
    return () => clearInterval(closureTimer)
  }, [])
}
`
  const output = injectAuthenticatedPolling(fixture)
  assert.equal(pollingTest.POLL_INTERVAL_MS, 10000)
  assert.match(output, /const pollScheduledStatus = async \(\) => \{\n\s+if \(!hasStaffBoardAuthToken\(\)\) return/)
  assert.match(output, /const pollClosures = async \(\) => \{\n\s+if \(!hasStaffBoardAuthToken\(\)\) return/)
  assert.match(output, /setInterval\(pollScheduledStatus, 10000\)/)
  assert.match(output, /setInterval\(pollClosures, 10000\)/)
  assert.doesNotMatch(output, /setInterval\([^,]+, 2000\)/)
})

test('status and area edits create exact area sessions instead of movement-shaped history', () => {
  const fixture = `
function nowString() { return '' }
function nowIso() { return '' }
function syncAreaSession(before, after, at) { return [] }
function App() {
    const updateBuilderAssignment = (builderId, patch) => {
    if (!builderId) return
    updateDay((prev) => {
      const currentAssignment = prev.assignments?.[builderId] || blankAssignment()
      const builder = state.builderPool.find((b) => b.id === builderId) || activeBuilders.find((b) => b.id === builderId) || { name: builderId }
      const timestamp = nowString()
      const currentStatus = currentAssignment.status || 'Present'
      const currentArea = currentAssignment.area || 'Unassigned'
      const nextAssignment = {
        ...currentAssignment,
        ...patch,
        updatedAt: timestamp,
      }
      const nextStatus = nextAssignment.status || 'Present'
      const nextArea = nextAssignment.area || 'Unassigned'

      let movementLog = Array.isArray(prev.movementLog) ? [...prev.movementLog] : []

      if (patch.area !== undefined && nextArea !== currentArea) {
        const history = Array.isArray(currentAssignment.areaHistory) ? currentAssignment.areaHistory : []
        nextAssignment.areaHistory = [
          ...history,
          { from: currentArea, to: nextArea, at: timestamp },
        ]
        movementLog.unshift({
          timestamp,
          builder: builder.name,
          from: \`${'${currentArea} / ${currentStatus}'}\`,
          to: \`${'${nextArea} / ${nextStatus}'}\`,
          note: \`Area changed from ${'${currentArea}'} to ${'${nextArea}'}\`,
        })
      } else {
        nextAssignment.areaHistory = Array.isArray(currentAssignment.areaHistory) ? currentAssignment.areaHistory : []
      }

      if (patch.status !== undefined && nextStatus !== currentStatus) {
        movementLog.unshift({ timestamp })
      }
      return prev
    })
  }


  const saveCurrentWeekSnapshot = () => {}
}
`
  const output = injectAreaSessionIntegrity(fixture)
  assert.match(output, /const timestampIso = nowIso\(\)/)
  assert.match(output, /syncAreaSession\(currentAssignment, nextAssignment, timestampIso\)/)
  assert.match(output, /patch\.status !== undefined && nextStatus !== currentStatus/)
  assert.doesNotMatch(output, /\{ from: currentArea, to: nextArea, at: timestamp \}/)
  assert.equal(injectAreaSessionIntegrity(output), output)
})
