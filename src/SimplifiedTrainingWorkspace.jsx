import React, { useMemo, useState } from 'react'
import {
  createTrainingBuilder,
  createTrainingPath,
  reorderTrainingPaths,
  saveQualification,
  syncTrainingBuilders,
  updateTrainingBuilder,
  updateTrainingPath,
} from './trainingClient'
import {
  buildAllBuilderSkillSummaries,
  buildQuickQualificationDraft,
  requiresUntrainConfirmation,
  SIMPLE_RESULT_META,
} from './builderSkillsCore'
import { qualificationKey } from './trainingCore'
import './training-simplified.css'

const clean = (value) => String(value ?? '').trim()
const SIMPLE_TO_DETAILED = {
  Trained: 'Qualified',
  'Not Trained': 'Not Started',
  'In Training': 'In Training',
  Trainer: 'Trainer',
  Expired: 'Expired',
  Suspended: 'Suspended',
}
const CELL_OPTIONS = ['Trained', 'Not Trained', 'In Training', 'Trainer', 'Expired']
const EMPTY_BUILDER = { name: '', badgeId: '', currentShift: '', department: '', hireDate: '' }
const EMPTY_PATH = { name: '', category: 'Operations', description: '', minimumQualified: 2, expirationDays: '' }

function normalizedRoster(builders = [], currentShift = '') {
  return (Array.isArray(builders) ? builders : [])
    .filter((builder) => !builder.isArchived && !builder.archived)
    .map((builder) => ({
      id: builder.id,
      name: builder.name,
      badgeId: builder.badgeId || builder.badgeNumber || builder.employeeId || '',
      hireDate: builder.hireDate || builder.startDate || '',
      currentStatus: builder.status || builder.currentStatus || 'Active',
      currentShift: builder.currentShift || builder.shift || builder.defaultShift || currentShift || '',
      department: builder.department || builder.defaultBoardId || '',
    }))
    .filter((builder) => builder.id && clean(builder.name))
}

function visibleResult(row) {
  if (!row || row.result === 'Inactive') return 'Not Trained'
  return row.result
}

function statusClass(result) {
  return (SIMPLE_RESULT_META[result] || SIMPLE_RESULT_META['Not Trained']).className
}

function buildQuickPayload(row, simpleResult) {
  const status = SIMPLE_TO_DETAILED[simpleResult] || 'Not Started'
  const draft = buildQuickQualificationDraft(row?.qualification || null, row.builderId, row.trainingId, status)
  return {
    ...draft,
    completionDate: simpleResult === 'Not Trained' ? '' : draft.completionDate,
    expirationDate: simpleResult === 'Not Trained' ? '' : draft.expirationDate,
    reason: `Training Grid quick update: ${simpleResult}`,
  }
}

function Modal({ title, onClose, children, wide = false }) {
  return <div className="training-simple-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <div className={`training-simple-modal ${wide ? 'wide' : ''}`}>
      <div className="training-simple-modal-header"><strong>{title}</strong><button type="button" className="secondary mini-btn" onClick={onClose}>Close</button></div>
      {children}
    </div>
  </div>
}

