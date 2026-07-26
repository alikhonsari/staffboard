import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { injectSimpleTrainingGrid } from '../simple-training-grid-plugin.js'

const viewSource = fs.readFileSync(new URL('../src/BuilderSkillsView.jsx', import.meta.url), 'utf8')
const gridSource = fs.readFileSync(new URL('../src/SimpleTrainingGrid.jsx', import.meta.url), 'utf8')
const cssSource = fs.readFileSync(new URL('../src/simple-training-grid.css', import.meta.url), 'utf8')
const viteSource = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

function transformedView() {
  return injectSimpleTrainingGrid(viewSource)
}

test('spreadsheet grid becomes the default Builder Skills mode', () => {
  const output = transformedView()
  assert.match(output, /import SimpleTrainingGrid from '\.\/SimpleTrainingGrid'/)
  assert.match(output, /const \[mode, setMode\] = useState\('grid'\)/)
  assert.match(output, />Simple Grid<\/button>/)
  assert.match(output, /mode === 'grid' \? <SimpleTrainingGrid/)
})

test('grid renders builders as rows and training paths as columns', () => {
  assert.match(gridSource, /<th className="simple-training-builder-column">Builder<\/th>/)
  assert.match(gridSource, /columns\.map\(\(column\) => <th/)
  assert.match(gridSource, /visibleSummaries\.map\(\(summary\)/)
  assert.match(gridSource, /summary\.builder\.name/)
  assert.match(gridSource, />\{result\}<\/button>/)
})

test('missing qualifications display Not Trained without creating records', () => {
  assert.match(gridSource, /row\?\.result \|\| 'Not Trained'/)
  assert.match(gridSource, /Detailed status: Not Started/)
  assert.doesNotMatch(gridSource, /saveQuickQualification|saveQualification/)
})

test('clicking a status cell opens the existing detailed qualification form', () => {
  assert.match(gridSource, /onClick=\{\(\) => openQualification\(summary\.builder\.id, column\.trainingId\)\}/)
  assert.match(gridSource, /snapshot\.permissions\.canEditQualifications/)
  assert.match(gridSource, /completionDate/)
  assert.match(gridSource, /expirationDate/)
  assert.match(gridSource, /trainerName/)
  assert.match(gridSource, /notes/)
})

test('spreadsheet layout has sticky headers and a frozen Builder column', () => {
  assert.match(cssSource, /\.simple-training-grid thead th\{position:sticky;top:0/)
  assert.match(cssSource, /\.simple-training-grid \.simple-training-builder-column\{position:sticky;left:0/)
  assert.match(cssSource, /max-height:72vh;overflow:auto/)
  assert.match(cssSource, /border-collapse:separate/)
})

test('grid supports status colors, dark mode, mobile, and print', () => {
  assert.match(cssSource, /training-result-trained/)
  assert.match(cssSource, /training-result-not-trained/)
  assert.match(cssSource, /training-result-in-training/)
  assert.match(cssSource, /training-result-trainer/)
  assert.match(cssSource, /body\[data-theme="dark"\]/)
  assert.match(cssSource, /@media\(max-width:640px\)/)
  assert.match(cssSource, /@media print/)
})

test('Vite registers the grid transform after Builder Skills', () => {
  assert.match(viteSource, /simpleTrainingGridPlugin/)
  assert.match(viteSource, /builderSkillsViewPlugin\(\), simpleTrainingGridPlugin\(\)/)
})

test('grid transform is idempotent', () => {
  const once = transformedView()
  assert.equal(injectSimpleTrainingGrid(once), once)
})
