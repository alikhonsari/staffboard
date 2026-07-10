export function auditTabPlugin() {
  return {
    name: 'staffboard-audit-tab',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') || code.includes('Change History / Audit Log')) return null
      const panel = `        ) : mainTab === 'audit' ? (
        <div className="board-shell">
          <div className="board-header">
            <div><div className="title">Change History / Audit Log</div><div style={{ marginTop: 8 }}><span className="pill">Admin: {enhancementAdmin}</span><span className="pill">{boardLabel}</span><span className="pill">{activeScopeShift}</span><span className="pill">Week of {state.weekStartDate}</span></div></div>
            <div className="muted">Defaults to the active board. Expand scope only when intentionally reviewing other shifts.</div>
          </div>
          <div className="summary-card-block card">
            <div className="row two">
              <div><label>Search Audit Log</label><input id="auditSearch" placeholder="admin, day, builder, action..." onChange={() => setTick(Date.now())} /></div>
              <div><label>Audit Scope</label><select value={auditScope} onChange={(e) => setAuditScope(e.target.value)}><option value="currentBoard">Current Board Only</option><option value="currentShift">Current Shift Across Boards</option><option value="day">Day Shifts Only</option><option value="night">Night Shifts Only</option><option value="all">All Boards and Shifts</option></select></div>
            </div>
            <div className="small">Current context: {state.currentBoardId} · {activeScopeShift} · Week {weekInfo.week} · {state.selectedDay}</div>
            <div className="analysis-table-wrap compact"><table><thead><tr><th>Time</th><th>Admin</th><th>Board ID</th><th>Board</th><th>Shift</th><th>Week</th><th>Day</th><th>Builder</th><th>Action</th><th>Old</th><th>New</th></tr></thead><tbody>{auditVisibleRows.length ? auditVisibleRows.map((r, i) => <tr key={i}><td>{r.timestamp}</td><td>{r.admin}</td><td>{r.boardId || 'Legacy'}</td><td>{r.board}</td><td>{r.shift}</td><td>{r.week}</td><td>{r.day}</td><td>{r.builder || '—'}</td><td>{r.action}</td><td>{r.oldValue || '—'}</td><td>{r.newValue || '—'}</td></tr>) : <tr><td colSpan="11" className="small">No matching audit entries in this scope.</td></tr>}</tbody></table></div>
          </div>
        </div>
`
      const next = code.replace("        ) : mainTab === 'comments' ? (", panel + "        ) : mainTab === 'comments' ? (")
      return next === code ? null : { code: next, map: null }
    },
  }
}
