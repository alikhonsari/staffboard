import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { injectBuilderSkillsView } from '../builder-skills-view-plugin.js'
import {
  injectSimplifiedWorkspacePolish,
  injectStandaloneTrainingTab,
  injectStandaloneTrainingWorkspace,
  injectTrainingSimplification,
} from '../training-simplification-plugin.js'

const trainingTabSource = fs.readFileSync(new URL('../src/TrainingTab.jsx', import.meta.url), 'utf8')
const component = fs.readFileSync(new URL('../src/SimplifiedTrainingWorkspace.jsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/training-simplified.css', import.meta.url), 'utf8')
const standaloneCss = fs.readFileSync(new URL('../src/training-standalone.css', import.meta.url), 'utf8')
const store = fs.readFileSync(new URL('../training-builder-store.js', import.meta.url), 'utf8')
const routes = fs.readFileSync(new URL('../training-routes.js', import.meta.url), 'utf8')
const client = fs.readFileSync(new URL('../src/trainingClient.js', import.meta.url), 'utf8')
const vite = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

function transformedTrainingTab() {
  return injectStandaloneTrainingTab(injectTrainingSimplification(injectBuilderSkillsView(trainingTabSource)))
}

function transformedWorkspace() {
  return injectStandaloneTrainingWorkspace(injectSimplifiedWorkspacePolish(component))
}

test('Training opens in the standalone simplified workflow with three primary tabs', () => {
  const output = transformedTrainingTab()
  const workspace = transformedWorkspace()
  const primaryTabs = workspace.match(/<div className="training-simple-primary-tabs"[\s\S]*?>([\s\S]*?)<\/div>/)?.[1] || ''
  assert.match(output, /useState\('simple'\)/)
  assert.match(output, /TRAINING_STANDALONE_MATRIX = true/)
  assert.match(workspace, /data-training-standalone="true"/)
  assert.match(primaryTabs, />Training Grid<\/button>/)
  assert.match(primaryTabs, />Builders<\/button>/)
  assert.match(primaryTabs, />Training Paths<\/button>/)
  assert.doesNotMatch(primaryTabs, /Builder Skills|Training Matrix|Area Coverage|Dashboard|History/)
})

