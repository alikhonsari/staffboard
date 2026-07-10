export function speedLiteTeamsManagerPlugin() {
  return {
    name: 'staffboard-speed-lite-teams-manager',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') || code.includes('Speed Lite Team Health')) return null
      const marker = `          <div className="summary-card-block card">
             <div className="table-title-row"><div><div className="table-kicker">Read-only Day vs Night Comparison</div>`
      const panel = `          {speedLiteTeamsEnabled ? (
            <div className="summary-card-block card">
              <div className="table-title-row"><div><div className="table-kicker">Speed Lite Team Health</div><div className="small">Current SPEED board, shift, week, and selected day only. Team hours are a breakdown of Speed Lite production hours, not additional hours.</div></div><span className="pill">Speed Lite HC {speedLiteTeamMetrics.headcount}</span></div>
              <div className="summary-grid">
                {[["Speed Lite HC", speedLiteTeamMetrics.headcount],["Configured Teams", speedLiteTeamMetrics.configuredTeams],["Active Teams", speedLiteTeamMetrics.activeTeams],["Complete Teams", speedLiteTeamMetrics.completeTeams],["Understaffed", speedLiteTeamMetrics.understaffedTeams],["Over Target", speedLiteTeamMetrics.overTargetTeams],["Ungrouped", speedLiteTeamMetrics.ungrouped],["Average Team Size", speedLiteTeamMetrics.averageTeamSize.toFixed(1)],["Team Leads", speedLiteTeamMetrics.teamLeads]].map(([label, value]) => <div className="summary-card kpi-highlight-card" key={label}><div className="summary-label">{label}</div><div className="summary-value">{value}</div></div>)}
              </div>
              <div className="analysis-table-wrap compact speed-lite-team-summary-table"><table><thead><tr><th>Team</th><th>Target</th><th>Active</th><th>Status</th><th>Team Lead</th><th>Builders</th><th>Team Hours</th></tr></thead><tbody>{speedLiteTeamRows.length ? speedLiteTeamRows.map((team) => <tr key={team.id}><td>{team.name}</td><td>{team.targetSize}</td><td>{team.activeMembers.length}</td><td>{team.status.label}</td><td>{team.teamLead?.name || '—'}</td><td>{team.members.map((builder) => builder.name).join(', ') || '—'}</td><td>{team.hours.toFixed(2)}</td></tr>) : <tr><td colSpan="7">No Speed Lite teams created for this day.</td></tr>}<tr><td><strong>Ungrouped</strong></td><td>—</td><td>{speedLiteUngroupedActiveBuilders.length}</td><td>{speedLiteUngroupedActiveBuilders.length ? 'Needs grouping' : 'Clear'}</td><td>—</td><td>{speedLiteUngroupedBuilders.map((builder) => builder.name).join(', ') || '—'}</td><td>—</td></tr></tbody></table></div>
            </div>
          ) : null}

`
      const next = code.replace(marker, panel + marker)
      return next === code ? null : { code: next, map: null }
    },
  }
}
