import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { injectClosedDayNavigationGuard } from '../closed-day-navigation-guard-plugin.js'
import { injectLocalNavigationSaveState } from '../local-navigation-save-state-plugin.js'

const source = fs.readFileSync(new URL('../src/storageAdapter.js', import.meta.url), 'utf8')
const transformed = injectLocalNavigationSaveState(injectClosedDayNavigationGuard(source))

test('selected day is session-local and omitted from remote state writes', () => {
  assert.match(transformed, /LOCAL_SELECTED_DAY_KEY/)
  assert.match(transformed, /sessionStorage\.setItem\(LOCAL_SELECTED_DAY_KEY/)
  assert.match(transformed, /sessionStorage\.getItem\(LOCAL_SELECTED_DAY_KEY/)
  assert.match(transformed, /delete remoteState\.selectedDay/)
  assert.match(transformed, /state: remoteState/)
})

test('save pending diagnostics use an in-flight counter rather than Promise truthiness', () => {
  assert.match(transformed, /let pendingSaveCount = 0/)
  assert.match(transformed, /pendingSaveCount \+= 1/)
  assert.match(transformed, /pendingSaveCount = Math\.max\(0, pendingSaveCount - 1\)/)
  assert.match(transformed, /saveQueued: pendingSaveCount > 0/)
  assert.doesNotMatch(transformed, /saveQueued: Boolean\(saveQueue\)/)
})

test('the combined storage transforms are idempotent', () => {
  assert.equal(injectLocalNavigationSaveState(transformed), transformed)
})