export default function SimplifiedTrainingWorkspace({
  snapshot,
  staffboardBuilders = [],
  currentShift = '',
  onRefresh,
  onOpenDetails,
  onAdvancedView,
  onImport,
  onExportCsv,
  onExportExcel,
  onExportPdf,
  saving = false,
}) {
  const [tab, setTab] = useState('grid')
  const [search, setSearch] = useState('')
  const [shift, setShift] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [builderDraft, setBuilderDraft] = useState(null)
  const [pathDraft, setPathDraft] = useState(null)
  const [pathAdvanced, setPathAdvanced] = useState(false)
  const [cellMenu, setCellMenu] = useState(null)
  const [readOnlyDetails, setReadOnlyDetails] = useState(null)
  const [showGuide, setShowGuide] = useState(() => localStorage.getItem('staffboard.training.simpleGuideDismissed') !== '1')

  const canEdit = Boolean(snapshot.permissions?.canEditQualifications)
  const canManageBuilders = Boolean(snapshot.permissions?.canManageBuilders ?? snapshot.permissions?.canManageCatalog)
  const canManageCatalog = Boolean(snapshot.permissions?.canManageCatalog)
  const roster = useMemo(() => normalizedRoster(staffboardBuilders, currentShift), [staffboardBuilders, currentShift])
  const summaries = useMemo(() => buildAllBuilderSkillSummaries(snapshot, { includeArchived: true }), [snapshot])
  const activeSummaries = useMemo(() => summaries.filter((summary) => !summary.builder.archived), [summaries])
  const activeCatalog = useMemo(() => snapshot.catalog.filter((path) => path.active), [snapshot.catalog])
  const shifts = useMemo(() => [...new Set(activeSummaries.map((summary) => summary.builder.currentShift).filter(Boolean))].sort(), [activeSummaries])
  const visibleSummaries = useMemo(() => {
    const query = clean(search).toLowerCase()
    return activeSummaries.filter((summary) => {
      if (shift && summary.builder.currentShift !== shift) return false
      if (!query) return true
      return `${summary.builder.name} ${summary.builder.badgeId || ''} ${summary.builder.department || ''}`.toLowerCase().includes(query)
    })
  }, [activeSummaries, search, shift])
  const summaryByBuilder = useMemo(() => new Map(summaries.map((summary) => [summary.builder.id, summary])), [summaries])
  const rowMaps = useMemo(() => new Map(summaries.map((summary) => [summary.builder.id, new Map(summary.rows.map((row) => [row.trainingId, row]))])), [summaries])

  const notify = (text) => {
    setMessage(text)
    setError('')
    window.setTimeout(() => setMessage(''), 3500)
  }

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      return await action()
    } catch (requestError) {
      setError(requestError.message || 'Training action failed.')
      throw requestError
    } finally {
      setBusy(false)
    }
  }

  async function syncRoster() {
    if (!canEdit) return
    if (!roster.length) {
      setError('No active builders were found in StaffBoard Builder Management. Add a builder there or use Add Builder Manually.')
      return
    }
    await run(async () => {
      const result = await syncTrainingBuilders(roster)
      await onRefresh()
      const details = [result.created ? `${result.created} added` : '', result.updated ? `${result.updated} updated` : '', result.skipped ? `${result.skipped} skipped as duplicates` : ''].filter(Boolean).join(' · ')
      notify(`${result.synced} builders synchronized${details ? ` — ${details}` : ''}.`)
    })
  }

  async function saveBuilder(event) {
    event.preventDefault()
    if (!canManageBuilders) return
    const draft = builderDraft || EMPTY_BUILDER
    await run(async () => {
      if (draft.id) await updateTrainingBuilder(draft.id, draft)
      else await createTrainingBuilder(draft)
      setBuilderDraft(null)
      await onRefresh()
      notify(draft.id ? 'Builder updated.' : 'Builder added to Training.')
    })
  }

  async function toggleBuilderArchive(builder) {
    if (!canManageBuilders) return
    await run(async () => {
      await updateTrainingBuilder(builder.id, { archived: !builder.archived, currentStatus: builder.archived ? 'Active' : 'Archived' })
      await onRefresh()
      notify(`${builder.name} ${builder.archived ? 'restored' : 'archived'}.`)
    })
  }

  async function savePath(event) {
    event.preventDefault()
    if (!canManageCatalog) return
    const draft = pathDraft || EMPTY_PATH
    await run(async () => {
      if (draft.id) await updateTrainingPath(draft.id, draft)
      else await createTrainingPath(draft)
      setPathDraft(null)
      setPathAdvanced(false)
      await onRefresh()
      notify(draft.id ? 'Training path updated.' : 'Training path added. It now appears in the grid as Not Trained for builders without records.')
    })
  }

  async function togglePath(path) {
    if (!canManageCatalog) return
    await run(async () => {
      await updateTrainingPath(path.id, { active: !path.active })
      await onRefresh()
      notify(`${path.name} ${path.active ? 'archived' : 'restored'}.`)
    })
  }

  async function movePath(pathId, direction) {
    if (!canManageCatalog) return
    const ids = snapshot.catalog.map((path) => path.id)
    const index = ids.indexOf(pathId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    await run(async () => {
      await reorderTrainingPaths(ids)
      await onRefresh()
      notify('Training path order updated.')
    })
  }

  function openCell(event, summary, path) {
    const row = rowMaps.get(summary.builder.id)?.get(path.id) || {
      builderId: summary.builder.id,
      trainingId: path.id,
      trainingName: path.name,
      detailedStatus: 'Not Started',
      result: 'Not Trained',
      qualification: null,
    }
    const rect = event.currentTarget.getBoundingClientRect()
    setCellMenu({ row, builder: summary.builder, path, top: Math.min(window.innerHeight - 260, rect.bottom + 4), left: Math.min(window.innerWidth - 230, rect.left) })
  }

  async function quickUpdate(simpleResult) {
    if (!canEdit || !cellMenu) return
    const { row } = cellMenu
    if (simpleResult === 'Not Trained' && requiresUntrainConfirmation(row.qualification)) {
      const confirmed = window.confirm(`Mark ${cellMenu.builder.name} as Not Trained for ${row.trainingName}? Existing qualification history will be preserved.`)
      if (!confirmed) return
    }
    await run(async () => {
      await saveQualification(buildQuickPayload(row, simpleResult))
      setCellMenu(null)
      await onRefresh()
      notify(`${cellMenu.builder.name} · ${row.trainingName}: ${simpleResult}`)
    })
  }

  function openDetails(row) {
    setCellMenu(null)
    if (canEdit) onOpenDetails(row.builderId, row.trainingId)
    else setReadOnlyDetails(row)
  }

  function dismissGuide() {
    localStorage.setItem('staffboard.training.simpleGuideDismissed', '1')
    setShowGuide(false)
  }

  return <section className="training-simple-workspace">
    <div className="training-simple-primary-tabs">
      <button className={tab === 'grid' ? 'primary' : 'secondary'} onClick={() => setTab('grid')}>Training Grid</button>
      <button className={tab === 'builders' ? 'primary' : 'secondary'} onClick={() => setTab('builders')}>Builders</button>
      <button className={tab === 'paths' ? 'primary' : 'secondary'} onClick={() => setTab('paths')}>Training Paths</button>
    </div>

    {message ? <div className="training-message training-message-success">{message}</div> : null}
    {error ? <div className="training-message training-message-error">{error}</div> : null}

    {showGuide ? <div className="training-simple-guide">
      <strong>Set up Training in three steps</strong>
      <span><b>1</b> Add or sync builders</span><span><b>2</b> Add training paths</span><span><b>3</b> Click a cell to mark training</span>
      <button type="button" className="secondary mini-btn" onClick={dismissGuide}>Dismiss</button>
    </div> : null}

    {tab === 'grid' ? <>
      <div className="training-simple-toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search builders…" />
        <select value={shift} onChange={(event) => setShift(event.target.value)}><option value="">All shifts</option>{shifts.map((item) => <option key={item}>{item}</option>)}</select>
        <button type="button" className="secondary" disabled={!canManageBuilders} title={!canManageBuilders ? 'Admin access is required.' : ''} onClick={() => setBuilderDraft({ ...EMPTY_BUILDER })}>Add Builder</button>
        <button type="button" className="secondary" disabled={!canManageCatalog} title={!canManageCatalog ? 'Admin access is required.' : ''} onClick={() => setPathDraft({ ...EMPTY_PATH })}>Add Training Path</button>
        <div className="training-simple-menu-wrap">
          <button type="button" className="secondary" onClick={() => { setShowExport((value) => !value); setShowMore(false) }}>Export ▾</button>
          {showExport ? <div className="training-simple-menu"><button onClick={() => { onExportCsv(); setShowExport(false) }}>CSV</button><button onClick={() => { onExportExcel(); setShowExport(false) }}>Excel</button><button onClick={() => { onExportPdf(); setShowExport(false) }}>PDF</button></div> : null}
        </div>
        <div className="training-simple-menu-wrap">
          <button type="button" className="secondary" onClick={() => { setShowMore((value) => !value); setShowExport(false) }}>More ▾</button>
          {showMore ? <div className="training-simple-menu">
            <button onClick={() => onAdvancedView('dashboard')}>Dashboard</button>
            <button onClick={() => onAdvancedView('coverage')}>Area Coverage</button>
            <button onClick={() => onAdvancedView('builders')}>Builder Profiles</button>
            <button onClick={() => onAdvancedView('history')}>Reports & History</button>
            {canEdit ? <button onClick={onImport}>Import CSV</button> : null}
          </div> : null}
        </div>
      </div>

      {!activeSummaries.length ? <div className="training-simple-empty">
        <strong>No builders available</strong>
        <p>No builders have been added to Training yet.</p>
        <div><button type="button" className="primary" disabled={!canEdit || busy} onClick={syncRoster}>Sync Existing StaffBoard Builders</button><button type="button" className="secondary" disabled={!canManageBuilders} onClick={() => setBuilderDraft({ ...EMPTY_BUILDER })}>Add Builder Manually</button></div>
        <small>Builders added in Builder Management can be synchronized into Training.</small>
      </div> : !visibleSummaries.length ? <div className="training-simple-empty"><strong>No builders match your search</strong><button type="button" className="secondary" onClick={() => { setSearch(''); setShift('') }}>Clear filters</button></div> : !activeCatalog.length ? <div className="training-simple-empty"><strong>No training paths available</strong><p>Add a path to create the first grid column.</p><button type="button" className="primary" disabled={!canManageCatalog} onClick={() => setPathDraft({ ...EMPTY_PATH })}>Add Training Path</button></div> : <div className="training-simple-grid-wrap">
        <table className="training-simple-grid">
          <thead><tr><th className="training-simple-builder-column">Builder</th>{activeCatalog.map((path) => <th key={path.id} title={path.name}>{path.name}</th>)}</tr></thead>
          <tbody>{visibleSummaries.map((summary) => <tr key={summary.builder.id}>
            <th className="training-simple-builder-column"><button type="button" onClick={() => { setTab('builders'); setSearch(summary.builder.name) }}>{summary.builder.name}</button><small>{summary.builder.currentShift || 'Shift not set'}</small></th>
            {activeCatalog.map((path) => {
              const row = rowMaps.get(summary.builder.id)?.get(path.id)
              const result = visibleResult(row)
              return <td key={path.id} className={statusClass(result)}><button type="button" title={`${summary.builder.name} · ${path.name} · ${result}`} onClick={(event) => openCell(event, summary, path)}>{result}</button></td>
            })}
          </tr>)}</tbody>
        </table>
      </div>}
    </> : null}

    {tab === 'builders' ? <div className="training-simple-section">
      <div className="training-simple-section-head"><div><strong>Builders</strong><small>{snapshot.builders.length} Training builder records</small></div><div><button type="button" className="secondary" disabled={!canEdit || busy} onClick={syncRoster}>Sync Builders</button><button type="button" className="primary" disabled={!canManageBuilders} onClick={() => setBuilderDraft({ ...EMPTY_BUILDER })}>Add Builder</button></div></div>
      <div className="training-simple-table-wrap"><table><thead><tr><th>Builder</th><th>Badge ID</th><th>Shift</th><th>Department</th><th>Status</th><th>Actions</th></tr></thead><tbody>{snapshot.builders.map((builder) => <tr key={builder.id}><td><strong>{builder.name}</strong></td><td>{builder.badgeId || '—'}</td><td>{builder.currentShift || '—'}</td><td>{builder.department || '—'}</td><td>{builder.archived ? 'Archived' : builder.currentStatus || 'Active'}</td><td><div className="training-simple-row-actions"><button className="secondary" disabled={!canManageBuilders} onClick={() => setBuilderDraft({ ...builder })}>Edit</button><button className="secondary" onClick={() => { setTab('grid'); setSearch(builder.name) }}>View Training</button><button className="secondary" disabled={!canManageBuilders} onClick={() => toggleBuilderArchive(builder)}>{builder.archived ? 'Restore' : 'Archive'}</button></div></td></tr>)}</tbody></table></div>
    </div> : null}

    {tab === 'paths' ? <div className="training-simple-section">
      <div className="training-simple-section-head"><div><strong>Training Paths</strong><small>New paths immediately become grid columns.</small></div><button type="button" className="primary" disabled={!canManageCatalog} onClick={() => setPathDraft({ ...EMPTY_PATH })}>Add Training Path</button></div>
      <div className="training-simple-table-wrap"><table><thead><tr><th>Training Path</th><th>Category</th><th>Active</th><th>Actions</th></tr></thead><tbody>{snapshot.catalog.map((path, index) => <tr key={path.id}><td><strong>{path.name}</strong></td><td>{path.category || 'Operations'}</td><td>{path.active ? 'Active' : 'Archived'}</td><td><div className="training-simple-row-actions"><button className="secondary" disabled={!canManageCatalog} onClick={() => { setPathDraft({ ...path }); setPathAdvanced(Boolean(path.description || path.expirationDays || path.minimumQualified !== 2)) }}>Edit</button><button className="secondary" disabled={!canManageCatalog || index === 0} onClick={() => movePath(path.id, -1)}>↑</button><button className="secondary" disabled={!canManageCatalog || index === snapshot.catalog.length - 1} onClick={() => movePath(path.id, 1)}>↓</button><button className="secondary" disabled={!canManageCatalog} onClick={() => togglePath(path)}>{path.active ? 'Archive' : 'Restore'}</button></div></td></tr>)}</tbody></table></div>
    </div> : null}

    {cellMenu ? <div className="training-cell-popover" style={{ top: cellMenu.top, left: cellMenu.left }}>
      <strong>{cellMenu.builder.name}</strong><small>{cellMenu.path.name}</small>
      {canEdit ? CELL_OPTIONS.map((option) => <button key={option} className={statusClass(option)} disabled={busy || saving} onClick={() => quickUpdate(option)}>{option}</button>) : <div className="small">View-only access</div>}
      <button className="secondary" onClick={() => openDetails(cellMenu.row)}>Open Details</button>
      <button className="secondary" onClick={() => setCellMenu(null)}>Cancel</button>
    </div> : null}

    {builderDraft ? <Modal title={builderDraft.id ? 'Edit Builder' : 'Add Builder'} onClose={() => setBuilderDraft(null)}><form className="training-simple-form" onSubmit={saveBuilder}>
      <label>Name<input required value={builderDraft.name || ''} onChange={(event) => setBuilderDraft((current) => ({ ...current, name: event.target.value }))} /></label>
      <label>Badge ID<input value={builderDraft.badgeId || ''} onChange={(event) => setBuilderDraft((current) => ({ ...current, badgeId: event.target.value }))} /></label>
      <div className="row two"><label>Shift<input value={builderDraft.currentShift || ''} onChange={(event) => setBuilderDraft((current) => ({ ...current, currentShift: event.target.value }))} /></label><label>Department<input value={builderDraft.department || ''} onChange={(event) => setBuilderDraft((current) => ({ ...current, department: event.target.value }))} /></label></div>
      <label>Hire date<input type="date" value={builderDraft.hireDate || ''} onChange={(event) => setBuilderDraft((current) => ({ ...current, hireDate: event.target.value }))} /></label>
      <button className="primary" disabled={busy}>Save Builder</button>
    </form></Modal> : null}

    {pathDraft ? <Modal title={pathDraft.id ? 'Edit Training Path' : 'Add Training Path'} onClose={() => { setPathDraft(null); setPathAdvanced(false) }}><form className="training-simple-form" onSubmit={savePath}>
      <label>Name<input required value={pathDraft.name || ''} onChange={(event) => setPathDraft((current) => ({ ...current, name: event.target.value }))} /></label>
      <label>Category<input value={pathDraft.category || ''} onChange={(event) => setPathDraft((current) => ({ ...current, category: event.target.value }))} /></label>
      <button type="button" className="secondary" onClick={() => setPathAdvanced((value) => !value)}>{pathAdvanced ? 'Hide more options' : 'More options'}</button>
      {pathAdvanced ? <><label>Description<textarea value={pathDraft.description || ''} onChange={(event) => setPathDraft((current) => ({ ...current, description: event.target.value }))} /></label><div className="row two"><label>Minimum qualified<input type="number" min="0" value={pathDraft.minimumQualified ?? 2} onChange={(event) => setPathDraft((current) => ({ ...current, minimumQualified: event.target.value }))} /></label><label>Expiration days<input type="number" min="1" value={pathDraft.expirationDays || ''} onChange={(event) => setPathDraft((current) => ({ ...current, expirationDays: event.target.value }))} /></label></div></> : null}
      <button className="primary" disabled={busy}>Save Training Path</button>
    </form></Modal> : null}

    {readOnlyDetails ? <Modal title="Qualification Details" onClose={() => setReadOnlyDetails(null)}><dl className="training-readonly-details"><dt>Training area</dt><dd>{readOnlyDetails.trainingName}</dd><dt>Result</dt><dd>{visibleResult(readOnlyDetails)}</dd><dt>Detailed status</dt><dd>{readOnlyDetails.detailedStatus}</dd><dt>Completion date</dt><dd>{readOnlyDetails.completionDate || '—'}</dd><dt>Expiration date</dt><dd>{readOnlyDetails.expirationDate || '—'}</dd><dt>Trainer</dt><dd>{readOnlyDetails.trainerName || '—'}</dd><dt>Notes</dt><dd>{readOnlyDetails.notes || '—'}</dd></dl></Modal> : null}
  </section>
}
