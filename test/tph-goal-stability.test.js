import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const clockSidecar = fs.readFileSync(new URL('../public/shift-clock-correct.js', import.meta.url), 'utf8')
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')

test('the legacy TPH DOM sidecar is no longer loaded', () => {
  assert.doesNotMatch(index, /shift-tph-correct\.js/)
  assert.match(index, /shift-clock-correct\.js\?v=2/)
})

test('the shift clock sidecar only owns clock and shift-end display', () => {
  assert.doesNotThrow(() => new Function(clockSidecar))
  assert.match(clockSidecar, /Hours Worked \/ Remaining/)
  assert.match(clockSidecar, /Shift ends/)
  assert.doesNotMatch(clockSidecar, /Shift TPH Status/)
  assert.doesNotMatch(clockSidecar, /requiredTPH|weightedGoal|weightedDone|Production HC/)
})

test('React remains the only owner of goal and TPH calculations', () => {
  assert.match(app, /const weightedTarget = \(\(recoveryGoal \+ rackPrepGoal\) \* RACK_WEIGHT\) \+ mediaGoal/)
  assert.match(app, /const targetTPH = totalHeadCount > 0 \? weightedTarget \/ \(totalHeadCount \* SHIFT_HOURS\) : 0/)
  assert.match(app, /const requiredTPH = \(totalHeadCount > 0 && shift\.remainingHours > 0\)/)
  assert.match(app, /Shift TPH Status/)
  assert.match(app, /Required \{metrics\.requiredTPH\.toFixed\(1\)\}/)
})
