export function managerTabPlugin() {
  return {
    name: 'staffboard-manager-tab',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') || code.includes('Manager Dashboard View')) return null
      const panel = `        ) : mainTab === 'manager' ? (
        <div className="board-shell">
          <div className="board-header">
            <div><div className="title">Manager Dashboard View</div><div style={{ marginTop: 8 }}><span className="pill">{boardLabel}</span><span className="pill">Week of {state.weekStartDate}</span><span className="pill">{state.selectedDay}</span></div></div>
            <div className="board-header-actions"><button className="secondary mini-nav-btn" onClick={() => copySlack('daily')}>Copy Slack Summary</button><button className="secondary mini-nav-btn" onClick={exportAnalysisPNG}>Export PNG</button></div>
          </div>
          <div className="summary-grid">
            {[["Total HC", totalHeadCount],["Present", counts.present],["PTO", counts.pto],["LOA", counts.loa],["VTO", counts.vto],["Absent", counts.absent],["Unassigned", counts.unassigned],["Line Leads", counts.lineLeads],["Live TPH", currentLiveTPH.toFixed(1)],["Required TPH", metrics.requiredTPH.toFixed(1)],["Goal Completion", efficiencyPct.toFixed(0) + '%'],["Risk", currentLiveTPH >= metrics.requiredTPH ? 'Ahead / On Target' : 'Behind']].map(([label, value]) => <div className="summary-card kpi-highlight-card" key={label}><div className="summary-label">{label}</div><div className="summary-value">{value}</div></div>)}
          </div>
          <div className="two-col-layout">
            <div className="summary-card-block card"><div className="table-kicker">Top Bottleneck Areas</div><div className="list">{areaCounts.filter((a) => a.name !== 'Unassigned' && Number(a.capacity || 0) > 0).map((a) => <div className="list-row" key={a.name}><div>{a.name}</div><div>{a.count}/{a.capacity}</div><div className={a.count < Number(a.capacity || 0) ? 'status-bad' : 'status-good'}>{a.count < Number(a.capacity || 0) ? 'Short ' + (Number(a.capacity || 0) - a.count) : 'Covered'}</div></div>)}</div></div>
            <div className="summary-card-block card"><div className="table-kicker">Staffing Exceptions</div><div className="list">{auditRows.filter((r) => String(r.newValue || '').match(/PTO|Absent|LOA|VTO/i) || String(r.action || '').match(/PTO|Absent|LOA|VTO/i)).slice(0, 8).map((r, i) => <div className="list-row" key={i}><div>{r.builder || '—'}</div><div>{r.action}</div><div>{r.newValue}</div></div>)}</div></div>
          </div>
        </div>
`
      const next = code.replace("        ) : mainTab === 'comments' ? (", panel + "        ) : mainTab === 'comments' ? (")
      return next === code ? null : { code: next, map: null }
    },
  }
}
