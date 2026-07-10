export function suggestionsTabPlugin() {
  return {
    name: 'staffboard-suggestions-tab',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') || code.includes('Smart Staffing Suggestions')) return null
      const panel = `        ) : mainTab === 'suggestions' ? (
        <div className="board-shell">
          <div className="board-header">
            <div><div className="title">Smart Staffing Suggestions</div><div style={{ marginTop: 8 }}><span className="pill">{boardLabel}</span><span className="pill">{activeScopeShift}</span><span className="pill">{state.selectedDay}</span><span className="pill">Week {weekInfo.week}</span><span className="pill">Unassigned {counts.unassigned}</span></div></div>
            <div className="muted">Recommendations use only the active board, shift, week, roster, skills, capacity, and hours.</div>
          </div>
          <div className="two-col-layout">
            <div className="summary-card-block card"><div className="table-kicker">Recommended Moves</div><div className="list">{staffingSuggestions.length ? staffingSuggestions.map((s, i) => <div className="group-summary-card" key={i}><div className="small">Scope: {state.currentBoardId} · {activeScopeShift}</div><strong>{s.title}</strong><div className="small">{s.reason}</div></div>) : <div className="small">No suggestions right now. Staffing looks covered.</div>}</div></div>
            <div className="summary-card-block card"><div className="table-kicker">Active Operational Risk Flags</div><div className="list">{activeRiskFlags.length ? activeRiskFlags.map((flag, index) => <div className="group-summary-card" key={index}><strong className="status-bad">{flag}</strong><div className="small">Applies to {boardLabel} · {state.selectedDay}</div></div>) : <div className="small status-good">No active risk flags detected for this shift.</div>}</div></div>
          </div>
          <div className="summary-card-block card"><div className="table-kicker">Suggestion Inputs</div><div className="chiprow"><div className="chip"><span>Board</span><span className="numchip">{activeBoardTypeLabel}</span></div><div className="chip"><span>Shift</span><span className="numchip">{activeScopeShift}</span></div><div className="chip"><span>Active HC</span><span className="numchip">{totalHeadCount}</span></div><div className="chip"><span>Weekly Hours Rows</span><span className="numchip">{builderWeeklyAreaHours.length}</span></div><div className="chip"><span>Skill Flags Available</span><span className="numchip">8</span></div></div></div>
        </div>
`
      const next = code.replace("        ) : mainTab === 'comments' ? (", panel + "        ) : mainTab === 'comments' ? (")
      return next === code ? null : { code: next, map: null }
    },
  }
}
