import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  buildAllBuilderSkillSummaries,
  buildBuilderSkills,
  buildBuilderTrainingExportRows,
  buildQuickQualificationDraft,
  filterAndSortBuilderSummaries,
  filterBuilderSkillRows,
  groupBuilderSkillRows,
  requiresUntrainConfirmation,
  simplifiedTrainingResult,
} from '../src/builderSkillsCore.js'
import { injectBuilderSkillsView } from '../builder-skills-view-plugin.js'

const TODAY = new Date('2026-07-26T12:00:00Z')
const snapshot = {
  builders: [
    { id: 'b-1', name: 'John Smith', badgeId: '1001', currentShift: 'Day Shift', department: 'SPEED', archived: false },
    { id: 'b-2', name: 'Jane Doe', badgeId: '1002', currentShift: 'Night Shift', department: 'SPEED', archived: false },
  ],
  catalog: [
    { id: 't-media', name: 'Media Recovery', category: 'Operations', active: true },
    { id: 't-outbound', name: 'Outbound', category: 'Operations', active: true },
    { id: 't-tdr', name: 'TDR', category: 'Leadership and Support', active: true },
    { id: 't-old', name: 'Legacy Path', category: 'Other', active: false },
  ],
  qualifications: [
    { builderId: 'b-1', trainingId: 't-media', status: 'Qualified', completionDate: '2026-01-10', updatedAt: '2026-07-20T10:00:00Z' },
    { builderId: 'b-1', trainingId: 't-tdr', status: 'Trainer', completionDate: '2026-02-10', updatedAt: '2026-07-22T10:00:00Z' },
    { builderId: 'b-2', trainingId: 't-media', status: 'In Training', trainerName: 'John Smith', updatedAt: '2026-07-24T10:00:00Z' },
  ],
}

test('simplified result mapping preserves detailed statuses', () => {
  assert.equal(simplifiedTrainingResult(null, TODAY), 'Not Trained')
  assert.equal(simplifiedTrainingResult({ status: 'Not Started' }, TODAY), 'Not Trained')
  assert.equal(simplifiedTrainingResult({ status: 'Qualified' }, TODAY), 'Trained')
  assert.equal(simplifiedTrainingResult({ status: 'Cross-Trained' }, TODAY), 'Trained')
  assert.equal(simplifiedTrainingResult({ status: 'Trainer' }, TODAY), 'Trainer')
  assert.equal(simplifiedTrainingResult({ status: 'In Training' }, TODAY), 'In Training')
  assert.equal(simplifiedTrainingResult({ status: 'Suspended' }, TODAY), 'Suspended')
})

test('past expiration displays Expired without replacing detailed status', () => {
  const qualification = { status: 'Qualified', expirationDate: '2026-07-01' }
  assert.equal(simplifiedTrainingResult(qualification, TODAY), 'Expired')
})

test('new catalog paths automatically appear as Not Trained without database rows', () => {
  const summary = buildBuilderSkills(snapshot.builders[0], snapshot, { today: TODAY })
  const outbound = summary.rows.find((row) => row.trainingId === 't-outbound')
  assert.equal(outbound.result, 'Not Trained')
  assert.equal(outbound.detailedStatus, 'Not Started')
  assert.equal(outbound.qualification, null)
  assert.equal(summary.counts.all, 3)
  assert.equal(summary.counts.Trained, 1)
  assert.equal(summary.counts.Trainer, 1)
  assert.equal(summary.counts['Not Trained'], 1)
})

test('inactive catalog paths are hidden by default and can be included', () => {
  const activeOnly = buildBuilderSkills(snapshot.builders[0], snapshot, { today: TODAY })
  const withInactive = buildBuilderSkills(snapshot.builders[0], snapshot, { today: TODAY, includeInactive: true })
  assert.equal(activeOnly.rows.some((row) => row.trainingId === 't-old'), false)
  assert.equal(withInactive.rows.some((row) => row.trainingId === 't-old'), true)
})

test('quick qualification drafts default trained completion to today and preserve details', () => {
  const draft = buildQuickQualificationDraft({ notes: 'Observed', trainerName: 'Ali' }, 'b-1', 't-media', 'Qualified', TODAY)
  assert.equal(draft.completionDate, '2026-07-26')
  assert.equal(draft.notes, 'Observed')
  assert.equal(draft.trainerName, 'Ali')
  assert.equal(draft.status, 'Qualified')
})

