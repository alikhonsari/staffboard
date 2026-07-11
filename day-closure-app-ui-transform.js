export function injectAppUi(code) {
  let next = code
  next = next.replace(
    "{WEEKDAYS.map((day) => (\n                <button key={day} className={state.selectedDay === day ? 'day-tab active' : 'day-tab'} onClick={() => saveState((prev) => ({ ...prev, selectedDay: day }))}>\n                  {day}\n                </button>\n              ))}",
    "{WEEKDAYS.map((day) => {\n                const dayClosure = staffboardClosureForState(state, state.currentBoardId, state.weekStartDate, day)\n                return <button key={day} className={`${state.selectedDay === day ? 'day-tab active' : 'day-tab'}${dayClosure ? ' closed' : ''}`} onClick={() => setState((prev) => ({ ...prev, selectedDay: day }))}>\n                  <span>{day}</span>{dayClosure ? <small>{staffboardClosureReason(dayClosure)}</small> : null}\n                </button>\n              })}",
  )

  next = next.replace(
    '<div className="muted">Last update: <strong>{dayState.updatedAt || \'—\'}</strong></div>',
    `<div className="closure-header-actions">
              <button type="button" className={isDayClosed ? 'secondary closure-control' : 'danger closure-control'} onClick={() => openClosureDialog(isDayClosed ? 'reopen' : 'close')}>
                {isDayClosed ? (activeClosure?.scope === 'entire_day' ? 'Reopen Day' : 'Reopen Shift') : 'Mark Day Closed'}
              </button>
              <div className="muted">Last update: <strong>{dayState.updatedAt || '—'}</strong></div>
            </div>`,
  )

  const marker = `        </div>

        {mainTab === 'board' ? (`
  const content = `        </div>

        {isDayClosed ? (
          <div className="site-closure-banner" role="status" aria-live="polite">
            <div className="site-closure-icon" aria-hidden="true">⛔</div>
            <div>
              <strong>SITE CLOSED — {closureReasonLabel.toUpperCase()}</strong>
              <div>{closureScopeLabel} · {selectedOperationalDate}{activeClosure?.note ? ' · ' + activeClosure.note : ''}</div>
              <small>Closed by {activeClosure?.closedBy || 'Admin'} on {activeClosure?.closedAt ? new Date(activeClosure.closedAt).toLocaleString() : '—'}. Staffing, scheduling, and production calculations are disabled.</small>
            </div>
          </div>
        ) : null}
        {closureMessage ? <div className="closure-toast" role="status">{closureMessage}</div> : null}
        {closureDialogOpen ? (
          <div className="closure-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !closureBusy) setClosureDialogOpen(false) }}>
            <div className="closure-modal" role="dialog" aria-modal="true" aria-labelledby="closure-dialog-title">
              <div className="closure-modal-head">
                <div><div className="table-kicker">{closureDialogMode === 'reopen' ? 'Reopen Operational Day' : 'Mark Operational Day Closed'}</div><h2 id="closure-dialog-title">{state.selectedDay} · {selectedOperationalDate}</h2></div>
                <button type="button" className="mini-btn" disabled={closureBusy} onClick={() => setClosureDialogOpen(false)}>Close</button>
              </div>
              {closureDialogMode === 'close' ? <>
                <div className="row two">
                  <div><label>Closure Reason</label><select value={closureReason} onChange={(event) => setClosureReason(event.target.value)}>{['Holiday', 'Building Closure', 'Severe Weather', 'Maintenance', 'Emergency', 'Planned Shutdown', 'Other'].map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></div>
                  <div><label>Scope</label><select value={closureScope} onChange={(event) => setClosureScope(event.target.value)}><option value="entire_day">Entire Operational Day</option><option value="day_shift">Day Shift Only</option><option value="night_shift">Night Shift Only</option></select></div>
                </div>
                {closureReason === 'Other' ? <div className="row"><div><label>Custom Reason</label><input value={closureCustomReason} onChange={(event) => setClosureCustomReason(event.target.value)} maxLength={160} /></div></div> : null}
                <div className="row"><div><label>Optional Note</label><textarea rows="3" value={closureNote} onChange={(event) => setClosureNote(event.target.value)} maxLength={1000} placeholder="Example: Independence Day — site closed for all operations." /></div></div>
              </> : <div className="closure-reopen-summary"><strong>{closureReasonLabel}</strong><div>{closureScopeLabel} · Closed by {activeClosure?.closedBy || 'Admin'}</div>{activeClosure?.note ? <p>{activeClosure.note}</p> : null}</div>}
              <div className="closure-warning">{closureDialogMode === 'close' ? 'Closing this day will disable staffing and production calculations and cancel pending scheduled clock transitions for the selected scope. Historical data will be preserved.' : 'Reopening will not restore scheduled transitions that were canceled by the closure. New schedules must be created manually.'}</div>
              <label className="closure-confirm"><input type="checkbox" checked={closureConfirmed} onChange={(event) => setClosureConfirmed(event.target.checked)} /> I understand and confirm this operational status change.</label>
              {closureError ? <div className="small status-bad closure-error">{closureError}</div> : null}
              <div className="closure-modal-actions"><button type="button" className="secondary" disabled={closureBusy} onClick={() => setClosureDialogOpen(false)}>Cancel</button><button type="button" className={closureDialogMode === 'close' ? 'danger' : 'primary'} disabled={!closureConfirmed || closureBusy} onClick={runClosureAction}>{closureBusy ? 'Saving…' : closureDialogMode === 'close' ? 'Confirm Closure' : 'Confirm Reopen'}</button></div>
            </div>
          </div>
        ) : null}

        {mainTab === 'board' ? (`
  if (!next.includes('closure-modal-backdrop')) next = next.replace(marker, content)

  next = next.replace(
    `          <div ref={weeklyPdfRef} className="pdf-report-sheet">`,
    `          <div ref={weeklyPdfRef} className="pdf-report-sheet">
            {weekClosureRows.length ? <div className="pdf-card weekly-closure-summary"><div className="table-kicker">Closed Operational Days</div><div className="small">Closed days are excluded from staffing, productivity, TPH, utilization, attendance-exception, and goal-completion averages.</div>{weekClosureRows.map((row) => <div className="weekly-closure-row" key={row.day + row.scope}><strong>{row.day}</strong><span>{row.displayReason}</span><span>{STAFFBOARD_CLOSURE_SCOPE_LABELS[row.scope]}</span><span>Excluded — Site Closed</span></div>)}</div> : null}`,
  )
  return next
}
