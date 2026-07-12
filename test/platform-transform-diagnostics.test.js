import test from 'node:test'
import assert from 'node:assert/strict'
import { assertTransformMarkers, transformDiagnostic } from '../platform/transform-safety.js'
import { __test as pluginTest } from '../platform-hardening-plugin.js'
import { calculateStateMetrics, diagnosticWarnings } from '../platform/diagnostics.js'

test('transform safety fails missing required markers and duplicate unique markers', () => {
  assert.throws(() => assertTransformMarkers('data-staffboard-shell', {
    required: ['data-staffboard-shell', 'SITE CLOSED'],
    unique: ['data-staffboard-shell'],
  }), /missing markers/)

  assert.throws(() => assertTransformMarkers('x x', { required: ['x'], unique: ['x'] }), /duplicate markers/)
})

test('transform diagnostics report marker counts', () => {
  const diagnostic = transformDiagnostic('alpha beta alpha', { id: 'test', required: ['alpha'], unique: ['beta'] })
  assert.deepEqual(diagnostic.markers, [
    { marker: 'alpha', count: 2 },
    { marker: 'beta', count: 1 },
  ])
  assert.ok(pluginTest.APP_SPEC.required.includes('data-recovery-panel-route'))
})

test('state diagnostics count builders schedules and state revisions', () => {
  const state = {
    stateRevision: 8,
    builderPool: [{ id: '1' }, { id: '2' }],
    auditLog: [{ id: 'a' }],
    scheduledTransitions: [{ status: 'pending' }, { status: 'completed' }],
    recoveryRevision: 3,
  }
  const metrics = calculateStateMetrics(state)
  assert.equal(metrics.builderCount, 2)
  assert.equal(metrics.pendingScheduleCount, 1)
  assert.equal(metrics.stateRevision, 8)
  assert.deepEqual(diagnosticWarnings(state), [])
})
