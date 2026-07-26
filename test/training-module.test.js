import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { injectTrainingTab } from '../training-tab-plugin.js'

const storeSource = fs.readFileSync(new URL('../training-store.js', import.meta.url), 'utf8')
const routesSource = fs.readFileSync(new URL('../training-routes.js', import.meta.url), 'utf8')
const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const componentSource = fs.readFileSync(new URL('../src/TrainingTab.jsx', import.meta.url), 'utf8')
const clientSource = fs.readFileSync(new URL('../src/trainingClient.js', import.meta.url), 'utf8')
const cssSource = fs.readFileSync(new URL('../src/training.css', import.meta.url), 'utf8')
const viteSource = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')
const guardedServerSource = fs.readFileSync(new URL('../server-guarded-closures.js', import.meta.url), 'utf8')

test('Training schema is normalized and separate from the board JSON document', () => {
  for (const table of ['training_catalog', 'training_builders', 'builder_training', 'training_history', 'training_notes']) {
    assert.match(storeSource, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`))
  }
  assert.match(storeSource, /PRIMARY KEY \(builder_id, training_id\)/)
  assert.match(storeSource, /REFERENCES training_builders/)
  assert.match(storeSource, /REFERENCES training_catalog/)
  assert.match(storeSource, /BEGIN/)
  assert.match(storeSource, /COMMIT/)
  assert.match(storeSource, /ROLLBACK/)
  assert.doesNotMatch(storeSource, /staffboard_documents/)
})

test('Training catalog is data-driven and seeded with initial paths', () => {
  for (const path of ['Rack Prep', 'Speed Lite', 'Media Destruction', 'FA Lab', 'Forklift', 'TDR', 'Quality Audit']) {
    assert.match(storeSource, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(storeSource, /createTrainingPath/)
  assert.match(storeSource, /updateTrainingPath/)
})

test('Training API enforces reader, editor, and admin permissions', () => {
  assert.match(routesSource, /readerRoles/)
  assert.match(routesSource, /editorRoles/)
  assert.match(routesSource, /adminRoles/)
  assert.match(routesSource, /\/api\/training\/builders\/sync/)
  assert.match(routesSource, /\/api\/training\/catalog/)
  assert.match(routesSource, /\/api\/training\/qualifications\/bulk/)
  assert.match(routesSource, /\/api\/training\/export\.csv/)
  assert.match(guardedServerSource, /installTrainingRoutes/)
})

test('Training App transform adds only one import, navigation button, and panel', () => {
  const navEnhanced = appSource.replace(
    "          <button className={mainTab === 'comments' ? 'primary nav-tab active' : 'secondary nav-tab'} onClick={() => setMainTab('comments')}>Comments</button>",
    "          <button className={mainTab === 'manager' ? 'primary nav-tab active' : 'secondary nav-tab'} onClick={() => setMainTab('manager')}>Manager</button>\n          <button className={mainTab === 'comments' ? 'primary nav-tab active' : 'secondary nav-tab'} onClick={() => setMainTab('comments')}>Comments</button>",
  )
  const output = injectTrainingTab(navEnhanced)
  assert.match(output, /import TrainingTab from '\.\/TrainingTab\.jsx'/)
  assert.match(output, /setMainTab\('training'\)/)
  assert.match(output, /mainTab === 'training'/)
  assert.match(output, /<TrainingTab builders=\{state\.builderPool \|\| \[\]\}/)
  assert.equal(injectTrainingTab(output), output)
})

test('Training UI includes dashboard matrix catalog coverage history bulk import and exports', () => {
  for (const marker of [
    'Builder Training & Qualifications', 'Training Matrix', 'Builder Profiles', 'Area Coverage', 'Training Catalog',
    'Bulk Qualification Update', 'Import CSV', 'Export Excel', 'Export PDF', 'Training Coverage Risk',
  ]) assert.match(componentSource, new RegExp(marker))
  assert.match(clientSource, /\/api\/training/)
  assert.match(cssSource, /\.training-matrix-wrap/)
  assert.match(cssSource, /body\[data-theme="dark"\]/)
  assert.match(viteSource, /trainingTabPlugin\(\)/)
})
