import React, { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import {
  buildAllBuilderSkillSummaries,
  buildQuickQualificationDraft,
  filterAndSortBuilderSummaries,
  filterBuilderSkillRows,
  groupBuilderSkillRows,
  requiresUntrainConfirmation,
  SIMPLE_RESULT_META,
  SKILL_RESULT_FILTERS,
} from './builderSkillsCore'
import { qualificationKey } from './trainingCore'

const clean = (value) => String(value ?? '').trim()

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function ResultBadge({ result }) {
  const meta = SIMPLE_RESULT_META[result] || SIMPLE_RESULT_META['Not Trained']
  return <span className={`training-result-badge ${meta.className}`}><span>{meta.icon}</span>{result}</span>
}

function SkillChips({ label, names, tone = '' }) {
  return <div className={`builder-skills-chip-line ${tone}`}><strong>{label}</strong><div>{names.length ? names.map((name) => <span key={name}>{name}</span>) : <em>None</em>}</div></div>
}

function builderExportRows(summaries) {
  return summaries.flatMap((summary) => summary.rows.map((row) => ({
    Builder: summary.builder.name,
    'Builder ID': summary.builder.id,
    'Badge ID': summary.builder.badgeId || '',
    Shift: summary.builder.currentShift || '',
    Department: summary.builder.department || '',
    'Training Area': row.trainingName,
    Category: row.category,
    'Simplified Result': row.result,
    'Detailed Status': row.detailedStatus,
    'Completion Date': row.completionDate,
    'Expiration Date': row.expirationDate,
    Trainer: row.trainerName,
    Notes: row.notes,
  })))
}

export default function BuilderSkillsView({
  snapshot,
  qualificationsByKey,
  selectedBuilderId,
  setSelectedBuilderId,
  openQualification,
  saveQuickQualification,
  saving,
  currentUser,
}) {
  const [mode, setMode] = useState('single')
  const [controls, setControls] = useState({ search: '', shift: '', department: '', archive: 'active', sort: 'name' })
  const [resultFilter, setResultFilter] = useState('all')
  const [skillSearch, setSkillSearch] = useState('')
  const [groupByCategory, setGroupByCategory] = useState(true)
  const [showInactivePaths, setShowInactivePaths] = useState(false)

  const allSummaries = useMemo(
    () => buildAllBuilderSkillSummaries(snapshot, { includeArchived: true, includeInactive: showInactivePaths, qualificationsByKey }),
    [snapshot, showInactivePaths, qualificationsByKey],
  )

  const archiveFiltered = useMemo(() => allSummaries.filter((summary) => {
    if (controls.archive === 'archived') return Boolean(summary.builder.archived)
    if (controls.archive === 'all') return true
    return !summary.builder.archived
  }), [allSummaries, controls.archive])

  const visibleSummaries = useMemo(
    () => filterAndSortBuilderSummaries(archiveFiltered, controls),
    [archiveFiltered, controls],
  )

  const shifts = useMemo(() => [...new Set(snapshot.builders.map((builder) => builder.currentShift).filter(Boolean))].sort(), [snapshot.builders])
  const departments = useMemo(() => [...new Set(snapshot.builders.map((builder) => builder.department).filter(Boolean))].sort(), [snapshot.builders])

  useEffect(() => {
    if (!visibleSummaries.length) {
      if (selectedBuilderId) setSelectedBuilderId('')
      return
    }
    if (!visibleSummaries.some((summary) => summary.builder.id === selectedBuilderId)) setSelectedBuilderId(visibleSummaries[0].builder.id)
  }, [visibleSummaries, selectedBuilderId, setSelectedBuilderId])

  const selectedIndex = visibleSummaries.findIndex((summary) => summary.builder.id === selectedBuilderId)
  const selectedSummary = selectedIndex >= 0 ? visibleSummaries[selectedIndex] : visibleSummaries[0] || null
  const selectedRows = useMemo(
    () => selectedSummary ? filterBuilderSkillRows(selectedSummary.rows, resultFilter, skillSearch) : [],
    [selectedSummary, resultFilter, skillSearch],
  )
  const groupedRows = useMemo(
    () => groupByCategory ? groupBuilderSkillRows(selectedRows) : [{ category: '', items: selectedRows }],
    [selectedRows, groupByCategory],
  )

  function moveBuilder(direction) {
    if (!visibleSummaries.length) return
    const nextIndex = selectedIndex < 0 ? 0 : (selectedIndex + direction + visibleSummaries.length) % visibleSummaries.length
    setSelectedBuilderId(visibleSummaries[nextIndex].builder.id)
  }

  function prepareStatus(row, status) {
    const existing = qualificationsByKey.get(qualificationKey(row.builderId, row.trainingId))
    openQualification(row.builderId, row.trainingId, buildQuickQualificationDraft(existing, row.builderId, row.trainingId, status))
  }

  async function markNotTrained(row) {
    const existing = qualificationsByKey.get(qualificationKey(row.builderId, row.trainingId))
    if (requiresUntrainConfirmation(existing) && !window.confirm(`Mark ${row.trainingName} as Not Trained? The existing ${existing.status} record will remain in audit history.`)) return
    const draft = buildQuickQualificationDraft(existing, row.builderId, row.trainingId, 'Not Started')
    await saveQuickQualification({
      ...draft,
      completionDate: '',
      expirationDate: '',
      reason: 'Quick action: Mark Not Trained',
    }, `${row.trainingName} marked Not Trained.`)
  }

  function exportCsv() {
    const rows = builderExportRows(visibleSummaries)
    const headers = Object.keys(rows[0] || {
      Builder: '', 'Builder ID': '', 'Badge ID': '', Shift: '', Department: '', 'Training Area': '', Category: '',
      'Simplified Result': '', 'Detailed Status': '', 'Completion Date': '', 'Expiration Date': '', Trainer: '', Notes: '',
    })
    const csv = [headers.join(','), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))].join('\n')
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `staffboard-builder-training-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  function exportExcel() {
    const rows = builderExportRows(visibleSummaries)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Builder Training Summary')
    const compact = visibleSummaries.map((summary) => ({
      Builder: summary.builder.name,
      'Badge ID': summary.builder.badgeId || '',
      Shift: summary.builder.currentShift || '',
      Department: summary.builder.department || '',
      Trained: summary.trainedNames.join(', '),
      'In Training': summary.inTrainingNames.join(', '),
      Trainer: summary.trainerNames.join(', '),
      'Not Trained': summary.notTrainedNames.join(', '),
      Expired: summary.expiredNames.join(', '),
    }))
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(compact), 'Compact Summary')
    XLSX.writeFile(workbook, `staffboard-builder-training-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function exportProfilePdf() {
    if (!selectedSummary) return
    const { builder, rows, counts } = selectedSummary
    const document = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
    const pageWidth = document.internal.pageSize.getWidth()
    const pageHeight = document.internal.pageSize.getHeight()
    const margin = 42
    const contentWidth = pageWidth - margin * 2
    let y = margin

    const ensureSpace = (height = 30) => {
      if (y + height <= pageHeight - margin) return
      document.addPage()
      y = margin
    }
    const writeText = (text, size = 9, indent = 0) => {
      document.setFontSize(size)
      const lines = document.splitTextToSize(String(text || '—'), contentWidth - indent)
      ensureSpace(lines.length * (size + 3) + 5)
      document.text(lines, margin + indent, y)
      y += lines.length * (size + 3) + 5
    }
    const writeSection = (title, items) => {
      ensureSpace(32)
      document.setFontSize(12)
      document.text(title, margin, y)
      y += 17
      if (!items.length) writeText('None', 9, 8)
      items.forEach((item) => writeText(`• ${item.trainingName} — ${item.result} (${item.detailedStatus})${item.completionDate ? `, completed ${item.completionDate}` : ''}${item.expirationDate ? `, expires ${item.expirationDate}` : ''}${item.trainerName ? `, trainer ${item.trainerName}` : ''}`, 9, 8))
    }

    document.setFontSize(18)
    document.text('StaffBoard Builder Training Profile', margin, y)
    y += 25
    writeText(`${builder.name} · Badge ${builder.badgeId || 'not set'} · ${builder.currentShift || 'Shift not set'} · ${builder.department || 'Department not set'}`, 10)
    writeText(`Status: ${builder.currentStatus || 'Active'} · Hire date: ${builder.hireDate || 'Not set'} · Generated by ${currentUser || 'StaffBoard'} on ${new Date().toLocaleString()}`, 9)
    writeText(`Trained in ${counts.Trained} of ${counts.all} areas; ${counts['In Training']} in training; trainer in ${counts.Trainer}; ${counts['Not Trained']} not trained; ${counts.Expired} expired.`, 10)
    writeSection('Trained Areas', rows.filter((row) => row.result === 'Trained'))
    writeSection('Trainer Areas', rows.filter((row) => row.result === 'Trainer'))
    writeSection('In Training', rows.filter((row) => row.result === 'In Training'))
    writeSection('Not Trained', rows.filter((row) => row.result === 'Not Trained'))
    writeSection('Expired Qualifications', rows.filter((row) => row.result === 'Expired'))
    document.save(`staffboard-${builder.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-training.pdf`)
  }

  function printSummaries() {
    document.body.classList.add('training-print-active')
    window.print()
    setTimeout(() => document.body.classList.remove('training-print-active'), 250)
  }

  return <section className="training-builder-skills">
    <div className="card builder-skills-controls skills-no-print">
      <div className="builder-skills-mode-tabs">
        <button className={mode === 'single' ? 'primary' : 'secondary'} onClick={() => setMode('single')}>Selected Builder</button>
        <button className={mode === 'all' ? 'primary' : 'secondary'} onClick={() => setMode('all')}>All Builders Summary</button>
      </div>
      <div className="builder-skills-filter-grid">
        <input value={controls.search} onChange={(event) => setControls((previous) => ({ ...previous, search: event.target.value }))} placeholder="Search builder, badge, area, or result…" />
        <select value={controls.shift} onChange={(event) => setControls((previous) => ({ ...previous, shift: event.target.value }))}><option value="">All shifts</option>{shifts.map((shift) => <option key={shift}>{shift}</option>)}</select>
        <select value={controls.department} onChange={(event) => setControls((previous) => ({ ...previous, department: event.target.value }))}><option value="">All departments</option>{departments.map((department) => <option key={department}>{department}</option>)}</select>
        <select value={controls.archive} onChange={(event) => setControls((previous) => ({ ...previous, archive: event.target.value }))}><option value="active">Active builders</option><option value="all">Active and archived</option><option value="archived">Archived only</option></select>
        <select value={controls.sort} onChange={(event) => setControls((previous) => ({ ...previous, sort: event.target.value }))}><option value="name">Sort: Builder name</option><option value="trained-desc">Sort: Most trained</option><option value="missing-desc">Sort: Most missing</option><option value="shift">Sort: Shift</option><option value="updated-desc">Sort: Recently updated</option></select>
        <label className="builder-skills-toggle"><input type="checkbox" checked={showInactivePaths} onChange={(event) => setShowInactivePaths(event.target.checked)} /> Show inactive paths</label>
      </div>
      <div className="training-actions">
        <button className="secondary" onClick={exportCsv}>Builder Summary CSV</button>
        <button className="secondary" onClick={exportExcel}>Builder Summary Excel</button>
        <button className="secondary" onClick={exportProfilePdf} disabled={!selectedSummary}>Selected Builder PDF</button>
        <button className="secondary" onClick={printSummaries}>Print View</button>
      </div>
    </div>

    {mode === 'single' ? selectedSummary ? <>
      <div className="card builder-skills-identity">
        <div className="builder-skills-identity-main">
          <div>
            <div className="table-kicker">Builder Skills</div>
            <h2>{selectedSummary.builder.name}</h2>
            <div className="small">Badge {selectedSummary.builder.badgeId || 'not set'} · {selectedSummary.builder.currentShift || 'Shift not set'} · {selectedSummary.builder.department || 'Department not set'} · {selectedSummary.builder.currentStatus || 'Active'}</div>
            <div className="small">Hire date: {selectedSummary.builder.hireDate || 'Not set'}</div>
          </div>
          <div className="builder-skills-navigation skills-no-print">
            <button className="secondary" onClick={() => moveBuilder(-1)}>← Previous</button>
            <select value={selectedSummary.builder.id} onChange={(event) => setSelectedBuilderId(event.target.value)}>{visibleSummaries.map((summary) => <option value={summary.builder.id} key={summary.builder.id}>{summary.builder.name}</option>)}</select>
            <button className="secondary" onClick={() => moveBuilder(1)}>Next →</button>
          </div>
        </div>
        <div className="builder-skills-counts">
          <span><strong>{selectedSummary.counts.Trained}</strong> Trained</span>
          <span><strong>{selectedSummary.counts['Not Trained']}</strong> Not Trained</span>
          <span><strong>{selectedSummary.counts['In Training']}</strong> In Training</span>
          <span><strong>{selectedSummary.counts.Trainer}</strong> Trainer</span>
          <span><strong>{selectedSummary.counts.Expired}</strong> Expired</span>
        </div>
        <p className="builder-skills-summary-sentence">{selectedSummary.builder.name} is trained in {selectedSummary.counts.Trained} of {selectedSummary.counts.all} areas, is currently training in {selectedSummary.counts['In Training']} areas, and is a trainer in {selectedSummary.counts.Trainer} areas.</p>
        <SkillChips label="Trained" names={selectedSummary.trainedNames} tone="trained" />
        <SkillChips label="Not trained" names={selectedSummary.notTrainedNames} tone="missing" />
      </div>

      <div className="card builder-skills-display-controls skills-no-print">
        <div className="builder-skills-result-tabs">{SKILL_RESULT_FILTERS.map(([id, label]) => <button key={id} className={resultFilter === id ? 'primary' : 'secondary'} onClick={() => setResultFilter(id)}>{label} ({selectedSummary.counts[id] ?? 0})</button>)}</div>
        <input value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)} placeholder="Filter this builder’s training areas…" />
        <label className="builder-skills-toggle"><input type="checkbox" checked={groupByCategory} onChange={(event) => setGroupByCategory(event.target.checked)} /> Group by category</label>
      </div>

      <div className="builder-skills-table-wrap">
        <table className="builder-skills-table">
          <thead><tr><th>Training Area</th><th>Training Result</th><th>Detailed Status</th><th>Completion Date</th><th>Expiration Date</th><th>Trainer</th><th>Notes</th><th className="skills-no-print">Actions</th></tr></thead>
          {groupedRows.map((group) => <tbody key={group.category || 'all'}>{groupByCategory ? <tr className="builder-skills-category-row"><th colSpan="8">{group.category}</th></tr> : null}{group.items.map((row) => <tr key={row.trainingId}>
            <td><strong>{row.trainingName}</strong>{!row.catalogActive ? <small>Inactive path</small> : null}</td>
            <td><ResultBadge result={row.result} /></td>
            <td>{row.detailedStatus}</td>
            <td>{row.completionDate || '—'}</td>
            <td>{row.expirationDate || '—'}</td>
            <td>{row.trainerName || '—'}</td>
            <td className="builder-skills-notes-cell">{row.notes || '—'}</td>
            <td className="skills-no-print"><div className="builder-skills-row-actions">
              <button className="secondary" disabled={saving || !snapshot.permissions.canEditQualifications} onClick={() => prepareStatus(row, 'Qualified')}>Mark Trained</button>
              <button className="secondary" disabled={saving || !snapshot.permissions.canEditQualifications} onClick={() => markNotTrained(row)}>Mark Not Trained</button>
              <button className="secondary" disabled={saving || !snapshot.permissions.canEditQualifications} onClick={() => prepareStatus(row, 'In Training')}>Mark In Training</button>
              <button className="secondary" disabled={saving || !snapshot.permissions.canEditQualifications} onClick={() => prepareStatus(row, 'Trainer')}>Mark Trainer</button>
              <button className="secondary" disabled={!snapshot.permissions.canEditQualifications} onClick={() => openQualification(row.builderId, row.trainingId)}>Open Details</button>
            </div></td>
          </tr>)}</tbody>)}
        </table>
      </div>
    </> : <div className="card training-loading">No builders match the selected filters.</div> : <div className="builder-skills-all-grid">
      {visibleSummaries.map((summary) => <article className="card builder-skills-summary-card" key={summary.builder.id}>
        <button className="builder-skills-summary-title" onClick={() => { setSelectedBuilderId(summary.builder.id); setMode('single') }}><strong>{summary.builder.name}</strong><span>{summary.builder.currentShift || 'Shift not set'}</span></button>
        <div className="small">{summary.builder.badgeId || 'No badge ID'} · {summary.builder.department || 'Department not set'}</div>
        <SkillChips label="Trained" names={summary.trainedNames} tone="trained" />
        <SkillChips label="In training" names={summary.inTrainingNames} tone="training" />
        <SkillChips label="Trainer" names={summary.trainerNames} tone="trainer" />
        <SkillChips label="Not trained" names={summary.notTrainedNames} tone="missing" />
        {summary.expiredNames.length ? <SkillChips label="Expired" names={summary.expiredNames} tone="expired" /> : null}
      </article>)}
      {!visibleSummaries.length ? <div className="card training-loading">No builders match the selected filters.</div> : null}
    </div>}
  </section>
}