test('removing a qualified or trainer status requires confirmation', () => {
  assert.equal(requiresUntrainConfirmation({ status: 'Qualified' }), true)
  assert.equal(requiresUntrainConfirmation({ status: 'Cross-Trained' }), true)
  assert.equal(requiresUntrainConfirmation({ status: 'Trainer' }), true)
  assert.equal(requiresUntrainConfirmation({ status: 'In Training' }), false)
  assert.equal(requiresUntrainConfirmation(null), false)
})

test('result filters and category grouping use the complete builder checklist', () => {
  const summary = buildBuilderSkills(snapshot.builders[0], snapshot, { today: TODAY })
  assert.deepEqual(filterBuilderSkillRows(summary.rows, 'Trained').map((row) => row.trainingName), ['Media Recovery'])
  assert.deepEqual(filterBuilderSkillRows(summary.rows, 'Not Trained').map((row) => row.trainingName), ['Outbound'])
  const groups = groupBuilderSkillRows(summary.rows)
  assert.deepEqual(groups.map((group) => group.category), ['Leadership and Support', 'Operations'])
})

test('all-builder search finds path results and sorting supports trained and updated order', () => {
  const summaries = buildAllBuilderSkillSummaries(snapshot, { today: TODAY })
  const mediaMatches = filterAndSortBuilderSummaries(summaries, { search: 'Media Recovery', sort: 'name' })
  assert.deepEqual(mediaMatches.map((item) => item.builder.name), ['Jane Doe', 'John Smith'])
  const trained = filterAndSortBuilderSummaries(summaries, { sort: 'trained-desc' })
  assert.equal(trained[0].builder.name, 'John Smith')
  const updated = filterAndSortBuilderSummaries(summaries, { sort: 'updated-desc' })
  assert.equal(updated[0].builder.name, 'Jane Doe')
})

test('builder-focused export includes every builder and active path with simple and detailed results', () => {
  const rows = buildBuilderTrainingExportRows(snapshot, { today: TODAY })
  assert.equal(rows.length, 6)
  const missing = rows.find((row) => row.Builder === 'Jane Doe' && row['Training Area'] === 'Outbound')
  assert.equal(missing['Simplified Result'], 'Not Trained')
  assert.equal(missing['Detailed Status'], 'Not Started')
  assert.equal(Object.hasOwn(missing, 'Completion Date'), true)
  assert.equal(Object.hasOwn(missing, 'Expiration Date'), true)
})

test('Training transform adds Builder Skills as the default view and remains idempotent', () => {
  const source = fs.readFileSync(new URL('../src/TrainingTab.jsx', import.meta.url), 'utf8')
  const output = injectBuilderSkillsView(source)
  assert.match(output, /import BuilderSkillsView from '\.\/BuilderSkillsView'/)
  assert.match(output, /useState\('skills'\)/)
  assert.match(output, /\['skills', 'Builder Skills'\]/)
  assert.match(output, /view === 'skills'/)
  assert.match(output, /saveQuickQualification/)
  assert.match(output, /Certificate file URL/)
  assert.equal(injectBuilderSkillsView(output), output)
})

test('Builder Skills UI includes fast actions, exports, permissions, sticky layout, dark mode, and print markers', () => {
  const component = fs.readFileSync(new URL('../src/BuilderSkillsView.jsx', import.meta.url), 'utf8')
  const css = fs.readFileSync(new URL('../src/training.css', import.meta.url), 'utf8')
  const vite = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')
  assert.match(component, /Mark Trained/)
  assert.match(component, /Mark Not Trained/)
  assert.match(component, /Mark In Training/)
  assert.match(component, /Mark Trainer/)
  assert.match(component, /Builder Summary CSV/)
  assert.match(component, /Builder Summary Excel/)
  assert.match(component, /Selected Builder PDF/)
  assert.match(component, /snapshot\.permissions\.canEditQualifications/)
  assert.match(css, /\.builder-skills-identity\{position:sticky/)
  assert.match(css, /body\[data-theme="dark"\]/)
  assert.match(css, /@media print/)
  assert.match(vite, /builderSkillsViewPlugin\(\)/)
})
