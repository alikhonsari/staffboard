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

function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`${label} marker missing`)
  return source.replace(marker, replacement)
}

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
        <div className="small">Standalone training records with a simple builder-by-path matrix.</div>
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

export function injectStandaloneTrainingTab(source) {
  if (source.includes('const TRAINING_STANDALONE_MATRIX = true')) return source
  let output = replaceRequired(source, '  downloadTrainingCsv,\n', '  downloadTrainingCsv,\n  importTrainingMatrixCsv,\n', 'Training matrix client import')
  output = replaceRequired(output, "const clean = (value) => String(value ?? '').trim()", "const clean = (value) => String(value ?? '').trim()\nconst TRAINING_STANDALONE_MATRIX = true", 'Training standalone constant')
  output = replaceRequired(output, "  useEffect(() => { refresh({ syncRoster: true }) }, [rosterSignature])", "  useEffect(() => { refresh() }, [])", 'Training automatic sync')
  output = replaceRequired(
    output,
    "    try {\n      const rows = parseCsv(await file.text())",
    `    try {
      const text = await file.text()
      const firstHeader = text.replace(/^\\uFEFF/, '').split(/\\r?\\n/, 1)[0].toLowerCase()
      if (firstHeader.includes('builder') && !firstHeader.includes('training path')) {
        const result = await importTrainingMatrixCsv(text)
        await refresh()
        notify(\`Imported \${result.builders} Training builders, \${result.paths} paths, and \${result.qualificationsUpdated} qualification updates.\`)
        return
      }
      const rows = parseCsv(text)`,
    'Training matrix CSV detection',
  )
  return output
}

