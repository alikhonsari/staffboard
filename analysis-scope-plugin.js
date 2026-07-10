export function analysisScopePlugin() {
  return {
    name: 'staffboard-analysis-scope',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') || code.includes('Analysis Board / Shift Scope')) return null
      const marker = `          <div className="summary-card-block card">\n            <div className="table-title-row">\n              <div>\n                <div className="table-kicker">Saved Week History</div>`
      const block = `          <div className="summary-card-block card">\n            <div className="table-title-row"><div><div className="table-kicker">Analysis Board / Shift Scope</div><div className="small">Current-board analysis stays isolated. Comparison modes are read-only.</div></div><div><select value={analysisScope} onChange={(e) => setAnalysisScope(e.target.value)}><option value="current">Current Board Only</option><option value="day">Day Shifts Only</option><option value="night">Night Shifts Only</option><option value="compareShift">Compare Day vs Night for Current Board Type</option><option value="allBoards">Compare All Board Types</option></select></div></div>\n            <div className="analysis-table-wrap compact"><table><thead><tr><th>Board</th><th>Shift</th><th>HC</th><th>Present</th><th>PTO</th><th>Unassigned</th><th>Completed</th><th>Goal</th><th>Completion</th><th>Normalized TPH</th><th>Required TPH</th></tr></thead><tbody>{analysisComparisonRows.map((row) => <tr key={row.boardId}><td>{row.label}</td><td>{row.shift}</td><td>{row.headcount}</td><td>{row.status.present}</td><td>{row.status.pto}</td><td>{row.status.unassigned}</td><td>{row.completed.toFixed(1)}</td><td>{row.goal.toFixed(1)}</td><td>{row.completion.toFixed(1)}%</td><td>{row.normalizedTPH.toFixed(2)}</td><td>{row.requiredTPH.toFixed(2)}</td></tr>)}</tbody></table></div>\n            <div className="small">Week of {state.weekStartDate} · {state.selectedDay} · Generated {new Date().toLocaleString()} · Admin {enhancementAdmin}</div>\n          </div>\n\n`
      const next = code.replace(marker, block + marker)
      return next === code ? null : { code: next, map: null }
    },
  }
}
