export function laborShareAnalysisPlugin() {
  return {
    name: 'staffboard-labor-share-analysis',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      if (!next.includes('const laborShareHoursByBuilder =')) {
        const marker = '  const maxBuilderWeeklyHours = useMemo('
        const logic = `  const weeklyProductionHours = builderWeeklyAreaHours.reduce((sum, row) => {
    const profile = normalizeBuilderProfile(row.builder)
    return sum + row.areas.filter(([area]) => areaTypeFor(area) === 'production' && (!profile.isLineLead || profile.countsAsProductionLabor)).reduce((subtotal, [, hours]) => subtotal + Number(hours || 0), 0)
  }, 0)
  const weeklySupportHours = builderWeeklyAreaHours.reduce((sum, row) => sum + row.areas.filter(([area]) => areaTypeFor(area) === 'support').reduce((subtotal, [, hours]) => subtotal + Number(hours || 0), 0), 0)
  const weeklyLineLeadHours = builderWeeklyAreaHours.filter((row) => normalizeBuilderProfile(row.builder).isLineLead).reduce((sum, row) => sum + Number(row.totalHours || 0), 0)
  const laborShareHoursByBuilder = Object.values(weeklyLaborShareRows.reduce((acc, row) => {
    const key = row.builder.id
    if (!acc[key]) acc[key] = { builder: row.builder, hours: 0 }
    acc[key].hours += row.hours
    return acc
  }, {})).sort((a, b) => b.hours - a.hours)
  const laborShareHoursByArea = Object.entries(weeklyLaborShareRows.reduce((acc, row) => {
    acc[row.area] = (acc[row.area] || 0) + row.hours
    return acc
  }, {})).map(([area, hours]) => ({ area, hours })).sort((a, b) => b.hours - a.hours)
  const laborShareHoursByDay = WEEKDAYS.map((day) => ({ day, hours: weeklyLaborShareRows.filter((row) => row.day === day).reduce((sum, row) => sum + row.hours, 0) }))

  const calculateLaborShareForWeek = (weekData, weekStart, boardId, areaDefs) => {
    const normalizedAreas = normalizeAreaDefinitions(areaDefs || BOARD_PRESETS[boardId]?.areaDefs || [], boardId)
    const typeFor = (areaName) => normalizedAreas.find((area) => area.name === (areaName || 'Unassigned'))?.areaType || inferredAreaType(areaName, boardId)
    let hours = 0
    let selectedDayHeadcount = 0
    WEEKDAYS.forEach((day) => {
      const assignments = weekData?.[day]?.assignments || {}
      Object.values(assignments).forEach((assignment) => {
        if (!staffedStatuses().includes(assignment.status || 'Present')) return
        if (typeFor(assignment.area || 'Unassigned') !== 'labor_share') return
        if (day === state.selectedDay) selectedDayHeadcount += 1
        const totals = computeHoursForAssignment(assignment, day, weekStart)
        hours += Number(totals[assignment.area || 'Unassigned'] || 0)
      })
    })
    return { hours, selectedDayHeadcount }
  }

  const laborShareShiftComparison = [activeBoardType + '_day', activeBoardType + '_night'].map((boardId) => {
    const boardState = getScopedBoardState(boardId)
    const weekData = getScopedWeekData(boardState)
    const summary = calculateLaborShareForWeek(weekData, state.weekStartDate, boardId, boardState?.areaDefs)
    return { boardId, shift: BOARD_PRESETS[boardId]?.shift || boardId, ...summary }
  })

  const laborShareWeeklyTrend = Object.entries({ ...(state.weeklyBoards || {}), [toMonday(state.weekStartDate)]: state.weeklyData }).map(([weekStart, weekData]) => {
    const summary = calculateLaborShareForWeek(weekData, weekStart, state.currentBoardId, effectiveAreaDefsTyped)
    return { weekStart: toMonday(weekStart), hours: summary.hours }
  }).reduce((acc, row) => {
    acc[row.weekStart] = row
    return acc
  }, {})
  const laborShareWeeklyTrendRows = Object.values(laborShareWeeklyTrend).sort((a, b) => a.weekStart.localeCompare(b.weekStart)).slice(-8)

`
        next = next.replace(marker, logic + marker)
      }

      const savedHistoryMarker = `          <div className="summary-card-block card">
            <div className="table-title-row">
              <div>
                <div className="table-kicker">Saved Week History</div>`
      if (!next.includes('Labor Allocation Analysis')) {
        const panel = `          <div className="summary-card-block card labor-share-analysis-card">
            <div className="table-title-row"><div><div className="table-kicker">Labor Allocation Analysis</div><div className="small">Active board and shift only by default. Labor Share and Support hours are excluded from SPEED production TPH and production efficiency.</div></div><span className="pill">{boardLabel}</span></div>
            <div className="summary-grid">
              {[["Production Hours", weeklyProductionHours.toFixed(2)],["Labor Share Hours", weeklyLaborShareHours.toFixed(2)],["Support / Indirect Hours", weeklySupportHours.toFixed(2)],["Line Lead Hours", weeklyLineLeadHours.toFixed(2)]].map(([label, value]) => <div className="summary-card kpi-highlight-card" key={label}><div className="summary-label">{label}</div><div className="summary-value">{value}</div></div>)}
            </div>
            <div className="two-col-layout">
              <div><div className="table-kicker">Labor Share Hours by Builder</div><div className="analysis-table-wrap compact"><table><thead><tr><th>Builder</th><th>Line Lead</th><th>Hours</th></tr></thead><tbody>{laborShareHoursByBuilder.length ? laborShareHoursByBuilder.map((row) => <tr key={row.builder.id}><td>{row.builder.name}</td><td>{normalizeBuilderProfile(row.builder).isLineLead ? 'Yes' : 'No'}</td><td>{row.hours.toFixed(2)}</td></tr>) : <tr><td colSpan="3">No labor-share hours.</td></tr>}</tbody></table></div></div>
              <div><div className="table-kicker">Labor Share Hours by Area</div><div className="analysis-table-wrap compact"><table><thead><tr><th>Area</th><th>Hours</th></tr></thead><tbody>{laborShareHoursByArea.length ? laborShareHoursByArea.map((row) => <tr key={row.area}><td>{row.area}</td><td>{row.hours.toFixed(2)}</td></tr>) : <tr><td colSpan="2">No labor-share hours.</td></tr>}</tbody></table></div></div>
            </div>
            <div className="two-col-layout">
              <div><div className="table-kicker">Day vs Night Labor Share</div><div className="analysis-table-wrap compact"><table><thead><tr><th>Shift</th><th>Selected Day HC</th><th>Weekly Hours</th></tr></thead><tbody>{laborShareShiftComparison.map((row) => <tr key={row.boardId}><td>{row.shift}</td><td>{row.selectedDayHeadcount}</td><td>{row.hours.toFixed(2)}</td></tr>)}</tbody></table></div></div>
              <div><div className="table-kicker">Weekly Labor Share Trend</div><div className="analysis-table-wrap compact"><table><thead><tr><th>Week</th><th>Hours</th></tr></thead><tbody>{laborShareWeeklyTrendRows.length ? laborShareWeeklyTrendRows.map((row) => <tr key={row.weekStart}><td>{row.weekStart}</td><td>{row.hours.toFixed(2)}</td></tr>) : <tr><td colSpan="2">No weekly history.</td></tr>}</tbody></table></div></div>
            </div>
            <div><div className="table-kicker">Labor Share by Day</div><div className="analysis-chip-wrap">{laborShareHoursByDay.map((row) => <span className="analysis-chip labor-share-chip" key={row.day}>{row.day}: {row.hours.toFixed(2)}h</span>)}</div></div>
          </div>

`
        next = next.replace(savedHistoryMarker, panel + savedHistoryMarker)
      }

      return next === code ? null : { code: next, map: null }
    },
  }
}
