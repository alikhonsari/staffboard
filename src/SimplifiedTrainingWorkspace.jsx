import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  createTrainingBuilder,
  createTrainingPath,
  reorderTrainingPaths,
  saveQualification,
  saveQualificationsBulk,
  syncTrainingBuilders,
  updateTrainingBuilder,
  updateTrainingPath,
} from './trainingClient'
import {
  buildAllBuilderSkillSummaries,
  buildQuickQualificationDraft,
  simplifiedTrainingResult,
  SIMPLE_RESULT_META,
} from './builderSkillsCore'
import { qualificationKey } from './trainingCore'
import {
  GRID_RESULTS,
  gridCellKey,
  parseGridCellKey,
  shouldConfirmGridTransition,
} from './trainingGridCore'
import './training-simplified.css'

const clean = (value) => String(value ?? '').trim()
const TAB_STORAGE_KEY = 'staffboard.training.simpleTab'
const SIMPLE_TO_DETAILED = {
  Trained: 'Qualified',
  'Not Trained': 'Not Started',
  'In Training': 'In Training',
  Trainer: 'Trainer',
  Expired: 'Expired',
  Suspended: 'Suspended',
}
const QUICK_FILTERS = [
  ['Not Trained', 'Missing Training'],
  ['In Training', 'In Training'],
  ['Trainer', 'Trainers'],
  ['Expired', 'Expired'],
  ['Suspended', 'Suspended'],
]
const EMPTY_BUILDER = { name: '', badgeId: '', currentShift: '', department: '' }
const EMPTY_PATH = { name: '', category: 'Operations', description: '', minimumQualified: 2, expirationDays: '', displayOrder: '' }

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
    <div className={`training-simple-modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="training-simple-modal-header"><strong>{title}</strong><button type="button" className="secondary mini-btn" onClick={onClose}>Close</button></div>
      {children}
    </div>
  </div>
}

function summaryText(counts) {
  const parts = [
    counts.Trained ? `${counts.Trained} Trained` : '',
    counts.Trainer ? `${counts.Trainer} Trainer${counts.Trainer === 1 ? '' : 's'}` : '',
    counts['Not Trained'] ? `${counts['Not Trained']} Not Trained` : '',
    counts['In Training'] ? `${counts['In Training']} In Training` : '',
  ].filter(Boolean)
  return parts.join(' · ') || 'No active training paths'
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
  const [tab, setTabState] = useState(() => sessionStorage.getItem(TAB_STORAGE_KEY) || 'grid')
  const [search, setSearch] = useState('')
  const [shift, setShift] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
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
  const [optimisticResults, setOptimisticResults] = useState(() => new Map())
  const [pendingCells, setPendingCells] = useState(() => new Set())
  const [highlightBuilderId, setHighlightBuilderId] = useState('')
  const [highlightPathId, setHighlightPathId] = useState('')
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkSelection, setBulkSelection] = useState(() => new Set())
  const [bulkResult, setBulkResult] = useState('Trained')
  const [bulkReview, setBulkReview] = useState(false)
  const gridRef = useRef(null)
  const cellMenuRef = useRef(null)

  const canEdit = Boolean(snapshot.permissions?.canEditQualifications)
  const canManageBuilders = Boolean(snapshot.permissions?.canManageBuilders ?? snapshot.permissions?.canManageCatalog)
  const canManageCatalog = Boolean(snapshot.permissions?.canManageCatalog)
  const roster = useMemo(() => normalizedRoster(staffboardBuilders, currentShift), [staffboardBuilders, currentShift])
  const summaries = useMemo(() => buildAllBuilderSkillSummaries(snapshot, { includeArchived: true }), [snapshot])
  const activeCatalog = useMemo(() => snapshot.catalog.filter((path) => path.active), [snapshot.catalog])
  const qualificationLookup = useMemo(() => new Map(snapshot.qualifications.map((item) => [qualificationKey(item.builderId, item.trainingId), item])), [snapshot.qualifications])
  const summaryByBuilder = useMemo(() => new Map(summaries.map((summary) => [summary.builder.id, summary])), [summaries])
  const rowMaps = useMemo(() => new Map(summaries.map((summary) => [summary.builder.id, new Map(summary.rows.map((row) => [row.trainingId, row]))])), [summaries])
  const shifts = useMemo(() => [...new Set(summaries.filter((summary) => !summary.builder.archived).map((summary) => summary.builder.currentShift).filter(Boolean))].sort(), [summaries])

  function setTab(nextTab) {
    setTabState(nextTab)
    sessionStorage.setItem(TAB_STORAGE_KEY, nextTab)
  }

  function getRow(builderId, path) {
    return rowMaps.get(builderId)?.get(path.id) || {
      builderId,
      trainingId: path.id,
      trainingName: path.name,
      category: path.category || 'Operations',
      detailedStatus: 'Not Started',
      result: 'Not Trained',
      qualification: null,
    }
  }

  function getResult(builderId, path) {
    const key = gridCellKey(builderId, path.id)
    if (optimisticResults.has(key)) return optimisticResults.get(key)
    const row = rowMaps.get(builderId)?.get(path.id)
    if (row) return visibleResult(row)
    const qualification = qualificationLookup.get(qualificationKey(builderId, path.id))
    return simplifiedTrainingResult(qualification)
  }

  const builderCounts = useMemo(() => {
    const counts = new Map()
    summaries.forEach((summary) => {
      const next = Object.fromEntries(GRID_RESULTS.map((result) => [result, 0]))
      activeCatalog.forEach((path) => { next[getResult(summary.builder.id, path)] += 1 })
      counts.set(summary.builder.id, next)
    })
    return counts
  }, [summaries, activeCatalog, optimisticResults, qualificationLookup, rowMaps])

  const pathCounts = useMemo(() => {
    const counts = new Map()
    snapshot.catalog.forEach((path) => {
      const next = Object.fromEntries(GRID_RESULTS.map((result) => [result, 0]))
      summaries.filter((summary) => !summary.builder.archived).forEach((summary) => { next[getResult(summary.builder.id, path)] += 1 })
      counts.set(path.id, next)
    })
    return counts
  }, [snapshot.catalog, summaries, optimisticResults, qualificationLookup, rowMaps])

  const visibleSummaries = useMemo(() => {
    const query = clean(search).toLowerCase()
    return summaries.filter((summary) => {
      if (!showArchived && summary.builder.archived) return false
      if (shift && summary.builder.currentShift !== shift) return false
      if (statusFilter && !activeCatalog.some((path) => getResult(summary.builder.id, path) === statusFilter)) return false
      if (!query) return true
      return `${summary.builder.name} ${summary.builder.badgeId || ''} ${summary.builder.department || ''}`.toLowerCase().includes(query)
    })
  }, [summaries, showArchived, shift, statusFilter, search, activeCatalog, optimisticResults, qualificationLookup, rowMaps])

  const bulkItems = useMemo(() => [...bulkSelection].map((key) => {
    const { builderId, trainingId } = parseGridCellKey(key)
    const builder = summaryByBuilder.get(builderId)?.builder
    const path = snapshot.catalog.find((item) => item.id === trainingId)
    return { key, builderId, trainingId, builder, path, row: path ? getRow(builderId, path) : null }
  }).filter((item) => item.builder && item.path && item.row), [bulkSelection, summaryByBuilder, snapshot.catalog, rowMaps])

  useEffect(() => {
    if (cellMenu) window.setTimeout(() => cellMenuRef.current?.querySelector('button')?.focus(), 0)
  }, [cellMenu])

  useEffect(() => {
    if (!highlightBuilderId && !highlightPathId) return
    const selector = highlightBuilderId
      ? `[data-builder-id="${CSS.escape(highlightBuilderId)}"]`
      : `[data-path-id="${CSS.escape(highlightPathId)}"]`
    const target = gridRef.current?.querySelector(selector)
    target?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    const timeout = window.setTimeout(() => {
      setHighlightBuilderId('')
      setHighlightPathId('')
    }, 2400)
    return () => window.clearTimeout(timeout)
  }, [highlightBuilderId, highlightPathId, visibleSummaries, activeCatalog])

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

  function clearFilters() {
    setSearch('')
    setShift('')
    setStatusFilter('')
    setShowArchived(false)
    setHighlightBuilderId('')
    setHighlightPathId('')
  }

  async function syncRoster() {
    if (!canManageBuilders) return
    if (!roster.length) {
      setError('No active builders were found in StaffBoard Builder Management. Add a builder there or use Add Builder.')
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
      const saved = draft.id ? await updateTrainingBuilder(draft.id, draft) : await createTrainingBuilder(draft)
      setBuilderDraft(null)
      setTab('grid')
      setSearch('')
      setShowArchived(false)
      setHighlightBuilderId(saved.id || draft.id || '')
      await onRefresh()
      notify(draft.id ? 'Builder updated.' : 'Builder added. All missing training displays as Not Trained.')
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

  async function applyPathOrder(pathId, requestedOrder, includeNew = false) {
    const order = Number(requestedOrder)
    if (!Number.isFinite(order) || order < 1) return
    const ids = snapshot.catalog.map((path) => path.id).filter((id) => id !== pathId)
    const targetIndex = Math.min(ids.length, Math.max(0, Math.trunc(order) - 1))
    ids.splice(targetIndex, 0, pathId)
    if (includeNew || ids.join('|') !== snapshot.catalog.map((path) => path.id).join('|')) await reorderTrainingPaths(ids)
  }

  async function savePath(event) {
    event.preventDefault()
    if (!canManageCatalog) return
    const draft = pathDraft || EMPTY_PATH
    await run(async () => {
      const saved = draft.id ? await updateTrainingPath(draft.id, draft) : await createTrainingPath(draft)
      await applyPathOrder(saved.id || draft.id, draft.displayOrder, !draft.id)
      setPathDraft(null)
      setPathAdvanced(false)
      setTab('grid')
      setHighlightPathId(saved.id || draft.id || '')
      await onRefresh()
      notify(draft.id ? 'Training path updated.' : 'Training path added. Every missing qualification displays as Not Trained.')
    })
  }

  async function togglePath(path) {
    if (!canManageCatalog) return
    if (path.active && !window.confirm(`Archive ${path.name}? Existing qualification history will be preserved.`)) return
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

  function openCell(event, summary, path, rowIndex, columnIndex) {
    const key = gridCellKey(summary.builder.id, path.id)
    if (bulkMode) {
      setBulkSelection((current) => {
        const next = new Set(current)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
      return
    }
    const row = getRow(summary.builder.id, path)
    const rect = event.currentTarget.getBoundingClientRect()
    setCellMenu({
      key,
      row,
      builder: summary.builder,
      path,
      rowIndex,
      columnIndex,
      top: Math.max(8, Math.min(window.innerHeight - 330, rect.bottom + 4)),
      left: Math.max(8, Math.min(window.innerWidth - 250, rect.left)),
    })
  }

  function setOptimistic(key, result) {
    setOptimisticResults((current) => {
      const next = new Map(current)
      if (result == null) next.delete(key)
      else next.set(key, result)
      return next
    })
  }

  function setPending(key, pending) {
    setPendingCells((current) => {
      const next = new Set(current)
      if (pending) next.add(key)
      else next.delete(key)
      return next
    })
  }

  function confirmTransition(builder, path, previousResult, nextResult) {
    if (!shouldConfirmGridTransition(previousResult, nextResult)) return true
    return window.confirm(`${builder.name} — ${path.name}\n\nChange ${previousResult} to ${nextResult}?\n\nExisting qualification history will be preserved.`)
  }

  async function quickUpdate(simpleResult) {
    if (!canEdit || !cellMenu) return
    const { key, row, builder, path } = cellMenu
    const previousResult = getResult(builder.id, path)
    if (previousResult === simpleResult) {
      setCellMenu(null)
      return
    }
    if (!confirmTransition(builder, path, previousResult, simpleResult)) return

    const hadOverride = optimisticResults.has(key)
    const previousOverride = optimisticResults.get(key)
    setOptimistic(key, simpleResult)
    setPending(key, true)
    setCellMenu(null)
    setError('')
    try {
      await saveQualification(buildQuickPayload(row, simpleResult))
      notify(`${builder.name} · ${path.name}: ${simpleResult}`)
    } catch (requestError) {
      setOptimistic(key, hadOverride ? previousOverride : null)
      setError(`${builder.name} · ${path.name} was not changed. ${requestError.message || 'Save failed.'}`)
    } finally {
      setPending(key, false)
    }
  }

  function openDetails(row) {
    setCellMenu(null)
    const optimistic = optimisticResults.get(gridCellKey(row.builderId, row.trainingId))
    const details = optimistic ? { ...row, result: optimistic, detailedStatus: SIMPLE_TO_DETAILED[optimistic] } : row
    if (canEdit) onOpenDetails(details.builderId, details.trainingId)
    else setReadOnlyDetails(details)
  }

  function handleGridKeyDown(event, rowIndex, columnIndex) {
    const movement = {
      ArrowRight: [0, 1],
      ArrowLeft: [0, -1],
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
    }[event.key]
    if (!movement) return
    event.preventDefault()
    const nextRow = Math.max(0, Math.min(visibleSummaries.length - 1, rowIndex + movement[0]))
    const nextColumn = Math.max(0, Math.min(activeCatalog.length - 1, columnIndex + movement[1]))
    gridRef.current?.querySelector(`[data-grid-row="${nextRow}"][data-grid-column="${nextColumn}"]`)?.focus()
  }

  function toggleBulkMode() {
    setCellMenu(null)
    setBulkMode((current) => !current)
    setBulkSelection(new Set())
    setBulkReview(false)
  }

  async function applyBulkUpdate() {
    if (!canEdit || !bulkItems.length) return
    const transitions = bulkItems.map((item) => ({ ...item, previousResult: getResult(item.builderId, item.path) }))
    const protectedTransitions = transitions.filter((item) => shouldConfirmGridTransition(item.previousResult, bulkResult))
    if (protectedTransitions.length) {
      const confirmed = window.confirm(`${protectedTransitions.length} selected trained qualification${protectedTransitions.length === 1 ? '' : 's'} will change to ${bulkResult}. Existing history will be preserved. Continue?`)
      if (!confirmed) return
    }

    const previousResults = new Map(transitions.map((item) => [item.key, {
      result: optimisticResults.has(item.key) ? optimisticResults.get(item.key) : item.previousResult,
      hadOverride: optimisticResults.has(item.key),
    }]))
    setOptimisticResults((current) => {
      const next = new Map(current)
      transitions.forEach((item) => next.set(item.key, bulkResult))
      return next
    })
    setPendingCells((current) => new Set([...current, ...transitions.map((item) => item.key)]))
    setBulkReview(false)
    setError('')
    try {
      await saveQualificationsBulk(transitions.map((item) => ({
        ...buildQuickPayload(item.row, bulkResult),
        reason: `Training Grid bulk update: ${bulkResult}`,
      })))
      setBulkSelection(new Set())
      notify(`${transitions.length} Training cell${transitions.length === 1 ? '' : 's'} updated to ${bulkResult}.`)
    } catch (requestError) {
      setOptimisticResults((current) => {
        const next = new Map(current)
        previousResults.forEach((previous, key) => {
          if (previous.hadOverride) next.set(key, previous.result)
          else next.delete(key)
        })
        return next
      })
      setError(`Bulk update was not saved. ${requestError.message || 'Please try again.'}`)
    } finally {
      setPendingCells((current) => {
        const next = new Set(current)
        transitions.forEach((item) => next.delete(item.key))
        return next
      })
    }
  }

  function viewBuilder(builder) {
    setTab('grid')
    clearFilters()
    setSearch(builder.name)
    setShowArchived(Boolean(builder.archived))
    setHighlightBuilderId(builder.id)
  }

  function viewPath(path) {
    setTab('grid')
    clearFilters()
    setHighlightPathId(path.id)
  }

  return <section className="training-simple-workspace" data-training-workspace-version="2">
    <div className="training-simple-primary-tabs" role="tablist" aria-label="Training sections">
      <button role="tab" aria-selected={tab === 'grid'} className={tab === 'grid' ? 'primary' : 'secondary'} onClick={() => setTab('grid')}>Training Grid</button>
      <button role="tab" aria-selected={tab === 'builders'} className={tab === 'builders' ? 'primary' : 'secondary'} onClick={() => setTab('builders')}>Builders</button>
      <button role="tab" aria-selected={tab === 'paths'} className={tab === 'paths' ? 'primary' : 'secondary'} onClick={() => setTab('paths')}>Training Paths</button>
    </div>

    {message ? <div className="training-message training-message-success" role="status">{message}</div> : null}
    {error ? <div className="training-message training-message-error" role="alert">{error}</div> : null}
    {!canEdit ? <div className="training-message training-message-viewonly" role="status">View-only access: you can review Training information but cannot make changes.</div> : null}

    {tab === 'grid' ? <>
      <div className="training-simple-toolbar training-simple-filterbar">
        <label className="training-simple-search"><span className="sr-only">Search builders</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search builders…" /></label>
        <select aria-label="Filter by shift" value={shift} onChange={(event) => setShift(event.target.value)}><option value="">All shifts</option>{shifts.map((item) => <option key={item}>{item}</option>)}</select>
        <select aria-label="Filter by training status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{GRID_RESULTS.map((result) => <option key={result}>{result}</option>)}</select>
        <label className="training-simple-toggle"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Archived</label>
        <button type="button" className="secondary" onClick={clearFilters}>Clear</button>
        {canManageBuilders ? <button type="button" className="secondary" onClick={() => setBuilderDraft({ ...EMPTY_BUILDER })}>Add Builder</button> : null}
        {canManageCatalog ? <button type="button" className="secondary" onClick={() => setPathDraft({ ...EMPTY_PATH, displayOrder: snapshot.catalog.length + 1 })}>Add Training Path</button> : null}
        {canEdit ? <button type="button" className={bulkMode ? 'primary' : 'secondary'} onClick={toggleBulkMode}>{bulkMode ? 'Exit Bulk Mode' : 'Bulk Update'}</button> : null}
        <div className="training-simple-menu-wrap">
          <button type="button" className="secondary" onClick={() => { setShowExport((value) => !value); setShowMore(false) }}>Export ▾</button>
          {showExport ? <div className="training-simple-menu"><button onClick={() => { onExportCsv(); setShowExport(false) }}>CSV</button><button onClick={() => { onExportExcel(); setShowExport(false) }}>Excel</button><button onClick={() => { onExportPdf(); setShowExport(false) }}>PDF</button></div> : null}
        </div>
        <div className="training-simple-menu-wrap">
          <button type="button" className="secondary" onClick={() => { setShowMore((value) => !value); setShowExport(false) }}>More ▾</button>
          {showMore ? <div className="training-simple-menu">
            <button onClick={() => onAdvancedView('dashboard')}>Dashboard</button>
            <button onClick={() => onAdvancedView('coverage')}>Coverage</button>
            <button onClick={() => onAdvancedView('builders')}>Builder Profiles</button>
            <button onClick={() => onAdvancedView('history')}>History</button>
            <button onClick={() => onAdvancedView('history')}>Reports</button>
            {canManageBuilders ? <button onClick={onImport}>Import</button> : null}
            <button onClick={() => onAdvancedView('matrix')}>Advanced Matrix</button>
            <button onClick={() => onAdvancedView('catalog')}>Catalog Management</button>
          </div> : null}
        </div>
      </div>

      <div className="training-simple-quick-filters" aria-label="Quick filters">
        {QUICK_FILTERS.map(([value, label]) => <button type="button" key={value} className={statusFilter === value ? 'active' : ''} onClick={() => setStatusFilter((current) => current === value ? '' : value)}>{label}</button>)}
      </div>

      {bulkMode ? <div className="training-bulk-bar" role="status">
        <strong>{bulkSelection.size} cell{bulkSelection.size === 1 ? '' : 's'} selected</strong>
        <span>Click cells to select them.</span>
        <select aria-label="Bulk training status" value={bulkResult} onChange={(event) => setBulkResult(event.target.value)}>{GRID_RESULTS.map((result) => <option key={result}>{result}</option>)}</select>
        <button type="button" className="primary" disabled={!bulkSelection.size || busy} onClick={() => setBulkReview(true)}>Review Update</button>
        <button type="button" className="secondary" disabled={!bulkSelection.size} onClick={() => setBulkSelection(new Set())}>Clear Selection</button>
      </div> : null}

      {!summaries.filter((summary) => !summary.builder.archived).length ? <div className="training-simple-empty">
        <strong>No builders have been added to Training yet.</strong>
        <p>Sync imports builders already managed in StaffBoard. Add Builder creates a Training-only builder.</p>
        {canManageBuilders ? <div><button type="button" className="primary" disabled={busy} onClick={syncRoster}>Sync StaffBoard Builders</button><button type="button" className="secondary" onClick={() => setBuilderDraft({ ...EMPTY_BUILDER })}>Add Builder</button></div> : null}
      </div> : !visibleSummaries.length ? <div className="training-simple-empty"><strong>No builders match the current filters.</strong><button type="button" className="secondary" onClick={clearFilters}>Clear filters</button></div> : !activeCatalog.length ? <div className="training-simple-empty"><strong>Add your first training path to begin tracking qualifications.</strong>{canManageCatalog ? <button type="button" className="primary" onClick={() => setPathDraft({ ...EMPTY_PATH, displayOrder: 1 })}>Add Training Path</button> : null}</div> : <div className="training-simple-grid-wrap" ref={gridRef}>
        <table className="training-simple-grid">
          <thead><tr><th className="training-simple-builder-column">Builder</th>{activeCatalog.map((path) => {
            const counts = pathCounts.get(path.id) || {}
            return <th key={path.id} data-path-id={path.id} className={highlightPathId === path.id ? 'training-highlight' : ''} title={path.name}><button type="button" className="training-path-heading" onClick={() => { setStatusFilter('Not Trained'); setHighlightPathId(path.id) }}><span>{path.name}</span><small>{counts['Not Trained'] || 0} Not Trained</small></button></th>
          })}</tr></thead>
          <tbody>{visibleSummaries.map((summary, rowIndex) => {
            const counts = builderCounts.get(summary.builder.id) || {}
            return <tr key={summary.builder.id} data-builder-id={summary.builder.id} className={`${summary.builder.archived ? 'training-row-archived' : ''} ${highlightBuilderId === summary.builder.id ? 'training-highlight' : ''}`}>
              <th className="training-simple-builder-column"><button type="button" onClick={() => { setStatusFilter('Not Trained'); setSearch(summary.builder.name); setHighlightBuilderId(summary.builder.id) }}>{summary.builder.name}</button><small>{summary.builder.currentShift || 'Shift not set'}{summary.builder.archived ? ' · Archived' : ''}</small><button type="button" className="training-missing-count" onClick={() => { setStatusFilter('Not Trained'); setSearch(summary.builder.name); setHighlightBuilderId(summary.builder.id) }}>{counts['Not Trained'] || 0} Not Trained</button></th>
              {activeCatalog.map((path, columnIndex) => {
                const result = getResult(summary.builder.id, path)
                const key = gridCellKey(summary.builder.id, path.id)
                const selected = bulkSelection.has(key)
                const active = cellMenu?.key === key
                const pending = pendingCells.has(key)
                const filterMatch = statusFilter && result === statusFilter
                return <td key={path.id} className={`${statusClass(result)} ${selected ? 'training-cell-selected' : ''} ${active ? 'training-cell-active' : ''} ${filterMatch ? 'training-cell-filter-match' : ''}`}>
                  <button type="button" data-grid-row={rowIndex} data-grid-column={columnIndex} aria-label={`${summary.builder.name}, ${path.name}, ${result}${pending ? ', saving' : ''}`} aria-pressed={selected} title={`${summary.builder.name} · ${path.name} · ${result}`} onKeyDown={(event) => handleGridKeyDown(event, rowIndex, columnIndex)} onClick={(event) => openCell(event, summary, path, rowIndex, columnIndex)}><span aria-hidden="true">{SIMPLE_RESULT_META[result]?.icon || ''}</span> {result}{pending ? <small>Saving…</small> : null}</button>
                </td>
              })}
            </tr>
          })}</tbody>
        </table>
      </div>}
    </> : null}

    {tab === 'builders' ? <div className="training-simple-section">
      <div className="training-simple-section-head"><div><strong>Builders</strong><small>{snapshot.builders.length} Training builder records</small></div>{canManageBuilders ? <div><button type="button" className="secondary" disabled={busy} onClick={syncRoster}>Sync StaffBoard Builders</button><button type="button" className="primary" onClick={() => setBuilderDraft({ ...EMPTY_BUILDER })}>Add Builder</button></div> : null}</div>
      <div className="training-simple-table-wrap"><table><thead><tr><th>Builder</th><th>Badge ID</th><th>Shift</th><th>Department</th><th>Training summary</th><th>Status</th><th>Actions</th></tr></thead><tbody>{snapshot.builders.map((builder) => {
        const counts = builderCounts.get(builder.id) || {}
        return <tr key={builder.id}><td><strong>{builder.name}</strong></td><td>{builder.badgeId || '—'}</td><td>{builder.currentShift || '—'}</td><td>{builder.department || '—'}</td><td>{summaryText(counts)}</td><td>{builder.archived ? 'Archived' : builder.currentStatus || 'Active'}</td><td><div className="training-simple-row-actions"><button className="secondary" onClick={() => viewBuilder(builder)}>View Training</button>{canManageBuilders ? <><button className="secondary" onClick={() => setBuilderDraft({ ...builder })}>Edit</button><button className="secondary" onClick={() => toggleBuilderArchive(builder)}>{builder.archived ? 'Restore' : 'Archive'}</button></> : null}</div></td></tr>
      })}</tbody></table></div>
    </div> : null}

    {tab === 'paths' ? <div className="training-simple-section">
      <div className="training-simple-section-head"><div><strong>Training Paths</strong><small>New paths immediately become grid columns.</small></div>{canManageCatalog ? <button type="button" className="primary" onClick={() => setPathDraft({ ...EMPTY_PATH, displayOrder: snapshot.catalog.length + 1 })}>Add Training Path</button> : null}</div>
      <div className="training-simple-table-wrap"><table><thead><tr><th>Training Path</th><th>Category</th><th>Trained</th><th>Trainers</th><th>Missing</th><th>Status</th><th>Actions</th></tr></thead><tbody>{snapshot.catalog.map((path, index) => {
        const counts = pathCounts.get(path.id) || {}
        return <tr key={path.id}><td><strong>{path.name}</strong></td><td>{path.category || 'Operations'}</td><td>{counts.Trained || 0}</td><td>{counts.Trainer || 0}</td><td>{counts['Not Trained'] || 0}</td><td>{path.active ? 'Active' : 'Archived'}</td><td><div className="training-simple-row-actions"><button className="secondary" onClick={() => viewPath(path)}>View in Grid</button>{canManageCatalog ? <><button className="secondary" onClick={() => { setPathDraft({ ...path, displayOrder: index + 1 }); setPathAdvanced(Boolean(path.description || path.expirationDays || path.minimumQualified !== 2)) }}>Edit</button><button className="secondary" disabled={index === 0} onClick={() => movePath(path.id, -1)}>Move left</button><button className="secondary" disabled={index === snapshot.catalog.length - 1} onClick={() => movePath(path.id, 1)}>Move right</button><button className="secondary" onClick={() => togglePath(path)}>{path.active ? 'Archive' : 'Restore'}</button></> : null}</div></td></tr>
      })}</tbody></table></div>
    </div> : null}

    {cellMenu ? <div ref={cellMenuRef} className="training-cell-popover" style={{ top: cellMenu.top, left: cellMenu.left }} role="menu" aria-label={`Update ${cellMenu.builder.name} for ${cellMenu.path.name}`}>
      <strong>{cellMenu.builder.name}</strong><small>{cellMenu.path.name} · Current: {getResult(cellMenu.builder.id, cellMenu.path)}</small>
      {canEdit ? GRID_RESULTS.map((option) => <button key={option} role="menuitem" className={statusClass(option)} disabled={busy || saving} onClick={() => quickUpdate(option)}>{SIMPLE_RESULT_META[option]?.icon} {option}</button>) : <div className="small">View-only access</div>}
      <button className="secondary" onClick={() => openDetails(cellMenu.row)}>View details</button>
      <button className="secondary" onClick={() => setCellMenu(null)}>Cancel</button>
    </div> : null}

    {builderDraft ? <Modal title={builderDraft.id ? 'Edit Builder' : 'Add Builder'} onClose={() => setBuilderDraft(null)}><form className="training-simple-form" onSubmit={saveBuilder}>
      <label>Builder name<input required autoFocus value={builderDraft.name || ''} onChange={(event) => setBuilderDraft((current) => ({ ...current, name: event.target.value }))} /></label>
      <label>Badge ID <span className="small">optional</span><input value={builderDraft.badgeId || ''} onChange={(event) => setBuilderDraft((current) => ({ ...current, badgeId: event.target.value }))} /></label>
      <div className="row two"><label>Shift <span className="small">optional</span><input value={builderDraft.currentShift || ''} onChange={(event) => setBuilderDraft((current) => ({ ...current, currentShift: event.target.value }))} /></label><label>Department <span className="small">optional</span><input value={builderDraft.department || ''} onChange={(event) => setBuilderDraft((current) => ({ ...current, department: event.target.value }))} /></label></div>
      <small>Possible duplicates are checked by builder ID, badge ID, and normalized name.</small>
      <button className="primary" disabled={busy}>Save Builder</button>
    </form></Modal> : null}

    {pathDraft ? <Modal title={pathDraft.id ? 'Edit Training Path' : 'Add Training Path'} onClose={() => { setPathDraft(null); setPathAdvanced(false) }}><form className="training-simple-form" onSubmit={savePath}>
      <label>Training path name<input required autoFocus value={pathDraft.name || ''} onChange={(event) => setPathDraft((current) => ({ ...current, name: event.target.value }))} /></label>
      <label>Category <span className="small">optional</span><input value={pathDraft.category || ''} onChange={(event) => setPathDraft((current) => ({ ...current, category: event.target.value }))} /></label>
      <button type="button" className="secondary" onClick={() => setPathAdvanced((value) => !value)}>{pathAdvanced ? 'Hide more options' : 'More options'}</button>
      {pathAdvanced ? <><label>Description<textarea value={pathDraft.description || ''} onChange={(event) => setPathDraft((current) => ({ ...current, description: event.target.value }))} /></label><div className="row two"><label>Minimum coverage<input type="number" min="0" value={pathDraft.minimumQualified ?? 2} onChange={(event) => setPathDraft((current) => ({ ...current, minimumQualified: event.target.value }))} /></label><label>Qualification expiration (days)<input type="number" min="1" value={pathDraft.expirationDays || ''} onChange={(event) => setPathDraft((current) => ({ ...current, expirationDays: event.target.value }))} /></label></div><label>Display order<input type="number" min="1" max={snapshot.catalog.length + (pathDraft.id ? 0 : 1)} value={pathDraft.displayOrder || ''} onChange={(event) => setPathDraft((current) => ({ ...current, displayOrder: event.target.value }))} /></label></> : null}
      <button className="primary" disabled={busy}>Save Training Path</button>
    </form></Modal> : null}

    {bulkReview ? <Modal title="Review Bulk Training Update" onClose={() => setBulkReview(false)} wide>
      <div className="training-bulk-review"><p><strong>{bulkItems.length} cell{bulkItems.length === 1 ? '' : 's'}</strong> will be changed to <strong>{bulkResult}</strong>.</p><div className="training-bulk-review-list">{bulkItems.slice(0, 20).map((item) => <div key={item.key}><span>{item.builder.name}</span><span>{item.path.name}</span><span>{getResult(item.builderId, item.path)} → {bulkResult}</span></div>)}{bulkItems.length > 20 ? <small>And {bulkItems.length - 20} more…</small> : null}</div><div className="training-modal-actions"><button type="button" className="secondary" onClick={() => setBulkReview(false)}>Cancel</button><button type="button" className="primary" disabled={busy} onClick={applyBulkUpdate}>Confirm Update</button></div></div>
    </Modal> : null}

    {readOnlyDetails ? <Modal title="Qualification Details" onClose={() => setReadOnlyDetails(null)}><dl className="training-readonly-details"><dt>Training area</dt><dd>{readOnlyDetails.trainingName}</dd><dt>Result</dt><dd>{visibleResult(readOnlyDetails)}</dd><dt>Detailed status</dt><dd>{readOnlyDetails.detailedStatus}</dd><dt>Completion date</dt><dd>{readOnlyDetails.completionDate || '—'}</dd><dt>Expiration date</dt><dd>{readOnlyDetails.expirationDate || '—'}</dd><dt>Trainer</dt><dd>{readOnlyDetails.trainerName || '—'}</dd><dt>Certificate number</dt><dd>{readOnlyDetails.certificateNumber || '—'}</dd><dt>Certificate URL</dt><dd>{readOnlyDetails.certificateFileUrl ? <a href={readOnlyDetails.certificateFileUrl} target="_blank" rel="noreferrer">Open certificate</a> : '—'}</dd><dt>Assessment score</dt><dd>{readOnlyDetails.assessmentScore === '' || readOnlyDetails.assessmentScore == null ? '—' : readOnlyDetails.assessmentScore}</dd><dt>Notes</dt><dd>{readOnlyDetails.notes || '—'}</dd><dt>Audit history</dt><dd>Open Reports & History for the complete audit trail.</dd></dl></Modal> : null}
  </section>
}
