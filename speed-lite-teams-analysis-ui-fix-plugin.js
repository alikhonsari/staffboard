export function speedLiteTeamsAnalysisUiFixPlugin() {
  return {
    name: 'staffboard-speed-lite-teams-analysis-ui-fix',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') || code.includes('Speed Lite Team Analysis')) return null
      const titleMarker = '<div className="table-kicker">Saved Week History</div>'
      const titleIndex = code.indexOf(titleMarker)
      const insertIndex = titleIndex >= 0 ? code.lastIndexOf('<div className="summary-card-block card">', titleIndex) : -1
      if (insertIndex < 0) return null
      const panel = `          {speedLiteTeamsEnabled ? (
            <div className="summary-card-block card">
              <div className="table-title-row"><div><div className="table-kicker">Speed Lite Team Analysis</div><div className="small">Team hours are a breakdown of Speed Lite production hours. No team productivity is estimated without team-level output data.</div></div><span className="pill">{boardLabel}</span></div>
              <div className="summary-grid">
                {[["Current Speed Lite HC", speedLiteTeamMetrics.headcount],["Current Teams", speedLiteTeamMetrics.configuredTeams],["Current Ungrouped", speedLiteTeamMetrics.ungrouped],["Weekly Ungrouped Hours", speedLiteWeeklyUngroupedHours.toFixed(2)],["Weekly Team Changes", speedLiteWeeklyChanges],["Complete Team-Days", speedLiteWeeklyTeamRows.filter((row) => row.status.key === 'complete').length]].map(([label, value]) => <div className="summary-card kpi-highlight-card" key={label}><div className="summary-label">{label}</div><div className="summary-value">{value}</div></div>)}
              </div>
              <div className="two-col-layout">
                <div><div className="table-kicker">Hours by Team</div><div className="analysis-table-wrap compact"><table><thead><tr><th>Team</th><th>Hours</th><th>Actual Builder-Days</th><th>Target Builder-Days</th></tr></thead><tbody>{speedLiteTeamHoursByName.length ? speedLiteTeamHoursByName.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.hours.toFixed(2)}</td><td>{row.activeBuilderDays}</td><td>{row.targetBuilderDays}</td></tr>) : <tr><td colSpan="4">No team hours recorded.</td></tr>}</tbody></table></div></div>
                <div><div className="table-kicker">Hours by Builder within Team</div><div className="analysis-table-wrap compact"><table><thead><tr><th>Builder</th><th>Team</th><th>Hours</th></tr></thead><tbody>{speedLiteBuilderTeamHours.length ? speedLiteBuilderTeamHours.map((row) => <tr key={row.builder.id + row.teamName}><td>{row.builder.name}</td><td>{row.teamName}</td><td>{row.hours.toFixed(2)}</td></tr>) : <tr><td colSpan="3">No builder team hours recorded.</td></tr>}</tbody></table></div></div>
              </div>
              <div className="two-col-layout">
                <div><div className="table-kicker">Team Staffing by Day</div><div className="analysis-table-wrap compact"><table><thead><tr><th>Day</th><th>Speed Lite HC</th><th>Teams</th><th>Complete</th><th>Ungrouped</th><th>Changes</th></tr></thead><tbody>{speedLiteStaffingByDay.map((row) => <tr key={row.day}><td>{row.day}</td><td>{row.activeCount}</td><td>{row.teams.length}</td><td>{row.teams.filter((team) => team.status.key === 'complete').length}</td><td>{row.ungroupedCount}</td><td>{row.changes}</td></tr>)}</tbody></table></div></div>
                <div><div className="table-kicker">Day vs Night Speed Lite Teams</div><div className="analysis-table-wrap compact"><table><thead><tr><th>Shift</th><th>Selected Day HC</th><th>Team-Days</th><th>Complete Team-Days</th><th>Ungrouped Builder-Days</th><th>Team Hours</th></tr></thead><tbody>{speedLiteShiftComparison.map((row) => <tr key={row.boardId}><td>{row.shift}</td><td>{row.selectedDayHC}</td><td>{row.teamCount}</td><td>{row.completeTeamDays}</td><td>{row.ungroupedBuilderDays}</td><td>{row.teamHours.toFixed(2)}</td></tr>)}</tbody></table></div></div>
              </div>
              <div><div className="table-kicker">Weekly Team Utilization Trend</div><div className="analysis-table-wrap compact"><table><thead><tr><th>Week</th><th>Configured Team-Days</th><th>Complete Team-Days</th><th>Utilization</th><th>Ungrouped Builder-Days</th></tr></thead><tbody>{speedLiteTeamTrend.length ? speedLiteTeamTrend.map((row) => <tr key={row.weekStart}><td>{row.weekStart}</td><td>{row.configured}</td><td>{row.complete}</td><td>{row.utilization.toFixed(1)}%</td><td>{row.ungrouped}</td></tr>) : <tr><td colSpan="5">No team history available.</td></tr>}</tbody></table></div></div>
            </div>
          ) : null}

`
      const next = code.slice(0, insertIndex) + panel + code.slice(insertIndex)
      return { code: next, map: null }
    },
  }
}
