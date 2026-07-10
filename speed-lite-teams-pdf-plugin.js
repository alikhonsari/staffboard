export function speedLiteTeamsPdfPlugin() {
  return {
    name: 'staffboard-speed-lite-teams-pdf',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      if (!next.includes('Daily Speed Lite Teams')) {
        const weeklyMarker = '          <div ref={weeklyPdfRef} className="pdf-report-sheet">'
        const weeklyIndex = next.indexOf(weeklyMarker)
        const closeIndex = weeklyIndex >= 0 ? next.lastIndexOf('          </div>', weeklyIndex) : -1
        if (closeIndex >= 0) {
          const section = `            <div className="pdf-report-section-title">Daily Speed Lite Teams</div>
            <div className="pdf-chart-card pdf-table-card">
              <table className="pdf-mini-table">
                <thead><tr><th>Team</th><th>Target</th><th>Active</th><th>Status</th><th>Team Lead</th><th>Builders</th><th>Team Hours</th></tr></thead>
                <tbody>{speedLiteTeamsEnabled && speedLiteTeamRows.length ? speedLiteTeamRows.map((team) => <tr key={team.id}><td>{team.name}</td><td>{team.targetSize}</td><td>{team.activeMembers.length}</td><td>{team.status.label}</td><td>{team.teamLead?.name || '—'}</td><td>{team.members.map((builder) => builder.name).join(', ') || '—'}</td><td>{team.hours.toFixed(2)}</td></tr>) : <tr><td colSpan="7">No Speed Lite teams for this day.</td></tr>}<tr><td><strong>Ungrouped</strong></td><td>—</td><td>{speedLiteUngroupedActiveBuilders.length}</td><td>{speedLiteUngroupedActiveBuilders.length ? 'Needs grouping' : 'Clear'}</td><td>—</td><td>{speedLiteUngroupedBuilders.map((builder) => builder.name).join(', ') || '—'}</td><td>—</td></tr></tbody>
              </table>
            </div>

`
          next = next.slice(0, closeIndex) + section + next.slice(closeIndex)
        }
      }

      if (!next.includes('Weekly Speed Lite Team Summary')) {
        const mainMarker = '        </div>\n\n      </main>'
        const mainIndex = next.lastIndexOf(mainMarker)
        const closeIndex = mainIndex >= 0 ? next.lastIndexOf('          </div>', mainIndex) : -1
        if (closeIndex >= 0) {
          const section = `            <div className="pdf-report-section-title">Weekly Speed Lite Team Summary</div>
            <div className="pdf-chart-card pdf-table-card">
              <table className="pdf-mini-table">
                <thead><tr><th>Day</th><th>Team</th><th>Target</th><th>Active</th><th>Status</th><th>Team Lead</th><th>Team Hours</th></tr></thead>
                <tbody>{speedLiteWeeklyTeamRows.length ? speedLiteWeeklyTeamRows.map((team, index) => { const dayData = state.weeklyData?.[team.day] || defaultDay(); const leadName = state.builderPool.find((builder) => builder.id === team.teamLeadBuilderId)?.name || '—'; return <tr key={team.day + '-' + team.id + '-' + index}><td>{team.day}</td><td>{team.name}</td><td>{team.targetSize}</td><td>{team.activeCount}</td><td>{team.status.label}</td><td>{leadName}</td><td>{team.hours.toFixed(2)}</td></tr> }) : <tr><td colSpan="7">No Speed Lite team records for this week.</td></tr>}</tbody>
              </table>
            </div>
            <div className="pdf-chart-card pdf-table-card">
              <table className="pdf-mini-table">
                <thead><tr><th>Day</th><th>Speed Lite HC</th><th>Teams</th><th>Complete</th><th>Ungrouped</th><th>Team Changes</th></tr></thead>
                <tbody>{speedLiteStaffingByDay.map((row) => <tr key={row.day}><td>{row.day}</td><td>{row.activeCount}</td><td>{row.teams.length}</td><td>{row.teams.filter((team) => team.status.key === 'complete').length}</td><td>{row.ungroupedCount}</td><td>{row.changes}</td></tr>)}</tbody>
              </table>
            </div>

`
          next = next.slice(0, closeIndex) + section + next.slice(closeIndex)
        }
      }

      return next === code ? null : { code: next, map: null }
    },
  }
}
