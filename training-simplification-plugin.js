const IMPORT_MARKER = "import BuilderSkillsView from './BuilderSkillsView'\n"
const VIEW_MARKER = "const [view, setView] = useState('skills')"
const RENDER_MARKER = "    {!loading && view === 'skills' ? <BuilderSkillsView"
const TOOLBAR_RENDER = '    {toolbar}'
const HEADER_MARKER = `    <div className="board-header training-header">
      <div>
        <div className="title">Builder Training & Qualifications</div>
        <div className="small">Track qualifications, cross-training, trainers, expirations, certifications, coverage risk, and recommended next paths.</div>
      </div>
      <div className="chiprow"><span className="pill">Normalized PostgreSQL</span><span className="pill">Updated by {currentUser || 'StaffBoard'}</span></div>
    </div>`

const WORKSPACE_ERROR_GUIDE_MARKER = `    {error ? <div className="training-message training-message-error">{error}</div> : null}

    {showGuide ? <div className="training-simple-guide">`
const WORKSPACE_IMPORT_MARKER = '{canEdit ? <button onClick={onImport}>Import CSV</button> : null}'
const WORKSPACE_HIRE_DATE_MARKER = `      <label>Hire date<input type="date" value={builderDraft.hireDate || ''} onChange={(event) => setBuilderDraft((current) => ({ ...current, hireDate: event.target.value }))} /></label>
`
const WORKSPACE_READONLY_MARKER = "<dt>Trainer</dt><dd>{readOnlyDetails.trainerName || '—'}</dd><dt>Notes</dt>"

export function injectSimplifiedWorkspacePolish(source) {
  if (source.includes('data-training-workspace-version="2"')) return source
  if (source.includes('View-only access: you can view the Training grid and details')) return source
  const required = [WORKSPACE_ERROR_GUIDE_MARKER, WORKSPACE_IMPORT_MARKER, WORKSPACE_HIRE_DATE_MARKER, WORKSPACE_READONLY_MARKER]
  const missing = required.filter((marker) => !source.includes(marker))
  if (missing.length) throw new Error(`Simplified Training workspace markers missing: ${missing.join(' | ')}`)

  let output = source.replace(
    WORKSPACE_ERROR_GUIDE_MARKER,
    `    {error ? <div className="training-message training-message-error">{error}</div> : null}
    {!canEdit ? <div className="training-message training-message-error" role="status">View-only access: you can view the Training grid and details, but cannot change cells, builders, or paths.</div> : null}

    {showGuide && canManageBuilders ? <div className="training-simple-guide">`,
  )
  output = output.replace(WORKSPACE_IMPORT_MARKER, '{canManageBuilders ? <button onClick={onImport}>Import CSV</button> : null}')
  output = output.replace(WORKSPACE_HIRE_DATE_MARKER, '')
  output = output.replace(
    WORKSPACE_READONLY_MARKER,
    "<dt>Trainer</dt><dd>{readOnlyDetails.trainerName || '—'}</dd><dt>Certificate number</dt><dd>{readOnlyDetails.certificateNumber || '—'}</dd><dt>Certificate URL</dt><dd>{readOnlyDetails.certificateFileUrl ? <a href={readOnlyDetails.certificateFileUrl} target=\"_blank\" rel=\"noreferrer\">Open certificate</a> : '—'}</dd><dt>Assessment score</dt><dd>{readOnlyDetails.assessmentScore === '' || readOnlyDetails.assessmentScore == null ? '—' : readOnlyDetails.assessmentScore}</dd><dt>Notes</dt>",
  )
  return output
}

export function injectTrainingSimplification(source) {
  if (source.includes("import SimplifiedTrainingWorkspace from './SimplifiedTrainingWorkspace'")) return source
  const required = [IMPORT_MARKER, VIEW_MARKER, RENDER_MARKER, TOOLBAR_RENDER, HEADER_MARKER]
  const missing = required.filter((marker) => !source.includes(marker))
  if (missing.length) throw new Error(`Training simplification transform markers missing: ${missing.join(' | ')}`)

  let output = source.replace(IMPORT_MARKER, `${IMPORT_MARKER}import SimplifiedTrainingWorkspace from './SimplifiedTrainingWorkspace'\n`)
  output = output.replace(VIEW_MARKER, "const [view, setView] = useState('simple')")
  output = output.replace('builders.map((builder) => ({', 'builders.filter((builder) => !builder.isArchived && !builder.archived).map((builder) => ({')
  output = output.replace("badgeId: builder.badgeId || builder.badgeNumber || '',", "badgeId: builder.badgeId || builder.badgeNumber || builder.employeeId || '',")
  output = output.replace("hireDate: builder.hireDate || '',", "hireDate: builder.hireDate || builder.startDate || '',")
  output = output.replace("currentStatus: builder.status || 'Active',", "currentStatus: builder.isArchived || builder.archived ? 'Archived' : (builder.status || builder.currentStatus || 'Active'),")
  output = output.replace("currentShift: builder.currentShift || builder.shift || currentShift || '',", "currentShift: builder.currentShift || builder.shift || builder.defaultShift || currentShift || '',")
  output = output.replace("department: builder.department || '',", "department: builder.department || builder.defaultBoardId || '',")
  output = output.replace(HEADER_MARKER, `    <div className="board-header training-header training-header-simplified">
      <div>
        <div className="title">Training</div>
        <div className="small">Add builders, add paths, then click a grid cell to update training.</div>
      </div>
      <div className="chiprow"><span className="pill">{snapshot.builders.length} builders</span><span className="pill">{snapshot.catalog.filter((path) => path.active).length} paths</span></div>
    </div>`)
  output = output.replace(TOOLBAR_RENDER, `    <input ref={importRef} className="training-hidden-input" type="file" accept=".csv,text/csv" onChange={importCsv} />
    {!loading && view !== 'simple' ? <div className="training-advanced-bar">
      <button className="primary" onClick={() => setView('simple')}>← Training Grid</button>
      <select value={view} onChange={(event) => setView(event.target.value)}>
        <option value="dashboard">Dashboard</option>
        <option value="coverage">Area Coverage</option>
        <option value="builders">Builder Profiles</option>
        <option value="history">History</option>
        <option value="matrix">Advanced Matrix</option>
        <option value="skills">Legacy Builder Skills</option>
        <option value="catalog">Advanced Catalog</option>
      </select>
      <span className="small">Advanced reports and history</span>
    </div> : null}`)
  output = output.replace(RENDER_MARKER, `    {!loading && view === 'simple' ? <SimplifiedTrainingWorkspace
      snapshot={snapshot}
      staffboardBuilders={builders}
      currentShift={currentShift}
      onRefresh={() => refresh()}
      onOpenDetails={openQualification}
      onAdvancedView={setView}
      onImport={() => importRef.current?.click()}
      onExportCsv={downloadTrainingCsv}
      onExportExcel={exportExcel}
      onExportPdf={exportPdf}
      saving={saving}
    /> : null}

${RENDER_MARKER}`)
  return output
}

export function trainingSimplificationPlugin() {
  return {
    name: 'staffboard-training-simplification',
    enforce: 'pre',
    transform(source, id) {
      if (id.endsWith('/src/TrainingTab.jsx')) return { code: injectTrainingSimplification(source), map: null }
      if (id.endsWith('/src/SimplifiedTrainingWorkspace.jsx')) return { code: injectSimplifiedWorkspacePolish(source), map: null }
      return null
    },
  }
}
