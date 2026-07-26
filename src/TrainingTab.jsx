import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import {
  addTrainingNote,
  archiveTrainingPath,
  createTrainingPath,
  downloadTrainingCsv,
  loadTrainingSnapshot,
  saveQualification,
  saveQualificationsBulk,
  syncTrainingBuilders,
  updateTrainingPath,
} from './trainingClient'
import {
  buildBuilderProfile,
  buildTrainingMetrics,
  filterTrainingBuilders,
  qualificationKey,
  qualificationMap,
  STATUS_META,
  TRAINING_STATUSES,
} from './trainingCore'

const EMPTY_SNAPSHOT = {
  builders: [], catalog: [], qualifications: [], history: [], notes: [],
  permissions: { canView: true, canEditQualifications: false, canManageCatalog: false },
}

const EMPTY_QUALIFICATION = {
  builderId: '', trainingId: '', status: 'Not Started', completionDate: '', expirationDate: '',
  trainerBuilderId: '', trainerName: '', notes: '', certificateNumber: '', certificateFileUrl: '', assessmentScore: '', reason: '',
}

const clean = (value) => String(value ?? '').trim()

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1 } else quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(field); field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(field); field = ''
      if (row.some((value) => clean(value))) rows.push(row)
      row = []
    } else field += char
  }
  row.push(field)
  if (row.some((value) => clean(value))) rows.push(row)
  if (!rows.length) return []
  const headers = rows[0].map((value) => clean(value).toLowerCase())
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, clean(values[index])])) )
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META['Not Started']
  return <span className={`training-status ${meta.className}`}>{meta.icon} {status}</span>
}

function MetricCard({ label, value, note }) {
  return <div className="summary-card training-metric-card"><div className="summary-label">{label}</div><div className="summary-value">{value}</div>{note ? <div className="small">{note}</div> : null}</div>
}

