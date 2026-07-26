import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  GRID_RESULTS,
  gridCellKey,
  parseGridCellKey,
  shouldConfirmGridTransition,
} from '../src/trainingGridCore.js'

const component = fs.readFileSync(new URL('../src/SimplifiedTrainingWorkspace.jsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/training-simplified.css', import.meta.url), 'utf8')
const plugin = fs.readFileSync(new URL('../training-simplification-plugin.js', import.meta.url), 'utf8')

const quickUpdateSection = component.match(/async function quickUpdate[\s\S]*?\n  function openDetails/)?.[0] || ''

test('grid exposes every simple result including Suspended', () => {
  assert.deepEqual(GRID_RESULTS, ['Trained', 'Not Trained', 'In Training', 'Trainer', 'Expired', 'Suspended'])
  assert.match(component, /GRID_RESULTS\.map/)
})

test('trained and trainer demotions require confirmation', () => {
  for (const previous of ['Trained', 'Trainer']) {
    for (const next of ['Not Trained', 'Expired', 'Suspended']) {
      assert.equal(shouldConfirmGridTransition(previous, next), true)
    }
  }
  assert.equal(shouldConfirmGridTransition('In Training', 'Not Trained'), false)
  assert.equal(shouldConfirmGridTransition('Trained', 'In Training'), false)
})

test('cell keys round-trip builder and training IDs', () => {
  const key = gridCellKey('builder-12', 'path-4')
  assert.equal(key, 'builder-12::path-4')
  assert.deepEqual(parseGridCellKey(key), { builderId: 'builder-12', trainingId: 'path-4' })
})

test('quick updates are optimistic and do not reload the full snapshot', () => {
  assert.match(quickUpdateSection, /setOptimistic\(key, simpleResult\)/)
  assert.match(quickUpdateSection, /hadOverride \? previousOverride : null/)
  assert.doesNotMatch(quickUpdateSection, /onRefresh/)
  assert.match(component, /was not changed/)
  assert.match(component, /Saving…/)
})

test('simple filters, quick filters, counts, and archived toggle are present', () => {
  assert.match(component, /Filter by training status/)
  assert.match(component, /Missing Training/)
  assert.match(component, /Show archived|Archived<\/label>/)
  assert.match(component, /Not Trained<\/button>/)
  assert.match(component, /pathCounts/)
  assert.match(component, /builderCounts/)
})

test('builders and paths tables include summaries and direct grid navigation', () => {
  assert.match(component, /Training summary/)
  assert.match(component, /summaryText/)
  assert.match(component, /View Training/)
  assert.match(component, /View in Grid/)
  assert.match(component, /Move left/)
  assert.match(component, /Move right/)
})

test('bulk mode reviews and saves through the audited bulk endpoint', () => {
  assert.match(component, /Bulk Update/)
  assert.match(component, /Review Bulk Training Update/)
  assert.match(component, /saveQualificationsBulk/)
  assert.match(component, /Training Grid bulk update/)
  assert.match(component, /Confirm Update/)
})

test('permissions hide management controls and show a clear view-only banner', () => {
  assert.match(component, /canManageBuilders \? <button/)
  assert.match(component, /canManageCatalog \? <button/)
  assert.match(component, /View-only access: you can review Training information but cannot make changes\./)
  assert.doesNotMatch(component, /disabled=\{!canManageBuilders\}/)
  assert.doesNotMatch(component, /disabled=\{!canManageCatalog\}/)
})

test('empty states explain sync, manual builders, and first path setup', () => {
  assert.match(component, /No builders have been added to Training yet\./)
  assert.match(component, /Sync imports builders already managed in StaffBoard\. Add Builder creates a Training-only builder\./)
  assert.match(component, /Add your first training path to begin tracking qualifications\./)
})

test('keyboard, screen reader, responsive, and dark mode support remain explicit', () => {
  assert.match(component, /ArrowRight/)
  assert.match(component, /aria-label=\{`\$\{summary\.builder\.name\}, \$\{path\.name\}, \$\{result\}/)
  assert.match(component, /aria-pressed=\{selected\}/)
  assert.match(css, /:focus-visible/)
  assert.match(css, /body\[data-theme="dark"\]/)
  assert.match(css, /@media \(max-width: 760px\)/)
})

test('the simplification transform recognizes the source workspace implementation', () => {
  assert.match(component, /data-training-workspace-version="2"/)
  assert.match(plugin, /data-training-workspace-version="2"/)
})
