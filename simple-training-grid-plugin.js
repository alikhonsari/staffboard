const IMPORT_MARKER = "import * as XLSX from 'xlsx'"
const MODE_MARKER = "const [mode, setMode] = useState('single')"
const TABS_MARKER = "        <button className={mode === 'single' ? 'primary' : 'secondary'} onClick={() => setMode('single')}>Selected Builder</button>"
const RENDER_MARKER = "    {mode === 'single' ? selectedSummary ? <>"

export function injectSimpleTrainingGrid(source) {
  if (source.includes("import SimpleTrainingGrid from './SimpleTrainingGrid'")) return source
  const required = [IMPORT_MARKER, MODE_MARKER, TABS_MARKER, RENDER_MARKER]
  const missing = required.filter((marker) => !source.includes(marker))
  if (missing.length) throw new Error(`Simple Training Grid transform markers missing: ${missing.join(' | ')}`)

  let output = source.replace(
    IMPORT_MARKER,
    `${IMPORT_MARKER}\nimport SimpleTrainingGrid from './SimpleTrainingGrid'`,
  )
  output = output.replace(MODE_MARKER, "const [mode, setMode] = useState('grid')")
  output = output.replace(
    TABS_MARKER,
    `        <button className={mode === 'grid' ? 'primary' : 'secondary'} onClick={() => setMode('grid')}>Simple Grid</button>\n${TABS_MARKER}`,
  )
  output = output.replace(
    RENDER_MARKER,
    `    {mode === 'grid' ? <SimpleTrainingGrid
      visibleSummaries={visibleSummaries}
      snapshot={snapshot}
      setSelectedBuilderId={setSelectedBuilderId}
      setMode={setMode}
      openQualification={openQualification}
      saving={saving}
    /> : mode === 'single' ? selectedSummary ? <>`,
  )
  return output
}

export function simpleTrainingGridPlugin() {
  return {
    name: 'staffboard-simple-training-grid',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/src/BuilderSkillsView.jsx')) return null
      return { code: injectSimpleTrainingGrid(source), map: null }
    },
  }
}