export default function TrainingTab({ builders = [], currentUser = '', currentShift = '' }) {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [view, setView] = useState('dashboard')
  const [filters, setFilters] = useState({ search: '', status: '', shift: '', trainingId: '' })
  const [selectedBuilderId, setSelectedBuilderId] = useState('')
  const [qualificationDraft, setQualificationDraft] = useState(null)
  const [catalogDraft, setCatalogDraft] = useState({ name: '', category: 'Operations', description: '', minimumQualified: 2, expirationDays: '' })
  const [bulk, setBulk] = useState({ builderIds: [], trainingId: '', status: 'Qualified', completionDate: '', expirationDate: '', trainerName: '', reason: '' })
  const [noteDraft, setNoteDraft] = useState('')
  const importRef = useRef(null)

  const rosterSignature = useMemo(() => JSON.stringify(builders.map((builder) => [builder.id, builder.name, builder.badgeId || '', builder.hireDate || ''])), [builders])

  async function refresh({ syncRoster = false } = {}) {
    setLoading(true)
    setError('')
    try {
      let loaded = await loadTrainingSnapshot()
      if (syncRoster && loaded.permissions?.canEditQualifications && builders.length) {
        await syncTrainingBuilders(builders.map((builder) => ({
          id: builder.id,
          name: builder.name,
          badgeId: builder.badgeId || builder.badgeNumber || '',
          hireDate: builder.hireDate || '',
          currentStatus: builder.status || 'Active',
          currentShift: builder.currentShift || builder.shift || currentShift || '',
          department: builder.department || '',
        })))
        loaded = await loadTrainingSnapshot()
      }
      setSnapshot({ ...EMPTY_SNAPSHOT, ...loaded })
    } catch (requestError) {
      setError(requestError.message || 'Failed to load Training data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh({ syncRoster: true }) }, [rosterSignature])

  const activeCatalog = useMemo(() => snapshot.catalog.filter((path) => path.active), [snapshot.catalog])
  const activeBuilders = useMemo(() => snapshot.builders.filter((builder) => !builder.archived), [snapshot.builders])
  const metrics = useMemo(() => buildTrainingMetrics(snapshot), [snapshot])
  const qualificationsByKey = useMemo(() => qualificationMap(snapshot.qualifications), [snapshot.qualifications])
  const visibleBuilders = useMemo(
    () => filterTrainingBuilders(activeBuilders, snapshot.qualifications, activeCatalog, filters),
    [activeBuilders, snapshot.qualifications, activeCatalog, filters],
  )
  const selectedBuilder = activeBuilders.find((builder) => builder.id === selectedBuilderId) || null
  const selectedProfile = selectedBuilder ? buildBuilderProfile(selectedBuilder, snapshot) : null
  const builderById = useMemo(() => new Map(snapshot.builders.map((builder) => [builder.id, builder])), [snapshot.builders])
  const pathById = useMemo(() => new Map(snapshot.catalog.map((path) => [path.id, path])), [snapshot.catalog])
  const shifts = useMemo(() => [...new Set(activeBuilders.map((builder) => builder.currentShift).filter(Boolean))].sort(), [activeBuilders])

  function notify(text) {
    setMessage(text)
    setTimeout(() => setMessage(''), 3000)
  }

  function openQualification(builderId, trainingId) {
    if (!snapshot.permissions.canEditQualifications) return
    const existing = qualificationsByKey.get(qualificationKey(builderId, trainingId))
    const trainer = existing?.trainerBuilderId ? builderById.get(existing.trainerBuilderId) : null
    setQualificationDraft({
      ...EMPTY_QUALIFICATION,
      ...existing,
      builderId,
      trainingId,
      trainerName: existing?.trainerName || trainer?.name || '',
      assessmentScore: existing?.assessmentScore ?? '',
      reason: '',
    })
  }

  async function submitQualification(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await saveQualification(qualificationDraft)
      setQualificationDraft(null)
      await refresh()
      notify('Qualification saved and added to Training history.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function submitCatalog(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await createTrainingPath(catalogDraft)
      setCatalogDraft({ name: '', category: 'Operations', description: '', minimumQualified: 2, expirationDays: '' })
      await refresh()
      notify('Training path added to the catalog.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function changeCatalogPath(path, updates) {
    setSaving(true)
    setError('')
    try {
      await updateTrainingPath(path.id, updates)
      await refresh()
      notify('Training path updated.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function archivePath(path) {
    if (!window.confirm(`Archive ${path.name}? Existing qualification history will be preserved.`)) return
    setSaving(true)
    try {
      await archiveTrainingPath(path.id)
      await refresh()
      notify('Training path archived.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  function toggleBulkBuilder(builderId) {
    setBulk((previous) => ({
      ...previous,
      builderIds: previous.builderIds.includes(builderId)
        ? previous.builderIds.filter((id) => id !== builderId)
        : [...previous.builderIds, builderId],
    }))
  }

  async function submitBulk(event) {
    event.preventDefault()
    if (!bulk.builderIds.length || !bulk.trainingId) {
      setError('Select at least one builder and one training path.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const items = bulk.builderIds.map((builderId) => ({
        builderId,
        trainingId: bulk.trainingId,
        status: bulk.status,
        completionDate: bulk.completionDate,
        expirationDate: bulk.expirationDate,
        trainerName: bulk.trainerName,
        reason: bulk.reason || 'Bulk Training update',
      }))
      await saveQualificationsBulk(items)
      setBulk((previous) => ({ ...previous, builderIds: [] }))
      await refresh()
      notify(`${items.length} builder qualification${items.length === 1 ? '' : 's'} updated.`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function submitNote(event) {
    event.preventDefault()
    if (!selectedBuilder || !clean(noteDraft)) return
    setSaving(true)
    try {
      await addTrainingNote({ builderId: selectedBuilder.id, note: noteDraft })
      setNoteDraft('')
      await refresh()
      notify('Training note added.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function importCsv(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setSaving(true)
    setError('')
    try {
      const rows = parseCsv(await file.text())
      const buildersByName = new Map(activeBuilders.map((builder) => [builder.name.toLowerCase(), builder]))
      const catalogByName = new Map(activeCatalog.map((path) => [path.name.toLowerCase(), path]))
      const items = []
      const errors = []
      rows.forEach((row, index) => {
        const builder = activeBuilders.find((item) => item.id === row['builder id']) || buildersByName.get((row.builder || '').toLowerCase())
        const path = activeCatalog.find((item) => item.id === row['training id']) || catalogByName.get((row['training path'] || row.training || '').toLowerCase())
        if (!builder || !path) {
          errors.push(`Row ${index + 2}: builder or training path could not be matched.`)
          return
        }
        items.push({
          builderId: builder.id,
          trainingId: path.id,
          status: TRAINING_STATUSES.includes(row.status) ? row.status : 'Qualified',
          completionDate: row['completion date'] || '',
          expirationDate: row['expiration date'] || '',
          trainerName: row.trainer || '',
          certificateNumber: row['certificate number'] || '',
          assessmentScore: row['assessment score'] || '',
          notes: row.notes || '',
          reason: 'CSV import',
        })
      })
      if (!items.length) throw new Error(errors.join(' ') || 'No valid CSV rows were found.')
      await saveQualificationsBulk(items)
      await refresh()
      notify(`Imported ${items.length} qualification rows.${errors.length ? ` ${errors.length} rows were skipped.` : ''}`)
      if (errors.length) setError(errors.slice(0, 5).join(' '))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  function exportExcel() {
    const qualificationRows = snapshot.qualifications.map((item) => ({
      Builder: builderById.get(item.builderId)?.name || item.builderId,
      'Builder ID': item.builderId,
      'Training Path': pathById.get(item.trainingId)?.name || item.trainingId,
      Status: item.status,
      'Completion Date': item.completionDate,
      'Expiration Date': item.expirationDate,
      Trainer: item.trainerName,
      'Certificate Number': item.certificateNumber,
      'Assessment Score': item.assessmentScore ?? '',
      Notes: item.notes,
      'Updated By': item.updatedBy,
      'Updated At': item.updatedAt,
    }))
    const coverageRows = metrics.coverage.map((row) => ({
      'Training Path': row.name,
      Category: row.category,
      Qualified: row.qualified,
      'In Training': row.inTraining,
      Trainers: row.trainers,
      Minimum: row.minimum,
      'Coverage %': row.coveragePct,
      Risk: row.risk,
      'Suggested Builders': row.suggestedBuilders.join(', '),
    }))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(qualificationRows), 'Qualifications')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(coverageRows), 'Area Coverage')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(snapshot.history), 'History')
    XLSX.writeFile(workbook, `staffboard-training-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function exportPdf() {
    const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })
    document.setFontSize(18)
    document.text('StaffBoard Training & Qualifications', 36, 42)
    document.setFontSize(10)
    document.text(`Generated ${new Date().toLocaleString()} by ${currentUser || 'StaffBoard'}`, 36, 60)
    document.text(`Builders: ${metrics.totalBuilders}   Qualified: ${metrics.qualifiedPct}%   Cross-trained: ${metrics.crossTrainedPct}%   Average qualifications: ${metrics.averageQualifications}`, 36, 80)
    let y = 110
    document.setFontSize(12)
    document.text('Area Coverage', 36, y)
    y += 18
    document.setFontSize(9)
    metrics.coverage.forEach((row) => {
      if (y > 560) { document.addPage(); y = 40 }
      document.text(`${row.name}: ${row.qualified} qualified, ${row.inTraining} in training, ${row.trainers} trainers, minimum ${row.minimum} — ${row.risk}`, 42, y)
      y += 14
    })
    document.save(`staffboard-training-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  const toolbar = <>
    <div className="training-view-tabs">
      {[
        ['dashboard', 'Dashboard'], ['matrix', 'Training Matrix'], ['builders', 'Builder Profiles'],
        ['coverage', 'Area Coverage'], ['catalog', 'Training Catalog'], ['history', 'History'],
      ].map(([id, label]) => <button key={id} className={view === id ? 'primary' : 'secondary'} onClick={() => setView(id)}>{label}</button>)}
    </div>
    <div className="training-actions">
      <button className="secondary" onClick={() => refresh({ syncRoster: true })} disabled={loading || saving}>Refresh & Sync Builders</button>
      <button className="secondary" onClick={downloadTrainingCsv}>Export CSV</button>
      <button className="secondary" onClick={exportExcel}>Export Excel</button>
      <button className="secondary" onClick={exportPdf}>Export PDF</button>
      {snapshot.permissions.canEditQualifications ? <button className="secondary" onClick={() => importRef.current?.click()}>Import CSV</button> : null}
      <input ref={importRef} className="training-hidden-input" type="file" accept=".csv,text/csv" onChange={importCsv} />
    </div>
  </>

  return <div className="board-shell training-shell">
    <div className="board-header training-header">
      <div>
        <div className="title">Builder Training & Qualifications</div>
        <div className="small">Track qualifications, cross-training, trainers, expirations, certifications, coverage risk, and recommended next paths.</div>
      </div>
      <div className="chiprow"><span className="pill">Normalized PostgreSQL</span><span className="pill">Updated by {currentUser || 'StaffBoard'}</span></div>
    </div>

    {toolbar}
    {message ? <div className="training-message training-message-success">{message}</div> : null}
    {error ? <div className="training-message training-message-error">{error}</div> : null}
    {loading ? <div className="card training-loading">Loading Training records…</div> : null}

    {!loading && view === 'dashboard' ? <>
      <div className="summary-grid training-summary-grid">
        <MetricCard label="Total Builders" value={metrics.totalBuilders} />
        <MetricCard label="Qualified Builders" value={`${metrics.qualifiedPct}%`} note={`${metrics.qualifiedBuilderCount} builders`} />
        <MetricCard label="Cross-Trained" value={`${metrics.crossTrainedPct}%`} note={`${metrics.crossTrainedBuilderCount} builders`} />
        <MetricCard label="Average Qualifications" value={metrics.averageQualifications} />
        <MetricCard label="Missing Coverage" value={metrics.missingCoverage.length} />
        <MetricCard label="Single-Person Coverage" value={metrics.singleCoverage.length} />
        <MetricCard label="Expiring in 30 Days" value={metrics.expiring.length} />
        <MetricCard label="Expired / Overdue" value={metrics.expired.length} />
      </div>
      <div className="training-two-column">
        <div className="card"><div className="table-title-row"><div><div className="table-kicker">Training Coverage Risk</div><div className="small">Paths with no coverage, below-minimum coverage, or no backup.</div></div></div>
          <div className="training-list">{metrics.lowCoverage.length ? metrics.lowCoverage.map((row) => <button className="training-risk-row" key={row.trainingId} onClick={() => { setFilters((previous) => ({ ...previous, trainingId: row.trainingId })); setView('matrix') }}><span><strong>{row.name}</strong><small>{row.qualified} qualified · minimum {row.minimum}</small></span><span className={`training-risk training-risk-${row.risk.toLowerCase().replace(/\s+/g, '-')}`}>{row.risk}</span></button>) : <div className="small status-good">Every active training path meets its configured coverage target.</div>}</div>
        </div>
        <div className="card"><div className="table-kicker">Top Trainers</div><div className="training-list">{metrics.topTrainers.length ? metrics.topTrainers.map((trainer) => <div className="training-list-row" key={trainer.name}><strong>{trainer.name}</strong><span>{trainer.completions} recorded qualification{trainer.completions === 1 ? '' : 's'}</span></div>) : <div className="small">No trainer activity recorded yet.</div>}</div></div>
      </div>
      <div className="training-two-column">
        <div className="card"><div className="table-kicker">Expiring Certifications</div><div className="training-list">{metrics.expiring.length ? metrics.expiring.slice(0, 12).map((item) => <button className="training-list-row button-row" key={qualificationKey(item.builderId, item.trainingId)} onClick={() => setSelectedBuilderId(item.builderId)}><strong>{builderById.get(item.builderId)?.name || item.builderId}</strong><span>{pathById.get(item.trainingId)?.name || item.trainingId} · {item.daysRemaining} days</span></button>) : <div className="small status-good">No qualifications expire in the next 30 days.</div>}</div></div>
        <div className="card"><div className="table-kicker">Recently Completed</div><div className="training-list">{metrics.recentlyCompleted.length ? metrics.recentlyCompleted.map((item) => <button className="training-list-row button-row" key={qualificationKey(item.builderId, item.trainingId)} onClick={() => setSelectedBuilderId(item.builderId)}><strong>{builderById.get(item.builderId)?.name || item.builderId}</strong><span>{pathById.get(item.trainingId)?.name || item.trainingId} · {item.completionDate}</span></button>) : <div className="small">No completion dates have been recorded yet.</div>}</div></div>
      </div>
    </> : null}

    {!loading && ['matrix', 'builders'].includes(view) ? <>
      <div className="card training-filter-card">
        <input value={filters.search} onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))} placeholder="Search builder, badge, trainer, department, or training path…" />
        <select value={filters.shift} onChange={(event) => setFilters((previous) => ({ ...previous, shift: event.target.value }))}><option value="">All shifts</option>{shifts.map((shift) => <option key={shift}>{shift}</option>)}</select>
        <select value={filters.status} onChange={(event) => setFilters((previous) => ({ ...previous, status: event.target.value }))}><option value="">All statuses</option>{TRAINING_STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
        <select value={filters.trainingId} onChange={(event) => setFilters((previous) => ({ ...previous, trainingId: event.target.value }))}><option value="">All training paths</option>{activeCatalog.map((path) => <option value={path.id} key={path.id}>{path.name}</option>)}</select>
      </div>
      {view === 'matrix' ? <div className="training-matrix-wrap"><table className="training-matrix"><thead><tr><th className="training-builder-column">Builder</th>{activeCatalog.map((path) => <th key={path.id} title={path.description || path.category}>{path.name}</th>)}</tr></thead><tbody>{visibleBuilders.map((builder) => <tr key={builder.id}><th className="training-builder-column"><button className="training-builder-link" onClick={() => setSelectedBuilderId(builder.id)}>{builder.name}</button><small>{builder.currentShift || 'Shift not set'}</small></th>{activeCatalog.map((path) => { const item = qualificationsByKey.get(qualificationKey(builder.id, path.id)); const status = item?.status || 'Not Started'; const meta = STATUS_META[status] || STATUS_META['Not Started']; const tooltip = [status, item?.completionDate ? `Completed: ${item.completionDate}` : '', item?.expirationDate ? `Expires: ${item.expirationDate}` : '', item?.trainerName ? `Trainer: ${item.trainerName}` : '', item?.notes].filter(Boolean).join('\n'); return <td key={path.id}><button disabled={!snapshot.permissions.canEditQualifications} className={`training-matrix-cell ${meta.className}`} title={tooltip || `${builder.name} · ${path.name} · Not Started`} onClick={() => openQualification(builder.id, path.id)}><span>{meta.icon}</span><small>{status}</small></button></td> })}</tr>)}</tbody></table></div> : <div className="training-builder-grid">{visibleBuilders.map((builder) => { const profile = buildBuilderProfile(builder, snapshot); return <button className="card training-builder-card" key={builder.id} onClick={() => setSelectedBuilderId(builder.id)}><div className="training-builder-card-head"><strong>{builder.name}</strong><span>{profile.currentQualifications.length} current</span></div><div className="small">{builder.badgeId || 'No badge ID'} · {builder.currentShift || 'Shift not set'}</div><div className="training-qualification-chips">{profile.currentQualifications.slice(0, 5).map((item) => <span key={item.trainingId}>{item.trainingName}</span>)}{profile.currentQualifications.length > 5 ? <span>+{profile.currentQualifications.length - 5}</span> : null}</div></button> })}</div>}
    </> : null}

    {!loading && view === 'coverage' ? <div className="table-wrap training-coverage-table"><table><thead><tr><th>Training Path</th><th>Category</th><th>Qualified</th><th>In Training</th><th>Trainers</th><th>Minimum</th><th>Coverage</th><th>Risk</th><th>Suggested Next Builders</th></tr></thead><tbody>{metrics.coverage.map((row) => <tr key={row.trainingId}><td><strong>{row.name}</strong></td><td>{row.category}</td><td>{row.qualified}</td><td>{row.inTraining}</td><td>{row.trainers}</td><td>{row.minimum}</td><td>{row.coveragePct}%</td><td><span className={`training-risk training-risk-${row.risk.toLowerCase().replace(/\s+/g, '-')}`}>{row.risk}</span></td><td>{row.suggestedBuilders.join(', ') || '—'}</td></tr>)}</tbody></table></div> : null}

    {!loading && view === 'catalog' ? <div className="training-two-column training-catalog-layout">
      <div className="card"><div className="table-kicker">Training Catalog</div><div className="small">Training paths are data-driven and may be added without changing application code.</div><div className="training-catalog-list">{snapshot.catalog.map((path) => <div className={`training-catalog-row ${path.active ? '' : 'training-path-archived'}`} key={path.id}><div><strong>{path.name}</strong><small>{path.category} · minimum {path.minimumQualified}{path.expirationDays ? ` · renew every ${path.expirationDays} days` : ''}</small><small>{path.description || 'No description'}</small></div>{snapshot.permissions.canManageCatalog ? <div className="training-inline-actions"><button className="secondary" onClick={() => changeCatalogPath(path, { active: !path.active })}>{path.active ? 'Archive' : 'Restore'}</button>{path.active ? <button className="danger" onClick={() => archivePath(path)}>Archive</button> : null}</div> : null}</div>)}</div></div>
      <form className="card training-form" onSubmit={submitCatalog}><div className="table-kicker">Add Training Path</div>{snapshot.permissions.canManageCatalog ? <><label>Name<input required value={catalogDraft.name} onChange={(event) => setCatalogDraft((previous) => ({ ...previous, name: event.target.value }))} /></label><label>Category<input value={catalogDraft.category} onChange={(event) => setCatalogDraft((previous) => ({ ...previous, category: event.target.value }))} /></label><label>Description<textarea value={catalogDraft.description} onChange={(event) => setCatalogDraft((previous) => ({ ...previous, description: event.target.value }))} /></label><div className="row two"><label>Minimum qualified<input type="number" min="0" value={catalogDraft.minimumQualified} onChange={(event) => setCatalogDraft((previous) => ({ ...previous, minimumQualified: event.target.value }))} /></label><label>Expiration days<input type="number" min="1" placeholder="Optional" value={catalogDraft.expirationDays} onChange={(event) => setCatalogDraft((previous) => ({ ...previous, expirationDays: event.target.value }))} /></label></div><button className="primary" disabled={saving}>Add Training Path</button></> : <div className="small">Only admins can manage the Training Catalog.</div>}</form>
    </div> : null}

    {!loading && view === 'history' ? <div className="table-wrap training-history-table"><table><thead><tr><th>When</th><th>Builder</th><th>Training</th><th>Action</th><th>Old Status</th><th>New Status</th><th>Changed By</th><th>Reason</th></tr></thead><tbody>{snapshot.history.map((item) => <tr key={item.id}><td>{new Date(item.changedAt).toLocaleString()}</td><td>{item.builderName}</td><td>{item.trainingName || '—'}</td><td>{item.action}</td><td>{item.oldStatus || '—'}</td><td>{item.newStatus || '—'}</td><td>{item.changedBy}</td><td>{item.reason || '—'}</td></tr>)}</tbody></table></div> : null}

    {!loading && snapshot.permissions.canEditQualifications && ['matrix', 'builders'].includes(view) ? <form className="card training-bulk-card" onSubmit={submitBulk}><div className="table-title-row"><div><div className="table-kicker">Bulk Qualification Update</div><div className="small">Select builders below, then apply one training status transactionally.</div></div><strong>{bulk.builderIds.length} selected</strong></div><div className="training-bulk-selectors"><select required value={bulk.trainingId} onChange={(event) => setBulk((previous) => ({ ...previous, trainingId: event.target.value }))}><option value="">Training path</option>{activeCatalog.map((path) => <option value={path.id} key={path.id}>{path.name}</option>)}</select><select value={bulk.status} onChange={(event) => setBulk((previous) => ({ ...previous, status: event.target.value }))}>{TRAINING_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><input type="date" value={bulk.completionDate} onChange={(event) => setBulk((previous) => ({ ...previous, completionDate: event.target.value }))} /><input type="date" value={bulk.expirationDate} onChange={(event) => setBulk((previous) => ({ ...previous, expirationDate: event.target.value }))} /><input placeholder="Trainer" value={bulk.trainerName} onChange={(event) => setBulk((previous) => ({ ...previous, trainerName: event.target.value }))} /><input placeholder="Reason" value={bulk.reason} onChange={(event) => setBulk((previous) => ({ ...previous, reason: event.target.value }))} /><button className="primary" disabled={saving}>Apply</button></div><div className="training-bulk-builder-list">{visibleBuilders.map((builder) => <label key={builder.id}><input type="checkbox" checked={bulk.builderIds.includes(builder.id)} onChange={() => toggleBulkBuilder(builder.id)} /> {builder.name}</label>)}</div></form> : null}

    {qualificationDraft ? <div className="training-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setQualificationDraft(null) }}><form className="training-modal training-form" onSubmit={submitQualification}><div className="table-title-row"><div><div className="table-kicker">Update Qualification</div><strong>{builderById.get(qualificationDraft.builderId)?.name} · {pathById.get(qualificationDraft.trainingId)?.name}</strong></div><button type="button" className="secondary mini-btn" onClick={() => setQualificationDraft(null)}>Close</button></div><label>Status<select value={qualificationDraft.status} onChange={(event) => setQualificationDraft((previous) => ({ ...previous, status: event.target.value }))}>{TRAINING_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label><div className="row two"><label>Completion date<input type="date" value={qualificationDraft.completionDate || ''} onChange={(event) => setQualificationDraft((previous) => ({ ...previous, completionDate: event.target.value }))} /></label><label>Expiration date<input type="date" value={qualificationDraft.expirationDate || ''} onChange={(event) => setQualificationDraft((previous) => ({ ...previous, expirationDate: event.target.value }))} /></label></div><label>Trainer<select value={qualificationDraft.trainerBuilderId || ''} onChange={(event) => { const trainer = builderById.get(event.target.value); setQualificationDraft((previous) => ({ ...previous, trainerBuilderId: event.target.value, trainerName: trainer?.name || '' })) }}><option value="">Select trainer or enter below</option>{activeBuilders.map((builder) => <option value={builder.id} key={builder.id}>{builder.name}</option>)}</select></label><label>Trainer name<input value={qualificationDraft.trainerName || ''} onChange={(event) => setQualificationDraft((previous) => ({ ...previous, trainerName: event.target.value }))} /></label><div className="row two"><label>Certificate number<input value={qualificationDraft.certificateNumber || ''} onChange={(event) => setQualificationDraft((previous) => ({ ...previous, certificateNumber: event.target.value }))} /></label><label>Assessment score<input type="number" step="0.01" value={qualificationDraft.assessmentScore ?? ''} onChange={(event) => setQualificationDraft((previous) => ({ ...previous, assessmentScore: event.target.value }))} /></label></div><label>Notes<textarea value={qualificationDraft.notes || ''} onChange={(event) => setQualificationDraft((previous) => ({ ...previous, notes: event.target.value }))} /></label><label>Change reason<input value={qualificationDraft.reason || ''} onChange={(event) => setQualificationDraft((previous) => ({ ...previous, reason: event.target.value }))} placeholder="Why was this qualification changed?" /></label><button className="primary" disabled={saving}>Save Qualification</button></form></div> : null}

    {selectedProfile ? <div className="training-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedBuilderId('') }}><div className="training-modal training-profile-modal"><div className="table-title-row"><div><div className="table-kicker">Builder Training Profile</div><div className="title training-profile-title">{selectedProfile.builder.name}</div><div className="small">{selectedProfile.builder.badgeId || 'No badge ID'} · {selectedProfile.builder.currentShift || 'Shift not set'} · {selectedProfile.builder.department || 'Department not set'}</div></div><button className="secondary mini-btn" onClick={() => setSelectedBuilderId('')}>Close</button></div><div className="summary-grid"><MetricCard label="Current Qualifications" value={selectedProfile.currentQualifications.length} /><MetricCard label="Expiring" value={selectedProfile.expiring.length} /><MetricCard label="History Events" value={selectedProfile.history.length} /><MetricCard label="Notes" value={selectedProfile.notes.length} /></div><div className="table-wrap training-profile-table"><table><thead><tr><th>Training</th><th>Status</th><th>Completed</th><th>Expires</th><th>Trainer</th><th>Certificate</th><th>Notes</th></tr></thead><tbody>{selectedProfile.qualifications.length ? selectedProfile.qualifications.map((item) => <tr key={item.trainingId} onDoubleClick={() => openQualification(selectedProfile.builder.id, item.trainingId)}><td>{item.trainingName}</td><td><StatusBadge status={item.status} /></td><td>{item.completionDate || '—'}</td><td>{item.expirationDate || '—'}</td><td>{item.trainerName || '—'}</td><td>{item.certificateNumber || '—'}</td><td>{item.notes || '—'}</td></tr>) : <tr><td colSpan="7">No training records yet.</td></tr>}</tbody></table></div>{snapshot.permissions.canEditQualifications ? <form className="training-note-form" onSubmit={submitNote}><textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Add a builder-level training note…" /><button className="primary" disabled={saving || !clean(noteDraft)}>Add Note</button></form> : null}<div className="training-two-column"><div className="card"><div className="table-kicker">Training Notes</div><div className="training-list">{selectedProfile.notes.map((note) => <div className="training-list-row" key={note.id}><span>{note.note}</span><small>{note.createdBy} · {new Date(note.createdAt).toLocaleString()}</small></div>)}</div></div><div className="card"><div className="table-kicker">Timeline</div><div className="training-list">{selectedProfile.history.slice(0, 20).map((item) => <div className="training-list-row" key={item.id}><strong>{item.trainingName || item.action}</strong><span>{item.oldStatus || '—'} → {item.newStatus || '—'}</span><small>{item.changedBy} · {new Date(item.changedAt).toLocaleString()}</small></div>)}</div></div></div></div></div> : null}
  </div>
}
