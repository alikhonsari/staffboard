import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { injectClosedDayNavigationGuard } from '../closed-day-navigation-guard-plugin.js'

const storageSource = fs.readFileSync(new URL('../src/storageAdapter.js', import.meta.url), 'utf8')
const viteConfig = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

function transformed() {
  return injectClosedDayNavigationGuard(storageSource)
}

test('closed operational-day 409 does not fetch remote state or reload the page', () => {
  const output = transformed()
  assert.match(output, /closedDayRejection/)
  assert.match(output, /CLOSED_OPERATIONAL_DAY/)
  assert.match(output, /staffboard:save-rejected/)

  const closedBranch = output.slice(output.indexOf('if (closedDayRejection)'), output.indexOf('const latest = await fetchLatestRemote(state)'))
  assert.doesNotMatch(closedBranch, /fetchLatestRemote/)
  assert.doesNotMatch(closedBranch, /reloadOnConflict/)
  assert.doesNotMatch(closedBranch, /location\.reload/)
})

test('true revision conflicts retain authoritative refresh behavior', () => {
  const output = transformed()
  assert.match(output, /const latest = await fetchLatestRemote\(state\)/)
  assert.match(output, /reloadOnConflict\(/)
})

test('guard transform is idempotent and wired into Vite', () => {
  const once = transformed()
  assert.equal(injectClosedDayNavigationGuard(once), once)
  assert.match(viteConfig, /closedDayNavigationGuardPlugin/)
  assert.match(viteConfig, /closedDayNavigationGuardPlugin\(\)/)
})
