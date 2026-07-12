import React, { useEffect, useMemo, useState } from 'react'
import {
  downloadRecoveryExport, loadRecoveryBackups, loadRecoveryVersions,
  previewRecoveryVersion, requestRecoveryAction,
} from './recoveryClient'
import { verifyServerBackup } from './diagnosticsClient'
import DiagnosticsPanel from './DiagnosticsPanel'
import './recovery.css'

const ENTITY_LABELS = {
  operational_day: 'Operational Day',
  builder_assignment: 'Builder Assignment',
  day_assignments: 'Day Assignments',
  day_goals: 'Goals & Metrics',
  day_racks: 'Rack Data',
  day_notes: 'Day Notes',
  builder_master_list: 'Builder Master List',
  area_definitions: 'Area Definitions',
  board_comments: 'Board Comments',
  day_templates: 'Day Templates',
}

function displayTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value || '—' : date.toLocaleString()
}

export default function RecoveryPanel({ state, setState, defaultState, normalizeState, user }) {
  const [versions, setVersions] = useState([])
  const [backups, setBackups] = useState([])
  const [filters, setFilters] = useState({ admin: '', day: '', builderId: '', action: '', entityType: '' })
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [compareVersionId, setCompareVersionId] = useState('')
  const [selectedBackupId, setSelectedBackupId] = useState('')
  const [preview, setPreview] = useState(null)
  const [verification, setVerification] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const context = useMemo(() => ({
    boardId: state.currentBoardId || 'speed_day',
    weekStartDate: state.weekStartDate,
    day: state.selectedDay,
  }), [state.currentBoardId, state.weekStartDate, state.selectedDay])

  const refresh = async () => {
    setError('')
    try {
      const [versionPayload, backupPayload] = await Promise.all([
        loadRecoveryVersions({ ...filters, boardId: context.boardId, week: context.weekStartDate, limit: 150 }),
        loadRecoveryBackups(80),
      ])
      setVersions(versionPayload.versions || [])
      setBackups(backupPayload.backups || [])
      if (selectedVersionId && !(versionPayload.versions || []).some((row) => row.id === selectedVersionId)) setSelectedVersionId('')
      if (selectedBackupId && !(backupPayload.backups || []).some((row) => row.id === selectedBackupId)) setSelectedBackupId('')
    } catch (loadError) {
      setError(loadError?.message || 'Failed to load recovery history.')
    }
  }

  useEffect(() => { refresh() }, [context.boardId, context.weekStartDate])

  const runAction = async (action, details = {}) => {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const payload = await requestRecoveryAction(action, { ...context, ...details }, defaultState)
      if (payload.normalizedState) setState((previous) => normalizeState({ ...previous, ...payload.normalizedState }))
      setMessage(payload.message || 'Recovery action completed.')
      setPreview(null)
      await refresh()
    } catch (actionError) {
      setError(actionError?.message || 'Recovery action failed.')
    } finally {
      setBusy(false)
    }
  }

  const previewSelected = async () => {
    if (!selectedVersionId) return setError('Select a version first.')
    setBusy(true)
    setError('')
    try {
      const payload = await previewRecoveryVersion(selectedVersionId, compareVersionId)
      setPreview(payload.preview || null)
    } catch (previewError) {
      setError(previewError?.message || 'Preview failed.')
    } finally {
      setBusy(false)
    }
  }

  const restoreSelected = async () => {
    if (!selectedVersionId) return setError('Select a version first.')
    const reason = window.prompt('Reason for restoring this version?')
    if (reason == null) return
    const row = versions.find((item) => item.id === selectedVersionId)
    if (!window.confirm(`Restore ${ENTITY_LABELS[row?.entityType] || row?.entityType || 'this version'} from ${displayTime(row?.timestamp)}? A backup will be created first.`)) return
    await runAction('restore_version', { versionId: selectedVersionId, reason })
  }

  const undoLast = async () => {
    const reason = window.prompt('Reason for undoing the latest reversible change?')
    if (reason == null) return
    if (!window.confirm('Undo the latest reversible change in this board and week? A backup will be created first.')) return
    await runAction('undo_last', { reason })
  }

  const createBackup = async () => {
    const reason = window.prompt('Backup note:', 'Manual administrative backup')
    if (reason == null) return
    await runAction('create_backup', { reason, kind: 'manual' })
  }

  const restoreBackup = async () => {
    if (!selectedBackupId) return setError('Select a backup first.')
    const reason = window.prompt('Reason for restoring this full backup?')
    if (reason == null) return
    if (!window.confirm('Restore the full backup? Current closure controls and pending scheduled-transition fields will be preserved, and another backup will be created first.')) return
    await runAction('restore_backup', { backupId: selectedBackupId, reason, confirmLocked: false })
  }

  const verifyBackup = async () => {
    if (!selectedBackupId) return setError('Select a backup first.')
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const payload = await verifyServerBackup(selectedBackupId)
      setVerification(payload.result || null)
      setMessage(payload.result?.valid ? 'Backup verification passed.' : 'Backup verification found problems.')
      await refresh()
    } catch (verifyError) {
      setError(verifyError?.message || 'Backup verification failed.')
    } finally {
      setBusy(false)
    }
  }

  const exportScope = async (scope) => {
    setBusy(true)
    setError('')
    try {
      const filename = await downloadRecoveryExport(scope, context)
      setMessage(`Downloaded ${filename}.`)
    } catch (exportError) {
      setError(exportError?.message || 'Administrative export failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="board-shell recovery-panel" aria-busy={busy}>
      <div className="board-header">
        <div>
          <div className="title">Data Recovery & Version History</div>
          <div className="recovery-context">
            <span className="pill">{state.currentBoardId}</span>
            <span className="pill">Week {state.weekStartDate}</span>
            <span className="pill">{state.selectedDay}</span>
            <span className="pill">Admin: {user?.username || state.adminName || 'Unknown'}</span>
            <span className="pill">Revision: {Number(state.stateRevision || 0)}</span>
          </div>
        </div>
        <button className="secondary" type="button" onClick={refresh} disabled={busy}>Refresh</button>
      </div>

      {message ? <div className="recovery-alert success" role="status">{message}</div> : null}
      {error ? <div className="recovery-alert error" role="alert">{error}</div> : null}

      <div className="recovery-actions card">
        <div>
          <div className="table-kicker">Protected Actions</div>
          <div className="small">Undo and restores run on the server, validate the latest state revision, create backups, and write new audit records.</div>
        </div>
        <div className="recovery-button-row">
          <button className="secondary" type="button" onClick={undoLast} disabled={busy}>Undo Last Change</button>
          <button className="secondary" type="button" onClick={createBackup} disabled={busy}>Create Backup</button>
          <button className="primary" type="button" onClick={previewSelected} disabled={busy || !selectedVersionId}>Preview Selected</button>
          <button className="danger" type="button" onClick={restoreSelected} disabled={busy || !selectedVersionId}>Restore Selected</button>
        </div>
      </div>

      <div className="recovery-grid">
        <section className="card recovery-section">
          <div className="table-title-row">
            <div><div className="table-kicker">Version Timeline</div><div className="small">Choose one record to preview or restore. Select a second record for comparison.</div></div>
          </div>
          <div className="recovery-filters">
            <input aria-label="Filter by admin" placeholder="Admin" value={filters.admin} onChange={(event) => setFilters({ ...filters, admin: event.target.value })} />
            <select aria-label="Filter by day" value={filters.day} onChange={(event) => setFilters({ ...filters, day: event.target.value })}>
              <option value="">All days</option>
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => <option key={day}>{day}</option>)}
            </select>
            <select aria-label="Filter by builder" value={filters.builderId} onChange={(event) => setFilters({ ...filters, builderId: event.target.value })}>
              <option value="">All builders</option>
              {(state.builderPool || []).map((builder) => <option key={builder.id} value={builder.id}>{builder.name}</option>)}
            </select>
            <select aria-label="Filter by entity type" value={filters.entityType} onChange={(event) => setFilters({ ...filters, entityType: event.target.value })}>
              <option value="">All record types</option>
              {Object.entries(ENTITY_LABELS).map(([entryValue, label]) => <option key={entryValue} value={entryValue}>{label}</option>)}
            </select>
            <input aria-label="Filter by action" placeholder="Action contains…" value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })} />
            <button className="secondary" type="button" onClick={refresh} disabled={busy}>Apply Filters</button>
          </div>
          <div className="recovery-table-wrap">
            <table className="recovery-table">
              <thead><tr><th>Restore</th><th>Compare</th><th>Time</th><th>Admin</th><th>Day</th><th>Type</th><th>Action</th><th>Before → After</th></tr></thead>
              <tbody>
                {versions.length ? versions.map((row) => (
                  <tr key={row.id} className={selectedVersionId === row.id ? 'selected' : ''}>
                    <td><input aria-label={`Select ${row.actionType} for restore`} type="radio" name="recoveryVersion" checked={selectedVersionId === row.id} onChange={() => setSelectedVersionId(row.id)} /></td>
                    <td><input aria-label={`Select ${row.actionType} for comparison`} type="radio" name="compareVersion" checked={compareVersionId === row.id} onChange={() => setCompareVersionId(row.id)} /></td>
                    <td>{displayTime(row.timestamp)}</td><td>{row.admin}</td><td>{row.day || '—'}</td>
                    <td>{ENTITY_LABELS[row.entityType] || row.entityType}</td><td>{row.actionType}</td>
                    <td>{row.previousSummary} → {row.newSummary}</td>
                  </tr>
                )) : <tr><td colSpan="8">No matching versions are available yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card recovery-section">
          <div className="table-kicker">Restore Preview</div>
          {preview ? (
            <div className="recovery-preview">
              <dl>
                <div><dt>Entity</dt><dd>{ENTITY_LABELS[preview.entityType] || preview.entityType}</dd></div>
                <div><dt>Scope</dt><dd>{preview.boardId} · {preview.week} · {preview.day || 'Board'}</dd></div>
                <div><dt>Recorded</dt><dd>{displayTime(preview.recordedAt)} by {preview.recordedBy}</dd></div>
                <div><dt>Current Revision</dt><dd>{preview.currentRevision || '—'}</dd></div>
              </dl>
              <div className="recovery-alert warning">{preview.warning}</div>
              <pre>{JSON.stringify(preview.restoreValue, null, 2)}</pre>
              {preview.comparison ? <><h3>Comparison</h3><div className="small">Values are {preview.sameRestoreValue ? 'the same' : 'different'}.</div><pre>{JSON.stringify(preview.comparison.restoreValue, null, 2)}</pre></> : null}
            </div>
          ) : <div className="small">Select a version and choose Preview Selected.</div>}
        </section>
      </div>

      <div className="recovery-grid">
        <section className="card recovery-section">
          <div className="table-kicker">Server Backups</div>
          <div className="small">Snapshots are stored separately from the main StaffBoard state in DigitalOcean Spaces.</div>
          <select className="recovery-backup-select" aria-label="Select server backup" value={selectedBackupId} onChange={(event) => { setSelectedBackupId(event.target.value); setVerification(null) }}>
            <option value="">Select backup…</option>
            {backups.map((backup) => <option key={backup.id} value={backup.id}>{displayTime(backup.createdAt)} · {backup.kind} · {backup.reason}</option>)}
          </select>
          <div className="recovery-button-row">
            <button className="secondary" type="button" onClick={verifyBackup} disabled={busy || !selectedBackupId}>Verify Backup</button>
            <button className="danger" type="button" onClick={restoreBackup} disabled={busy || !selectedBackupId}>Restore Full Backup</button>
          </div>
          {verification ? (
            <dl className="backup-verification-result">
              <div><dt>Status</dt><dd>{verification.status}</dd></div>
              <div><dt>Checksum</dt><dd>{verification.checksum}</dd></div>
              <div><dt>Size</dt><dd>{verification.sizeBytes} bytes</dd></div>
              <div><dt>State revision</dt><dd>{verification.stateRevision || verification.legacyRevision || '—'}</dd></div>
              <div><dt>Verified</dt><dd>{displayTime(verification.verifiedAt)} by {verification.verifiedBy}</dd></div>
            </dl>
          ) : null}
        </section>

        <section className="card recovery-section">
          <div className="table-kicker">Emergency Administrative Exports</div>
          <div className="small">Downloads are generated from the current server-authoritative state and contain no Spaces credentials.</div>
          <div className="recovery-export-grid">
            <button className="secondary" onClick={() => exportScope('current')} disabled={busy}>Current State</button>
            <button className="secondary" onClick={() => exportScope('week')} disabled={busy}>Selected Week</button>
            <button className="secondary" onClick={() => exportScope('day')} disabled={busy}>Selected Day</button>
            <button className="secondary" onClick={() => exportScope('builders')} disabled={busy}>Builder Master List</button>
            <button className="secondary" onClick={() => exportScope('audit')} disabled={busy}>Audit History</button>
            <button className="secondary" onClick={() => exportScope('actions')} disabled={busy}>Action Records</button>
            <button className="secondary" onClick={() => exportScope('impact')} disabled={busy}>Leadership Impact</button>
          </div>
        </section>
      </div>

      <DiagnosticsPanel />
    </div>
  )
}
