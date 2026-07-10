export function speedLiteTeamsAnalysisPlugin() {
  return {
    name: 'staffboard-speed-lite-teams-analysis',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      if (!next.includes('const speedLiteWeeklyTeamRows =')) {
        const marker = '  return (\n    <div className={state.darkMode ? "app dark" : "app"}'
        const logic = `  const summarizeSpeedLiteDayData = (sourceDay, day, weekStart) => {
    const teams = normalizeSpeedLiteTeams(sourceDay)
    const assignments = sourceDay?.assignments || {}
    const assignedEntries = Object.entries(assignments).filter(([, assignment]) => (assignment.area || '') === 'Speed Lite')
    const activeEntries = assignedEntries.filter(([, assignment]) => staffedStatuses().includes(assignment.status || 'Present'))
    const validIds = new Set(teams.map((team) => team.id))
    const rows = teams.map((team) => {
      const members = assignedEntries.filter(([, assignment]) => String(assignment.speedLiteTeamId || '') === team.id)
      const activeMembers = members.filter(([, assignment]) => staffedStatuses().includes(assignment.status || 'Present'))
      const hours = members.reduce((sum, [, assignment]) => sum + speedLiteTeamHoursForAssignment(assignment, team.id, day, weekStart), 0)
      return { ...team, memberIds: members.map(([builderId]) => builderId), activeCount: activeMembers.length, hours, status: speedLiteTeamStatus(team, activeMembers.length) }
    })
    const ungroupedEntries = assignedEntries.filter(([, assignment]) => !validIds.has(String(assignment.speedLiteTeamId || '')))
    const ungroupedActive = ungroupedEntries.filter(([, assignment]) => staffedStatuses().includes(assignment.status || 'Present'))
    const ungroupedHours = ungroupedEntries.reduce((sum, [, assignment]) => {
      const totals = computeHoursForAssignment(assignment, day, weekStart)
      return sum + Number(totals['Speed Lite'] || 0)
    }, 0)
    return { day, teams: rows, assignedCount: assignedEntries.length, activeCount: activeEntries.length, ungroupedCount: ungroupedActive.length, ungroupedHours, changes: Array.isArray(sourceDay?.speedLiteTeamHistory) ? sourceDay.speedLiteTeamHistory.length : 0 }
  }

  const speedLiteWeeklyTeamRows = WEEKDAYS.flatMap((day) => summarizeSpeedLiteDayData(state.weeklyData?.[day] || defaultDay(), day, state.weekStartDate).teams.map((team) => ({ day, ...team })))
  const speedLiteTeamHoursByName = Object.values(speedLiteWeeklyTeamRows.reduce((acc, row) => {
    const key = row.name
    if (!acc[key]) acc[key] = { name: row.name, hours: 0, activeBuilderDays: 0, targetBuilderDays: 0 }
    acc[key].hours += row.hours
    acc[key].activeBuilderDays += row.activeCount
    acc[key].targetBuilderDays += row.targetSize
    return acc
  }, {})).sort((a, b) => b.hours - a.hours)
  const speedLiteBuilderTeamHours = Object.values(WEEKDAYS.flatMap((day) => {
    const sourceDay = state.weeklyData?.[day] || defaultDay()
    return Object.entries(sourceDay.assignments || {}).filter(([, assignment]) => (assignment.area || '') === 'Speed Lite' && assignment.speedLiteTeamId).map(([builderId, assignment]) => ({ builderId, day, assignment }))
  }).reduce((acc, row) => {
    const builder = state.builderPool.find((item) => item.id === row.builderId)
    const team = normalizeSpeedLiteTeams(state.weeklyData?.[row.day] || defaultDay()).find((item) => item.id === String(row.assignment.speedLiteTeamId || ''))
    if (!builder || !team) return acc
    const key = builder.id + '|' + team.name
    if (!acc[key]) acc[key] = { builder, teamName: team.name, hours: 0 }
    acc[key].hours += speedLiteTeamHoursForAssignment(row.assignment, team.id, row.day, state.weekStartDate)
    return acc
  }, {})).sort((a, b) => b.hours - a.hours)
  const speedLiteStaffingByDay = WEEKDAYS.map((day) => summarizeSpeedLiteDayData(state.weeklyData?.[day] || defaultDay(), day, state.weekStartDate))
  const speedLiteWeeklyUngroupedHours = speedLiteStaffingByDay.reduce((sum, row) => sum + row.ungroupedHours, 0)
  const speedLiteWeeklyChanges = speedLiteStaffingByDay.reduce((sum, row) => sum + row.changes, 0)

  const speedLiteShiftComparison = ['speed_day', 'speed_night'].map((boardId) => {
    const boardState = getScopedBoardState(boardId)
    const weekData = getScopedWeekData(boardState)
    const dailyRows = WEEKDAYS.map((day) => summarizeSpeedLiteDayData(weekData?.[day] || defaultDay(), day, state.weekStartDate))
    return {
      boardId,
      shift: BOARD_PRESETS[boardId]?.shift || boardId,
      selectedDayHC: dailyRows.find((row) => row.day === state.selectedDay)?.activeCount || 0,
      teamCount: dailyRows.reduce((sum, row) => sum + row.teams.length, 0),
      completeTeamDays: dailyRows.reduce((sum, row) => sum + row.teams.filter((team) => team.status.key === 'complete').length, 0),
      ungroupedBuilderDays: dailyRows.reduce((sum, row) => sum + row.ungroupedCount, 0),
      teamHours: dailyRows.reduce((sum, row) => sum + row.teams.reduce((subtotal, team) => subtotal + team.hours, 0), 0),
    }
  })

  const speedLiteTeamWeeklyTrendRows = Object.entries({ ...(state.weeklyBoards || {}), [toMonday(state.weekStartDate)]: state.weeklyData }).map(([weekStart, weekData]) => {
    const dailyRows = WEEKDAYS.map((day) => summarizeSpeedLiteDayData(weekData?.[day] || defaultDay(), day, weekStart))
    const configured = dailyRows.reduce((sum, row) => sum + row.teams.length, 0)
    const complete = dailyRows.reduce((sum, row) => sum + row.teams.filter((team) => team.status.key === 'complete').length, 0)
    return { weekStart: toMonday(weekStart), configured, complete, utilization: configured > 0 ? complete / configured * 100 : 0, ungrouped: dailyRows.reduce((sum, row) => sum + row.ungroupedCount, 0) }
  }).reduce((acc, row) => { acc[row.weekStart] = row; return acc }, {})
  const speedLiteTeamTrend = Object.values(speedLiteTeamWeeklyTrendRows).sort((a, b) => a.weekStart.localeCompare(b.weekStart)).slice(-8)

`
        next = next.replace(marker, logic + marker)
      }

      const savedMarker = `          <div className="summary-card-block card">
             <div className="table-title-row">
               <div>
                 <div className="table-kicker">Saved Week History</div>`
      if (!next.includes('Speed Lite Team Analysis')) {
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
        next = next.replace(savedMarker, panel + savedMarker)
      }

      return next === code ? null : { code: next, map: null }
    },
  }
}
