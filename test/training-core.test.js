import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildBuilderProfile,
  buildTrainingMetrics,
  daysUntil,
  filterTrainingBuilders,
  isQualificationCurrent,
  qualificationKey,
  qualificationMap,
} from '../src/trainingCore.js'

const today = new Date('2026-07-23T12:00:00Z')
const snapshot = {
  builders: [
    { id: 'b1', name: 'Ali', currentShift: 'Day Shift', department: 'SPEED', archived: false },
    { id: 'b2', name: 'Sam', currentShift: 'Night Shift', department: 'FA', archived: false },
    { id: 'b3', name: 'Archived', currentShift: 'Day Shift', department: 'SPEED', archived: true },
  ],
  catalog: [
    { id: 'rack-prep', name: 'Rack Prep', category: 'Operations', active: true, minimumQualified: 2 },
    { id: 'shipping', name: 'Shipping', category: 'Operations', active: true, minimumQualified: 1 },
  ],
  qualifications: [
    { builderId: 'b1', trainingId: 'rack-prep', status: 'Trainer', completionDate: '2026-01-01', expirationDate: '2026-08-01', trainerName: 'Lead A' },
    { builderId: 'b1', trainingId: 'shipping', status: 'Qualified', completionDate: '2026-02-01', expirationDate: '' },
    { builderId: 'b2', trainingId: 'rack-prep', status: 'In Training', completionDate: '', expirationDate: '', trainerName: 'Ali' },
  ],
  history: [{ id: 'h1', builderId: 'b1', trainingName: 'Rack Prep', changedAt: '2026-07-01T00:00:00Z' }],
  notes: [{ id: 'n1', builderId: 'b1', note: 'Strong trainer', createdAt: '2026-07-01T00:00:00Z' }],
}

test('qualification map uses builder and training path identity', () => {
  const map = qualificationMap(snapshot.qualifications)
  assert.equal(map.get(qualificationKey('b1', 'rack-prep')).status, 'Trainer')
  assert.equal(map.size, 3)
})

test('current qualification respects status and expiration date', () => {
  assert.equal(isQualificationCurrent(snapshot.qualifications[0], today), true)
  assert.equal(isQualificationCurrent(snapshot.qualifications[2], today), false)
  assert.equal(isQualificationCurrent({ status: 'Qualified', expirationDate: '2026-07-01' }, today), false)
})

test('coverage metrics identify low coverage and suggestions', () => {
  const metrics = buildTrainingMetrics(snapshot, today)
  assert.equal(metrics.totalBuilders, 2)
  assert.equal(metrics.qualifiedBuilderCount, 1)
  assert.equal(metrics.qualifiedPct, 50)
  assert.equal(metrics.crossTrainedBuilderCount, 1)
  assert.equal(metrics.coverage.find((row) => row.trainingId === 'rack-prep').risk, 'Below Minimum')
  assert.equal(metrics.coverage.find((row) => row.trainingId === 'shipping').risk, 'No Backup')
  assert.equal(metrics.expiring.length, 1)
})

test('builder profile includes timeline, notes, and current qualifications', () => {
  const profile = buildBuilderProfile(snapshot.builders[0], snapshot, today)
  assert.equal(profile.currentQualifications.length, 2)
  assert.equal(profile.history.length, 1)
  assert.equal(profile.notes.length, 1)
})

test('search and filters include builder, shift, training, status, and trainer context', () => {
  assert.deepEqual(filterTrainingBuilders(snapshot.builders, snapshot.qualifications, snapshot.catalog, { search: 'lead a' }).map((builder) => builder.id), ['b1'])
  assert.deepEqual(filterTrainingBuilders(snapshot.builders, snapshot.qualifications, snapshot.catalog, { shift: 'Night Shift' }).map((builder) => builder.id), ['b2'])
  assert.deepEqual(filterTrainingBuilders(snapshot.builders, snapshot.qualifications, snapshot.catalog, { status: 'In Training' }).map((builder) => builder.id), ['b2'])
})

test('daysUntil returns whole-day renewal windows', () => {
  assert.equal(daysUntil('2026-08-01', today), 9)
  assert.equal(daysUntil('', today), null)
})
