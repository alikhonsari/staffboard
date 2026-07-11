import test from 'node:test'
import assert from 'node:assert/strict'
import { __test } from '../recovery-direct-save.js'

const emptyDay = () => ({ assignments: {}, opsMetrics: {}, rackLists: {}, snapshots: {}, shiftNotes: '', notes: '' })

test('template-style day replacement requests a pre-action backup', () => {
  const before = { weeklyData: { Monday: emptyDay() } }
  const after = structuredClone(before)
  after.weeklyData.Monday.assignments = { b1: { status: 'Present', area: 'Rack Prep' } }
  after.weeklyData.Monday.opsMetrics = { racksProcessed: '4' }
  after.weeklyData.Monday.rackLists = { processed: 'R1 decom' }
  assert.match(__test.replacementReason(before, after), /^DAY_REPLACEMENT:Monday:/)
})

test('single-field normal edit does not look like a full-day replacement', () => {
  const before = { weeklyData: { Monday: emptyDay() } }
  const after = structuredClone(before)
  after.weeklyData.Monday.opsMetrics = { racksProcessed: '1' }
  assert.equal(__test.replacementReason(before, after), '')
})
