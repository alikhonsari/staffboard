import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  matrixStatusToDetailed,
  normalizeBadgeTag,
  normalizeMatrixStatus,
  normalizeTrainerTag,
  parseTrainingMatrixCsv,
  trainingSnapshotToMatrixCsv,
} from '../training-matrix-import.js'

const routes = fs.readFileSync(new URL('../training-routes.js', import.meta.url), 'utf8')
const builders = fs.readFileSync(new URL('../training-builder-store.js', import.meta.url), 'utf8')
const client = fs.readFileSync(new URL('../src/trainingClient.js', import.meta.url), 'utf8')

const sample = `Builder,Badge Tag,Trainer Tag,OB1,Media Destruction,Metal Removal,Outbound
John Smith,Blue Badge,Not Trainer,Trained,Not Trained,Trained,In Training
Jane Doe,Green Badge,Trainer,Trained,Trained,Not Trained,Trained`

test('parses the exact wide Training matrix format', () => {
  const matrix = parseTrainingMatrixCsv(sample)
  assert.deepEqual(matrix.paths, ['OB1', 'Media Destruction', 'Metal Removal', 'Outbound'])
  assert.equal(matrix.builders.length, 2)
  assert.deepEqual(matrix.builders[0], {
    name: 'John Smith',
    badgeTag: 'Blue Badge',
    isTrainer: false,
    cells: [
      { pathName: 'OB1', status: 'Trained' },
      { pathName: 'Media Destruction', status: 'Not Trained' },
      { pathName: 'Metal Removal', status: 'Trained' },
      { pathName: 'Outbound', status: 'In Training' },
    ],
  })
  assert.equal(matrix.builders[1].badgeTag, 'Green Badge')
  assert.equal(matrix.builders[1].isTrainer, true)
})

test('accepts only the three simple matrix statuses', () => {
  assert.equal(normalizeMatrixStatus('Trained'), 'Trained')
  assert.equal(normalizeMatrixStatus('In Training'), 'In Training')
  assert.equal(normalizeMatrixStatus('Not Trained'), 'Not Trained')
  assert.equal(matrixStatusToDetailed('Trained'), 'Qualified')
  assert.equal(matrixStatusToDetailed('In Training'), 'In Training')
  assert.equal(matrixStatusToDetailed('Not Trained'), 'Not Started')
  assert.throws(() => normalizeMatrixStatus('Expired'), /Unsupported Training matrix status/)
})

test('normalizes badge and trainer tags', () => {
  assert.equal(normalizeBadgeTag('Blue Badge'), 'Blue Badge')
  assert.equal(normalizeBadgeTag('Day'), 'Blue Badge')
  assert.equal(normalizeBadgeTag('Green'), 'Green Badge')
  assert.equal(normalizeTrainerTag('Trainer'), true)
  assert.equal(normalizeTrainerTag('Not Trainer'), false)
})

test('exports a wide Training matrix with implicit Not Trained cells', () => {
  const csv = trainingSnapshotToMatrixCsv({
    builders: [
      { id: 'john', name: 'John Smith', badgeTag: 'Blue Badge', isTrainer: false, archived: false },
      { id: 'jane', name: 'Jane Doe', badgeTag: 'Green Badge', isTrainer: true, archived: false },
    ],
    catalog: [
      { id: 'ob1', name: 'OB1', active: true },
      { id: 'outbound', name: 'Outbound', active: true },
    ],
    qualifications: [
      { builderId: 'john', trainingId: 'ob1', status: 'Qualified' },
      { builderId: 'john', trainingId: 'outbound', status: 'In Training' },
      { builderId: 'jane', trainingId: 'ob1', status: 'Trainer' },
    ],
  })
  assert.equal(csv, [
    'Builder,Badge Tag,Trainer Tag,OB1,Outbound',
    'John Smith,Blue Badge,Not Trainer,Trained,In Training',
    'Jane Doe,Green Badge,Trainer,Trained,Not Trained',
  ].join('\n'))
})

test('matrix import is admin-only and creates Training-only records', () => {
  assert.match(routes, /app\.post\('\/api\/training\/import-matrix', requireTrainingAuth, requireAdmin/)
  assert.match(client, /\/api\/training\/import-matrix/)
  assert.match(builders, /upsertTrainingMatrixBuilder/)
  assert.match(builders, /matrix-\$\{crypto\.createHash/)
  assert.match(builders, /ALTER TABLE training_builders ADD COLUMN IF NOT EXISTS badge_tag/)
  assert.match(builders, /ALTER TABLE training_builders ADD COLUMN IF NOT EXISTS is_trainer/)
})

test('matrix import does not mutate operational staffing tables', () => {
  const importStore = fs.readFileSync(new URL('../training-matrix-import.js', import.meta.url), 'utf8')
  for (const forbidden of ['builderPool', 'weekly', 'assignments', 'clock', 'attendance', 'day_boards']) {
    assert.doesNotMatch(importStore, new RegExp(forbidden, 'i'))
  }
  assert.match(importStore, /Standalone Training matrix CSV import/)
})