export function injectStandaloneTrainingWorkspace(source) {
  if (source.includes('data-training-standalone="true"')) return source
  let output = replaceRequired(source, "  shouldConfirmGridTransition,\n} from './trainingGridCore'", "  shouldConfirmGridTransition,\n  normalizeGridResult,\n} from './trainingGridCore'", 'Grid result normalizer import')
  output = replaceRequired(output, "import './training-simplified.css'", "import './training-simplified.css'\nimport './training-standalone.css'", 'Standalone Training stylesheet')
  output = replaceRequired(output, `const SIMPLE_TO_DETAILED = {
  Trained: 'Qualified',
  'Not Trained': 'Not Started',
  'In Training': 'In Training',
  Trainer: 'Trainer',
  Expired: 'Expired',
  Suspended: 'Suspended',
}`, `const SIMPLE_TO_DETAILED = {
  Trained: 'Qualified',
  'In Training': 'In Training',
  'Not Trained': 'Not Started',
}`, 'Simple status map')
  output = replaceRequired(output, `const QUICK_FILTERS = [
  ['Not Trained', 'Missing Training'],
  ['In Training', 'In Training'],
  ['Trainer', 'Trainers'],
  ['Expired', 'Expired'],
  ['Suspended', 'Suspended'],
]`, `const QUICK_FILTERS = [
  ['Not Trained', 'Not Trained'],
  ['In Training', 'In Training'],
  ['Trained', 'Trained'],
]`, 'Quick filters')
  output = replaceRequired(output, "const EMPTY_BUILDER = { name: '', badgeId: '', currentShift: '', department: '' }", "const EMPTY_BUILDER = { name: '', badgeTag: '', isTrainer: false }", 'Standalone builder draft')
  output = replaceRequired(output, `function visibleResult(row) {
  if (!row || row.result === 'Inactive') return 'Not Trained'
  return row.result
}`, `function visibleResult(row) {
  if (!row || row.result === 'Inactive') return 'Not Trained'
  return normalizeGridResult(row.result)
}`, 'Visible result normalization')
  output = replaceRequired(output, '    return simplifiedTrainingResult(qualification)', '    return normalizeGridResult(simplifiedTrainingResult(qualification))', 'Qualification result normalization')
  output = replaceRequired(output, `function summaryText(counts) {
  const parts = [
    counts.Trained ? \`\${counts.Trained} Trained\` : '',
    counts.Trainer ? \`\${counts.Trainer} Trainer\${counts.Trainer === 1 ? '' : 's'}\` : '',
    counts['Not Trained'] ? \`\${counts['Not Trained']} Not Trained\` : '',
    counts['In Training'] ? \`\${counts['In Training']} In Training\` : '',
  ].filter(Boolean)
  return parts.join(' · ') || 'No active training paths'
}`, `function summaryText(counts) {
  const parts = [
    counts.Trained ? \`\${counts.Trained} Trained\` : '',
    counts['In Training'] ? \`\${counts['In Training']} In Training\` : '',
    counts['Not Trained'] ? \`\${counts['Not Trained']} Not Trained\` : '',
  ].filter(Boolean)
  return parts.join(' · ') || 'No active training paths'
}`, 'Builder summary')
  output = replaceRequired(output, '<section className="training-simple-workspace" data-training-workspace-version="2">', '<section className="training-simple-workspace" data-training-workspace-version="3" data-training-standalone="true">', 'Standalone workspace marker')
  output = replaceRequired(output, '    {message ? <div className="training-message training-message-success" role="status">{message}</div> : null}', `    <div className="training-standalone-banner" role="note"><strong>Standalone Training</strong><span>Changes here do not change staffing assignments, attendance, operational badges, shifts, or the Master Builder board.</span></div>
    {message ? <div className="training-message training-message-success" role="status">{message}</div> : null}`, 'Standalone banner')
  output = replaceRequired(output, "        {canManageBuilders ? <button type=\"button\" className=\"secondary\" onClick={() => setBuilderDraft({ ...EMPTY_BUILDER })}>Add Builder</button> : null}", "        {canManageBuilders ? <><button type=\"button\" className=\"primary\" onClick={onImport}>Import Matrix</button><button type=\"button\" className=\"secondary\" onClick={() => setBuilderDraft({ ...EMPTY_BUILDER })}>Add Builder</button></> : null}", 'Grid import action')
  output = output.replace('<button onClick={onImport}>Import</button>', '<button onClick={onImport}>Import Matrix CSV</button>')
  output = output.replace('Sync imports builders already managed in StaffBoard. Add Builder creates a Training-only builder.', 'Import Matrix creates Training-only builders and paths. Add Builder creates one Training-only builder.')
  output = replaceRequired(output, `{canManageBuilders ? <div><button type="button" className="primary" disabled={busy} onClick={syncRoster}>Sync StaffBoard Builders</button><button type="button" className="secondary" onClick={() => setBuilderDraft({ ...EMPTY_BUILDER })}>Add Builder</button></div> : null}`, `{canManageBuilders ? <div><button type="button" className="primary" disabled={busy} onClick={onImport}>Import Matrix CSV</button><button type="button" className="secondary" onClick={() => setBuilderDraft({ ...EMPTY_BUILDER })}>Add Builder</button></div> : null}`, 'Empty-state actions')
  output = replaceRequired(output, `<small>{summary.builder.currentShift || 'Shift not set'}{summary.builder.archived ? ' · Archived' : ''}</small><button type="button" className="training-missing-count"`, `<div className="training-builder-tags"><span className={\`training-builder-tag \${summary.builder.badgeTag === 'Green Badge' ? 'training-builder-tag-green' : summary.builder.badgeTag === 'Blue Badge' ? 'training-builder-tag-blue' : 'training-builder-tag-muted'}\`}>{summary.builder.badgeTag || 'Badge not set'}</span><span className={\`training-builder-tag \${summary.builder.isTrainer ? 'training-builder-tag-trainer' : 'training-builder-tag-muted'}\`}>{summary.builder.isTrainer ? 'Trainer' : 'Not Trainer'}</span>{summary.builder.archived ? <span className="training-builder-tag training-builder-tag-muted">Archived</span> : null}</div><button type="button" className="training-missing-count"`, 'Builder grid tags')
  output = replaceRequired(output, `<div className="training-simple-section-head"><div><strong>Builders</strong><small>{snapshot.builders.length} Training builder records</small></div>{canManageBuilders ? <div><button type="button" className="secondary" disabled={busy} onClick={syncRoster}>Sync StaffBoard Builders</button><button type="button" className="primary" onClick={() => setBuilderDraft({ ...EMPTY_BUILDER })}>Add Builder</button></div> : null}</div>`, `<div className="training-simple-section-head"><div><strong>Builders</strong><small>{snapshot.builders.length} standalone Training builder records</small></div>{canManageBuilders ? <div><button type="button" className="secondary" disabled={busy} onClick={onImport}>Import Matrix</button><button type="button" className="primary" onClick={() => setBuilderDraft({ ...EMPTY_BUILDER })}>Add Builder</button></div> : null}</div>`, 'Builder section actions')
  output = replaceRequired(output, `<th>Builder</th><th>Badge ID</th><th>Shift</th><th>Department</th><th>Training summary</th>`, `<th>Builder</th><th>Badge Tag</th><th>Trainer Tag</th><th>Training summary</th>`, 'Builder table headings')
  output = replaceRequired(output, `<td><strong>{builder.name}</strong></td><td>{builder.badgeId || '—'}</td><td>{builder.currentShift || '—'}</td><td>{builder.department || '—'}</td><td>{summaryText(counts)}</td>`, `<td><strong>{builder.name}</strong></td><td><span className={\`training-builder-tag \${builder.badgeTag === 'Green Badge' ? 'training-builder-tag-green' : builder.badgeTag === 'Blue Badge' ? 'training-builder-tag-blue' : 'training-builder-tag-muted'}\`}>{builder.badgeTag || 'Not Set'}</span></td><td><span className={\`training-builder-tag \${builder.isTrainer ? 'training-builder-tag-trainer' : 'training-builder-tag-muted'}\`}>{builder.isTrainer ? 'Trainer' : 'Not Trainer'}</span></td><td>{summaryText(counts)}</td>`, 'Builder table tags')
  output = replaceRequired(output, `      <label>Badge ID <span className="small">optional</span><input value={builderDraft.badgeId || ''} onChange={(event) => setBuilderDraft((current) => ({ ...current, badgeId: event.target.value }))} /></label>
      <div className="row two"><label>Shift <span className="small">optional</span><input value={builderDraft.currentShift || ''} onChange={(event) => setBuilderDraft((current) => ({ ...current, currentShift: event.target.value }))} /></label><label>Department <span className="small">optional</span><input value={builderDraft.department || ''} onChange={(event) => setBuilderDraft((current) => ({ ...current, department: event.target.value }))} /></label></div>
      <small>Possible duplicates are checked by builder ID, badge ID, and normalized name.</small>`, `      <label className="training-tag-choice">Badge Tag <span className="small">optional</span><select value={builderDraft.badgeTag || ''} onChange={(event) => setBuilderDraft((current) => ({ ...current, badgeTag: event.target.value }))}><option value="">Not Set</option><option value="Blue Badge">Blue Badge</option><option value="Green Badge">Green Badge</option></select></label>
      <label className="training-tag-checkbox"><input type="checkbox" checked={Boolean(builderDraft.isTrainer)} onChange={(event) => setBuilderDraft((current) => ({ ...current, isTrainer: event.target.checked }))} /> Trainer</label>
      <small>This profile exists only inside Training. Duplicate names are prevented.</small>`, 'Builder tag form')
  output = replaceRequired(output, '<th>Trained</th><th>Trainers</th><th>Missing</th>', '<th>Trained</th><th>In Training</th><th>Not Trained</th>', 'Path count headings')
  output = replaceRequired(output, `<td>{counts.Trained || 0}</td><td>{counts.Trainer || 0}</td><td>{counts['Not Trained'] || 0}</td>`, `<td>{counts.Trained || 0}</td><td>{counts['In Training'] || 0}</td><td>{counts['Not Trained'] || 0}</td>`, 'Path count values')
  return output
}

export function trainingSimplificationPlugin() {
  return {
    name: 'staffboard-training-simplification',
    enforce: 'pre',
    transform(source, id) {
      if (id.endsWith('/src/TrainingTab.jsx')) return { code: injectStandaloneTrainingTab(injectTrainingSimplification(source)), map: null }
      if (id.endsWith('/src/SimplifiedTrainingWorkspace.jsx')) return { code: injectStandaloneTrainingWorkspace(injectSimplifiedWorkspacePolish(source)), map: null }
      return null
    },
  }
}
