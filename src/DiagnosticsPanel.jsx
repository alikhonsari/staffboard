import React, { useEffect, useState } from 'react'
import { copySanitizedDiagnostics, loadPlatformDiagnostics } from './diagnosticsClient'
import './diagnostics.css'

function value(value, fallback = '—') {
  return value === undefined || value === null || value === '' ? fallback : String(value)
}

export default function DiagnosticsPanel() {
  const [snapshot, setSnapshot] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const refresh = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      setSnapshot(await loadPlatformDiagnostics())
    } catch (loadError) {
      setError(loadError?.message || 'Failed to load diagnostics.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const copy = async () => {
    setMessage('')
    setError('')
    try {
      await copySanitizedDiagnostics(snapshot || {})
      setMessage('Sanitized diagnostics copied.')
    } catch (copyError) {
      setError(copyError?.message || 'Unable to copy diagnostics.')
    }
  }

  const runtime = snapshot?.runtime || {}
  const metrics = snapshot?.metrics || {}

  return (
    <section className="card diagnostics-panel" aria-busy={busy}>
      <div className="diagnostics-header">
        <div>
          <div className="table-kicker">Platform Diagnostics</div>
          <div className="small">Sanitized operational health. Tokens, passwords, database credentials, and state payloads are never shown.</div>
        </div>
        <div className="diagnostics-actions">
          <button className="secondary" type="button" onClick={refresh} disabled={busy}>Refresh</button>
          <button className="secondary" type="button" onClick={copy} disabled={busy || !snapshot}>Copy Diagnostics</button>
        </div>
      </div>

      {message ? <div className="recovery-alert success" role="status">{message}</div> : null}
      {error ? <div className="recovery-alert error" role="alert">{error}</div> : null}

      <div className="diagnostics-status-row">
        <span className={`diagnostics-status ${snapshot?.degraded ? 'warning' : 'healthy'}`}>{snapshot?.degraded ? 'Degraded' : 'Healthy'}</span>
        <span>App {value(snapshot?.applicationVersion)}</span>
        <span>Revision {value(metrics.stateRevision, '0')}</span>
        <span>Updated {value(snapshot?.updatedAt)}</span>
      </div>

      <dl className="diagnostics-grid">
        <div><dt>Storage backend</dt><dd>{snapshot?.storageBackend === 'postgres' ? 'PostgreSQL' : value(snapshot?.storageBackend)}</dd></div>
        <div><dt>PostgreSQL</dt><dd>{snapshot?.postgresConfigured ? 'Connected' : 'Not configured'}</dd></div>
        <div><dt>Last successful read</dt><dd>{value(runtime.lastSuccessfulReadAt)}</dd></div>
        <div><dt>Last successful write</dt><dd>{value(runtime.lastSuccessfulWriteAt)}</dd></div>
        <div><dt>Last reconciliation</dt><dd>{value(runtime.lastReconciliationAt)}</dd></div>
        <div><dt>Read latency</dt><dd>{value(runtime.lastReadDurationMs, '0')} ms</dd></div>
        <div><dt>Write latency</dt><dd>{value(runtime.lastWriteDurationMs, '0')} ms</dd></div>
        <div><dt>State size</dt><dd>{value(metrics.stateBytes, '0')} bytes</dd></div>
        <div><dt>Builders</dt><dd>{value(metrics.builderCount, '0')}</dd></div>
        <div><dt>Pending schedules</dt><dd>{value(metrics.pendingScheduleCount, '0')}</dd></div>
        <div><dt>Backups</dt><dd>{value(snapshot?.backupCount, '0')}</dd></div>
        <div><dt>Version records</dt><dd>{value(snapshot?.versionCount, '0')}</dd></div>
        <div><dt>Commit</dt><dd>{value(snapshot?.commit)}</dd></div>
      </dl>

      {snapshot?.warnings?.length ? (
        <div className="diagnostics-warnings" role="status">
          <strong>Warnings</strong>
          <ul>{snapshot.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      ) : null}

      {runtime.lastError ? <div className="diagnostics-last-error"><strong>Last error:</strong> {runtime.lastError.message}</div> : null}
    </section>
  )
}
