import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  GRID_RESULTS,
  gridCellKey,
  normalizeGridResult,
  parseGridCellKey,
  shouldConfirmGridTransition,
} from '../src/trainingGridCore.js'
import {
  injectSimplifiedWorkspacePolish,
  injectStandaloneTrainingWorkspace,
} from '../training-simplification-plugin.js'

const componentSource = fs.readFileSync(new URL('../src/SimplifiedTrainingWorkspace.jsx', import.meta.url), 'utf8')
const component = injectStandaloneTrainingWorkspace(injectSimplifiedWorkspacePolish(componentSource))
const css = fs.readFileSync(new URL('../src/training-simplified.css', import.meta.url), 'utf8')
const standaloneCss = fs.readFileSync(new URL('../src/training-standalone.css', import.meta.url), 'utf8')
const plugin = fs.readFileSync(new URL('../training-simplification-plugin.js', import.meta.url), 'utf8')

const quickUpdateSection = component.match(/async function quickUpdate[\s\S]*?\n  function openDetails/)?.[0] || ''

test('grid exposes only the three standalone Training results', () => {
  assert.deepEqual(GRID_RESULTS, ['Trained', 'In Training', 'Not Trained'])
  assert.equal(normalizeGridResult('Trainer'), 'Trained')
  assert.equal(normalizeGridResult('Expired'), 'Not Trained')
  assert.match(component, /GRID_RESULTS\.map/)
})

test('changing Trained to Not Trained requires confirmation', () => {
  assert.equal(shouldConfirmGridTransition('Trained', 'Not Trained'), true)
  assert.equal(shouldConfirmGridTransition('Trainer', 'Not Trained'), true)
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

test('simple filters, counts, archived toggle, and three quick filters are present', () => {
  assert.match(component, /Filter by training status/)
  assert.match(component, /Not Trained/)
  assert.match(component, /In Training/)
  assert.match(component, /Trained/)
  assert.match(component, /Archived<\/label>/)
  assert.match(component, /pathCounts/)
  assert.match(component, /builderCounts/)
})

test('builders show standalone badge and trainer tags', () => {
  assert.match(component, /Badge Tag/)
  assert.match(component, /Trainer Tag/)
  assert.match(component, /Blue Badge/)
  assert.match(component, /Green Badge/)
  assert.match(component, /Not Trainer/)
  assert.match(standaloneCss, /training-builder-tag/)
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
  assert.match(component, /canManageBuilders/)
  assert.match(component, /canManageCatalog/)
  assert.match(component, /View-only access: you can review Training information but cannot make changes\./)
  assert.doesNotMatch(component, /disabled=\{!canManageBuilders\}/)
  assert.doesNotMatch(component, /disabled=\{!canManageCatalog\}/)
})

test('empty state explains matrix import and Training-only builders', () => {
  assert.match(component, /No builders have been added to Training yet\./)
  assert.match(component, /Import Matrix creates Training-only builders and paths/)
  assert.match(component, /Add your first training path to begin tracking qualifications\./)
  assert.doesNotMatch(component, /Sync StaffBoard Builders/)
})

test('keyboard, screen reader, responsive, and dark mode support remain explicit', () => {
  assert.match(component, /ArrowRight/)
  assert.match(component, /aria-label=\{`\$\{summary\.builder\.name\}, \$\{path\.name\}, \$\{result\}/)
  assert.match(component, /aria-pressed=\{selected\}/)
  assert.match(css, /:focus-visible/)
  assert.match(css, /body\[data-theme="dark"\]/)
  assert.match(standaloneCss, /body\[data-theme="dark"\]/)
  assert.match(css, /@media \(max-width: 760px\)/)
})

test('the simplification transform upgrades the source workspace to standalone version 3', () => {
  assert.match(component, /data-training-workspace-version="3"/)
  assert.match(component, /data-training-standalone="true"/)
  assert.match(plugin, /injectStandaloneTrainingWorkspace/)
})
