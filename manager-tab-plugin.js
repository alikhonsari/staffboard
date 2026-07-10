export function managerTabPlugin() {
  return {
    name: 'staffboard-manager-tab',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') || code.includes('Manager Dashboard View')) return null
      const panel = `        ) : mainTab === 'manager' ? (
        <div className="board-shell">
          <div className="board-header">
            <div>
              <div className="title">Manager Dashboard View</div>
              <div style={{ marginTop: 8 }}><span className="pill">{boardLabel}</span><span className="pill">{activeScopeShift}</span><span className="pill">Week of {state.weekStartDate}</span><span className="pill">{state.selectedDay}</span><span className="pill">Admin: {enhancementAdmin}</span></div>
            </div>
            <div className="board-header-actions"><button className="secondary mini-nav-btn" onClick={() => copySlack('daily')}>Copy Slack Summary</button><button className="secondary mini-nav-btn" onClick={copyHandoffSlack}>Copy Shift Handoff</button><button className="secondary mini-nav-btn" onClick={exportShiftComparisonCsv}>Export Day vs Night CSV</button><button className="secondary mini-nav-btn" onClick={exportAnalysisPNG}>Export PNG</button></div>
          </div>

          <div className="summary-grid">
            {[["Total Shift HC", laborShareStats.totalShiftHeadcount],["SPEED Production HC", laborShareStats.speedProductionHeadcount],["Labor Share HC", laborShareStats.laborShareHeadcount],["Labor-Shared Line Leads", laborShareStats.laborSharedLineLeads],["Line Leads", laborShareStats.lineLeadHeadcount],["Support / Indirect", laborShareStats.supportIndirectHeadcount],["Unassigned", laborShareStats.unassignedHeadcount],["Live SPEED TPH", isSpeedBoard ? currentLiveTPH.toFixed(2) : 'N/A'],["Required SPEED TPH", isSpeedBoard ? metrics.requiredTPH.toFixed(2) : 'N/A'],["Goal Completion", efficiencyPct.toFixed(0) + '%'],["Risk", currentLiveTPH >= metrics.requiredTPH ? 'Ahead / On Target' : 'Behind']].map(([label, value]) => <div className="summary-card kpi-highlight-card" key={label}><div className="summary-label">{label}</div><div className="summary-value">{value}</div></div>)}
          </div>

          <div className="summary-card-block card labor-share-detail-card">
            <div className="table-title-row"><div><div className="table-kicker">Current Labor Share Detail</div><div className="small">These people remain in Total Shift HC but are excluded from the SPEED TPH denominator.</div></div><div className="analysis-chip-wrap">{laborShareAreaCounts.map((area) => <span className="analysis-chip labor-share-chip" key={area.name}>{area.name}: {area.count}</span>)}</div></div>
            <div className="analysis-table-wrap compact"><table><thead><tr><th>Builder</th><th>Line Lead</th><th>Area</th><th>Hours</th><th>Previous Production Area</th><th>Moved By</th></tr></thead><tbody>{laborShareDetailRows.length ? laborShareDetailRows.map((row) => <tr key={row.builder.id}><td>{row.builder.name}</td><td>{row.profile.isLineLead ? 'Yes' : 'No'}</td><td>{row.area}</td><td>{row.hours.toFixed(2)}</td><td>{row.previousProductionArea}</td><td>{row.admin}</td></tr>) : <tr><td colSpan="6">No active labor-share assignments.</td></tr>}</tbody></table></div>
          </div>

          <div className="summary-card-block card">
            <div className="table-title-row"><div><div className="table-kicker">Read-only Day vs Night Comparison</div><div className="small">Same board type, same week, and same selected day. Comparison does not modify either shift.</div></div></div>
            <div className="analysis-table-wrap compact"><table><thead><tr><th>Shift</th><th>Total HC</th><th>Labor Share HC</th><th>Weekly Labor Share Hours</th><th>Completed</th><th>Goal</th><th>Completion</th><th>Normalized TPH</th></tr></thead><tbody>{[activeBoardSummary, counterpartBoardSummary].sort((a, b) => a.shift.localeCompare(b.shift)).map((row) => { const labor = laborShareShiftComparison.find((item) => item.boardId === row.boardId); return <tr key={row.boardId}><td>{row.shift}</td><td>{row.headcount}</td><td>{labor?.selectedDayHeadcount || 0}</td><td>{Number(labor?.hours || 0).toFixed(2)}</td><td>{row.completed.toFixed(1)}</td><td>{row.goal.toFixed(1)}</td><td>{row.completion.toFixed(1)}%</td><td>{row.normalizedTPH.toFixed(2)}</td></tr> })}</tbody></table></div>
          </div>

          <div className="two-col-layout">
            <div className="summary-card-block card"><div className="table-kicker">Operational Risk Flags</div><div className="list">{activeRiskFlags.length ? activeRiskFlags.map((flag, index) => <div className="group-summary-card" key={index}><strong className="status-bad">{flag}</strong></div>) : <div className="small status-good">No active risk flags detected.</div>}</div></div>
            <div className="summary-card-block card"><div className="table-kicker">Shift Handoff Notes</div><div className="small">Notes are isolated to {boardLabel}.</div><textarea rows="6" value={state.handoffNotes || ''} onChange={(e) => saveState((prev) => ({ ...prev, handoffNotes: e.target.value }))} placeholder="Open work, blockers, labor share, staffing risks, and next-shift priorities..." /><button className="secondary" onClick={copyHandoffSlack}>Copy Handoff-ready Slack Summary</button></div>
          </div>

          <div className="two-col-layout">
            <div className="summary-card-block card"><div className="table-kicker">Production Bottleneck Areas</div><div className="list">{areaCounts.filter((a) => a.areaType === 'production' && Number(a.capacity || 0) > 0).map((a) => <div className="list-row" key={a.name}><div>{a.name}</div><div>{a.count}/{a.capacity}</div><div className={a.count < Number(a.capacity || 0) ? 'status-bad' : 'status-good'}>{a.count < Number(a.capacity || 0) ? 'Short ' + (Number(a.capacity || 0) - a.count) : 'Covered'}</div></div>)}</div></div>
            <div className="summary-card-block card"><div className="table-kicker">Current Shift Staffing Exceptions</div><div className="list">{auditVisibleRows.filter((r) => String(r.newValue || '').match(/PTO|Absent|LOA|VTO|Labor Share/i) || String(r.action || '').match(/PTO|Absent|LOA|VTO|Labor Share/i)).slice(0, 10).map((r, i) => <div className="list-row" key={i}><div>{r.builder || '—'}</div><div>{r.action}</div><div>{r.newValue}</div></div>)}</div></div>
          </div>
        </div>
`
      const next = code.replace("        ) : mainTab === 'comments' ? (", panel + "        ) : mainTab === 'comments' ? (")
      return next === code ? null : { code: next, map: null }
    },
  }
}