test('Training does not automatically sync from the operational Builder Management board', () => {
  const output = transformedTrainingTab()
  const workspace = transformedWorkspace()
  assert.match(output, /useEffect\(\(\) => \{ refresh\(\) \}, \[\]\)/)
  assert.doesNotMatch(output, /useEffect\(\(\) => \{ refresh\(\{ syncRoster: true \}\)/)
  assert.match(workspace, /Changes here do not change staffing assignments, attendance, operational badges, shifts, or the Master Builder board/)
  assert.doesNotMatch(workspace, />Sync StaffBoard Builders<\/button>/)
})

test('wide matrix import is the primary admin import workflow', () => {
  const output = transformedTrainingTab()
  const workspace = transformedWorkspace()
  assert.match(output, /importTrainingMatrixCsv/)
  assert.match(output, /firstHeader\.includes\('builder'\)/)
  assert.match(output, /result\.qualificationsUpdated/)
  assert.match(workspace, /Import Matrix/)
  assert.match(workspace, /Import Matrix CSV/)
  assert.match(routes, /\/api\/training\/import-matrix/)
  assert.match(client, /importTrainingMatrixCsv/)
})

test('Training-only builders keep badge and trainer tags', () => {
  const workspace = transformedWorkspace()
  assert.match(store, /badge_tag TEXT NOT NULL DEFAULT ''/)
  assert.match(store, /is_trainer BOOLEAN NOT NULL DEFAULT FALSE/)
  assert.match(store, /upsertTrainingMatrixBuilder/)
  assert.match(workspace, /Blue Badge/)
  assert.match(workspace, /Green Badge/)
  assert.match(workspace, /Not Trainer/)
  assert.match(workspace, /builder\.isTrainer/)
  assert.match(standaloneCss, /training-builder-tag-blue/)
  assert.match(standaloneCss, /training-builder-tag-green/)
  assert.match(standaloneCss, /training-builder-tag-trainer/)
})

test('grid renders builders as rows, paths as columns, and missing records as Not Trained', () => {
  const workspace = transformedWorkspace()
  assert.match(workspace, /training-simple-builder-column">Builder/)
  assert.match(workspace, /activeCatalog\.map\(\(path\)/)
  assert.match(workspace, /visibleSummaries\.map\(\(summary, rowIndex\)/)
  assert.match(workspace, /normalizeGridResult/)
  assert.match(workspace, /rowMaps\.get\(builderId\)\?\.get\(path\.id\)/)
})

test('cell popover uses only Trained, In Training, and Not Trained with optimistic saves', () => {
  const workspace = transformedWorkspace()
  assert.match(workspace, /Trained: 'Qualified'/)
  assert.match(workspace, /'In Training': 'In Training'/)
  assert.match(workspace, /'Not Trained': 'Not Started'/)
  assert.doesNotMatch(workspace, /Trainer: 'Trainer'/)
  assert.doesNotMatch(workspace, /Expired: 'Expired'/)
  assert.doesNotMatch(workspace, /Suspended: 'Suspended'/)
  assert.match(workspace, /setOptimistic\(key, simpleResult\)/)
  assert.match(routes, /upsertQualification/)
})

test('manual builders, paths, archive, restore, and ordering remain available inside Training', () => {
  const workspace = transformedWorkspace()
  assert.match(routes, /app\.post\('\/api\/training\/builders'/)
  assert.match(routes, /app\.patch\('\/api\/training\/builders\/:id'/)
  assert.match(store, /A builder with this name or badge ID already exists/)
  assert.match(workspace, /Add Training Path/)
  assert.match(workspace, /More options/)
  assert.match(workspace, /Display order/)
  assert.match(workspace, /Move left/)
  assert.match(workspace, /Move right/)
  assert.match(routes, /catalog\/reorder/)
})

test('advanced reports remain under More without becoming primary navigation', () => {
  const workspace = transformedWorkspace()
  assert.match(workspace, />More ▾<\/button>/)
  assert.match(workspace, /Dashboard/)
  assert.match(workspace, /Coverage/)
  assert.match(workspace, /Builder Profiles/)
  assert.match(workspace, /History/)
  assert.match(workspace, /Advanced Matrix/)
  assert.match(workspace, /Catalog Management/)
})

test('permissions, sticky grid, dark mode, responsive layout, and print remain supported', () => {
  const workspace = transformedWorkspace()
  assert.match(workspace, /canManageBuilders/)
  assert.match(workspace, /canManageCatalog/)
  assert.match(workspace, /View-only access: you can review Training information but cannot make changes/)
  assert.match(css, /training-simple-grid thead th/)
  assert.match(css, /position: sticky/)
  assert.match(css, /body\[data-theme="dark"\]/)
  assert.match(standaloneCss, /body\[data-theme="dark"\]/)
  assert.match(css, /@media \(max-width: 760px\)/)
  assert.match(css, /@media print/)
})

test('Vite registers the Training simplification plugin', () => {
  assert.match(vite, /trainingSimplificationPlugin/)
  assert.match(vite, /builderSkillsViewPlugin\(\), simpleTrainingGridPlugin\(\), trainingSimplificationPlugin\(\)/)
})

test('Training standalone transforms are idempotent', () => {
  const trainingOnce = transformedTrainingTab()
  const workspaceOnce = transformedWorkspace()
  assert.equal(injectStandaloneTrainingTab(trainingOnce), trainingOnce)
  assert.equal(injectTrainingSimplification(trainingOnce), trainingOnce)
  assert.equal(injectStandaloneTrainingWorkspace(workspaceOnce), workspaceOnce)
})
