import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { injectBuilderSkillsView } from '../builder-skills-view-plugin.js'
import { injectTrainingSimplification } from '../training-simplification-plugin.js'

const trainingTabSource = fs.readFileSync(new URL('../src/TrainingTab.jsx', import.meta.url), 'utf8')
const component = fs.readFileSync(new URL('../src/SimplifiedTrainingWorkspace.jsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/training-simplified.css', import.meta.url), 'utf8')
const store = fs.readFileSync(new URL('../training-builder-store.js', import.meta.url), 'utf8')
const routes = fs.readFileSync(new URL('../training-routes.js', import.meta.url), 'utf8')
const client = fs.readFileSync(new URL('../src/trainingClient.js', import.meta.url), 'utf8')
const vite = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

function transformedTrainingTab() {
  return injectTrainingSimplification(injectBuilderSkillsView(trainingTabSource))
}

test('Training opens in the simplified workflow with only three primary tabs', () => {
  const output = transformedTrainingTab()
  const primaryTabs = component.match(/<div className="training-simple-primary-tabs">([\s\S]*?)<\/div>/)?.[1] || ''
  assert.match(output, /useState\('simple'\)/)
  assert.match(output, /SimplifiedTrainingWorkspace/)
  assert.match(primaryTabs, />Training Grid<\/button>/)
  assert.match(primaryTabs, />Builders<\/button>/)
  assert.match(primaryTabs, />Training Paths<\/button>/)
  assert.doesNotMatch(primaryTabs, /Builder Skills|Training Matrix|Area Coverage|Dashboard|History/)
})

test('StaffBoard builder profiles are normalized using Builder Management v3 fields', () => {
  const output = transformedTrainingTab()
  assert.match(output, /builder\.employeeId/)
  assert.match(output, /builder\.startDate/)
  assert.match(output, /builder\.defaultShift/)
  assert.match(output, /builder\.defaultBoardId/)
  assert.match(output, /!builder\.isArchived && !builder\.archived/)
  assert.match(component, /normalizedRoster/)
})

test('empty roster synchronization is non-destructive and never archives every Training builder', () => {
  assert.match(store, /if \(!normalized\.length\) return \{ synced: 0, created: 0, updated: 0, skipped: 0, emptyRoster: true \}/)
  assert.doesNotMatch(store, /UPDATE training_builders SET archived = TRUE WHERE NOT/)
  assert.match(component, /No builders have been added to Training yet\./)
  assert.match(component, /Sync Existing StaffBoard Builders/)
  assert.match(component, /Add Builder Manually/)
})

test('manual builder endpoints support create, edit, archive, restore, and duplicate prevention', () => {
  assert.match(routes, /app\.post\('\/api\/training\/builders'/)
  assert.match(routes, /app\.patch\('\/api\/training\/builders\/:id'/)
  assert.match(store, /A builder with this name or badge ID already exists/)
  assert.match(client, /createTrainingBuilder/)
  assert.match(client, /updateTrainingBuilder/)
  assert.match(component, /toggleBuilderArchive/)
  assert.match(component, />Restore<|\? 'Restore' : 'Archive'/)
})

test('grid renders builders as rows, paths as columns, and missing records as Not Trained', () => {
  assert.match(component, /training-simple-builder-column">Builder/)
  assert.match(component, /activeCatalog\.map\(\(path\)/)
  assert.match(component, /visibleSummaries\.map\(\(summary\)/)
  assert.match(component, /if \(!row \|\| row\.result === 'Inactive'\) return 'Not Trained'/)
  assert.match(component, /rowMaps\.get\(summary\.builder\.id\)\?\.get\(path\.id\)/)
})

test('cell popover maps simple results to detailed statuses and preserves audit history', () => {
  assert.match(component, /Trained: 'Qualified'/)
  assert.match(component, /'Not Trained': 'Not Started'/)
  assert.match(component, /'In Training': 'In Training'/)
  assert.match(component, /Trainer: 'Trainer'/)
  assert.match(component, /Expired: 'Expired'/)
  assert.match(component, /requiresUntrainConfirmation/)
  assert.match(component, /Existing qualification history will be preserved/)
  assert.match(component, /Training Grid quick update/)
  assert.match(routes, /upsertQualification/)
})

test('Training Paths support minimal creation, advanced options, archive, restore, and ordering', () => {
  assert.match(component, /Add Training Path/)
  assert.match(component, /More options/)
  assert.match(component, /minimumQualified/)
  assert.match(component, /expirationDays/)
  assert.match(component, /movePath/)
  assert.match(routes, /catalog\/reorder/)
  assert.match(store, /training_catalog_order/)
})

test('advanced features remain available under More rather than primary navigation', () => {
  assert.match(component, />More ▾<\/button>/)
  assert.match(component, /Dashboard/)
  assert.match(component, /Area Coverage/)
  assert.match(component, /Builder Profiles/)
  assert.match(component, /Reports & History/)
  assert.match(component, /Import CSV/)
  const output = transformedTrainingTab()
  assert.match(output, /training-advanced-bar/)
  assert.match(output, /Legacy Builder Skills/)
})

test('permissions, onboarding, sticky grid, dark mode, responsive layout, and print remain supported', () => {
  assert.match(component, /canManageBuilders/)
  assert.match(component, /canManageCatalog/)
  assert.match(component, /canEdit/)
  assert.match(component, /Set up Training in three steps/)
  assert.match(component, /View-only access/)
  assert.match(css, /training-simple-grid thead th\{position:sticky;top:0/)
  assert.match(css, /training-simple-grid \.training-simple-builder-column\{position:sticky;left:0/)
  assert.match(css, /body\[data-theme="dark"\]/)
  assert.match(css, /@media\(max-width:760px\)/)
  assert.match(css, /@media print/)
})

test('Vite registers simplification after Builder Skills and Simple Grid transforms', () => {
  assert.match(vite, /trainingSimplificationPlugin/)
  assert.match(vite, /builderSkillsViewPlugin\(\), simpleTrainingGridPlugin\(\), trainingSimplificationPlugin\(\)/)
})

test('Training simplification transform is idempotent', () => {
  const once = transformedTrainingTab()
  assert.equal(injectTrainingSimplification(once), once)
})
