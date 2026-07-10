export function suggestionsTabPlugin() {
  return {
    name: 'staffboard-suggestions-tab',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') || code.includes('Smart Staffing Suggestions')) return null
      const panel = `        ) : mainTab === 'suggestions' ? (
        <div className="board-shell">
          <div className="board-header"><div><div className="title">Smart Staffing Suggestions</div><div style={{ marginTop: 8 }}><span className="pill">{boardLabel}</span><span className="pill">{state.selectedDay}</span><span className="pill">Unassigned {counts.unassigned}</span></div></div><div className="muted">Suggestions use skills, area capacity, unassigned builders, and weekly hours.</div></div>
          <div className="summary-card-block card"><div className="table-kicker">Recommended Moves</div><div className="list">{staffingSuggestions.length ? staffingSuggestions.map((s, i) => <div className="group-summary-card" key={i}><strong>{s.title}</strong><div className="small">{s.reason}</div></div>) : <div className="small">No suggestions right now. Staffing looks covered.</div>}</div></div>
        </div>
`
      const next = code.replace("        ) : mainTab === 'comments' ? (", panel + "        ) : mainTab === 'comments' ? (")
      return next === code ? null : { code: next, map: null }
    },
  }
}
