import test from 'node:test'
import assert from 'node:assert/strict'
import { scheduledStatusPlugin } from '../scheduled-status-plugin.js'

const fixture = `
import { useState, useEffect, useRef } from 'react'
function App() {
  const [syncStatus, setSyncStatus] = useState('Loading...')
  const [tick, setTick] = useState(Date.now())
  const selectedAssignment = { status: 'Present', area: 'Rack Prep' }
  const selectedBuilderId = 'b-1'
  const state = { currentBoardId: 'speed_day', weekStartDate: '2026-07-13', selectedDay: 'Monday' }
  const defaultState = {}
  const updateBuilderAssignment = () => {}
  const loadRemoteState = async () => ({})
  const normalizeState = (value) => value
  const setState = () => {}
  const staffedStatuses = () => ['Present']
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])
  return <>
    <div><label>Status</label><select value={selectedAssignment.status || 'Present'} onChange={(e) => updateBuilderAssignment(selectedBuilderId, { status: e.target.value })}></select></div>
    <div><label>Area</label><select value={selectedAssignment.area || ''} onChange={(e) => updateBuilderAssignment(selectedBuilderId, { area: e.target.value })}></select></div>
              <div className="row two">
                <div><label>Clock In</label><input type="time" value={selectedAssignment.clockInTime || ''} onChange={(e) => updateBuilderAssignment(selectedBuilderId, { clockInTime: e.target.value })} /></div>
                <div><label>Clock Out</label><input type="time" value={selectedAssignment.leaveTime || ''} onChange={(e) => updateBuilderAssignment(selectedBuilderId, { leaveTime: e.target.value })} /></div>
              </div>
  </>
}
`

test('builder status and area controls stay on the optimized state-save path', () => {
  const plugin = scheduledStatusPlugin()
  const result = plugin.transform(fixture, '/repo/src/App.jsx')
  assert.ok(result?.code)
  assert.match(result.code, /updateBuilderAssignment\(selectedBuilderId, \{ status: e\.target\.value \}\)/)
  assert.match(result.code, /updateBuilderAssignment\(selectedBuilderId, \{ area: e\.target\.value \}\)/)
  assert.doesNotMatch(result.code, /overrideBuilderStatusOrArea/)
  assert.doesNotMatch(result.code, /runScheduledAction\('override'/)
})

test('scheduled clock controls still use the scheduled-transition endpoint', () => {
  const plugin = scheduledStatusPlugin()
  const result = plugin.transform(fixture, '/repo/src/App.jsx')
  assert.match(result.code, /requestScheduledTransition/)
  assert.match(result.code, /scheduleBuilderTime/)
  assert.match(result.code, /clockBuilderNow/)
  assert.match(result.code, /Scheduled Clock In/)
  assert.match(result.code, /Scheduled Clock Out/)
})

test('transform remains idempotent and does not rewire status controls later', () => {
  const plugin = scheduledStatusPlugin()
  const first = plugin.transform(fixture, '/repo/src/App.jsx')
  const second = plugin.transform(first.code, '/repo/src/App.jsx')
  const code = second?.code || first.code
  assert.equal((code.match(/const runScheduledAction = async/g) || []).length, 1)
  assert.doesNotMatch(code, /overrideBuilderStatusOrArea/)
  assert.match(code, /updateBuilderAssignment\(selectedBuilderId, \{ status: e\.target\.value \}\)/)
})
