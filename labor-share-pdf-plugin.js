export function laborSharePdfPlugin() {
  return {
    name: 'staffboard-labor-share-pdf',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      next = next.replace(
        `                ['Headcount', totalHeadCount],
                ['Goal TPH', metrics.targetTPH.toFixed(2)],
                ['Required TPH', metrics.requiredTPH.toFixed(2)],`,
        `                ['Total Shift HC', laborShareStats.totalShiftHeadcount],
                ['SPEED Production HC', laborShareStats.speedProductionHeadcount],
                ['Labor Share HC', laborShareStats.laborShareHeadcount],
                ['Labor-Shared Line Leads', laborShareStats.laborSharedLineLeads],
                ['Goal SPEED TPH', metrics.targetTPH.toFixed(2)],
                ['Required SPEED TPH', metrics.requiredTPH.toFixed(2)],`
      )
      next = next.replace(
        `                    <tr><td>Unassigned / Line Leads</td><td>{counts.unassigned} / {counts.lineLeads}</td></tr>`,
        `                    <tr><td>Total Shift / Production HC</td><td>{laborShareStats.totalShiftHeadcount} / {laborShareStats.speedProductionHeadcount}</td></tr>
                    <tr><td>Labor Share / Labor-Shared LL</td><td>{laborShareStats.laborShareHeadcount} / {laborShareStats.laborSharedLineLeads}</td></tr>
                    <tr><td>Support / Unassigned / Line Leads</td><td>{laborShareStats.supportIndirectHeadcount} / {laborShareStats.unassignedHeadcount} / {laborShareStats.lineLeadHeadcount}</td></tr>
                    <tr><td>Labor Share Hours</td><td>{laborShareStats.laborShareHoursToday.toFixed(2)}</td></tr>`
      )

      if (!next.includes('Daily Labor Share Detail')) {
        const weeklyMarker = '          <div ref={weeklyPdfRef} className="pdf-report-sheet">'
        const weeklyIndex = next.indexOf(weeklyMarker)
        const closeIndex = weeklyIndex >= 0 ? next.lastIndexOf('          </div>', weeklyIndex) : -1
        if (closeIndex >= 0) {
          const section = `            <div className="pdf-report-section-title">Daily Labor Share Detail</div>
            <div className="pdf-chart-card pdf-table-card">
              <table className="pdf-mini-table">
                <thead><tr><th>Builder</th><th>Line Lead</th><th>Area</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Previous Production Area</th><th>Moved By</th></tr></thead>
                <tbody>{laborShareDetailRows.length ? laborShareDetailRows.map((row) => <tr key={row.builder.id}><td>{row.builder.name}</td><td>{row.profile.isLineLead ? 'Yes' : 'No'}</td><td>{row.area}</td><td>{row.assignment.clockInTime || '—'}</td><td>{row.assignment.leaveTime || '—'}</td><td>{row.hours.toFixed(2)}</td><td>{row.previousProductionArea}</td><td>{row.admin}</td></tr>) : <tr><td colSpan="8">No active labor-share assignments.</td></tr>}</tbody>
              </table>
            </div>

`
          next = next.slice(0, closeIndex) + section + next.slice(closeIndex)
        }
      }

      next = next.replace(
        `                ['Weekly Staffed Hours', currentWeekAnalysis.totals.staffedHours],
                ['Weekly Avg TPH', weekAvgTPH.toFixed(2)],`,
        `                ['Weekly Staffed Hours', currentWeekAnalysis.totals.staffedHours],
                ['Production Hours', weeklyProductionHours.toFixed(2)],
                ['Labor Share Hours', weeklyLaborShareHours.toFixed(2)],
                ['Support Hours', weeklySupportHours.toFixed(2)],
                ['Line Lead Hours', weeklyLineLeadHours.toFixed(2)],
                ['Weekly Avg TPH', weekAvgTPH.toFixed(2)],`
      )

      if (!next.includes('Weekly Labor Share Hours')) {
        const mainMarker = '        </div>\n\n      </main>'
        const mainIndex = next.lastIndexOf(mainMarker)
        const closeIndex = mainIndex >= 0 ? next.lastIndexOf('          </div>', mainIndex) : -1
        if (closeIndex >= 0) {
          const section = `            <div className="pdf-report-section-title">Weekly Labor Share Hours</div>
            <div className="pdf-chart-card pdf-table-card">
              <table className="pdf-mini-table">
                <thead><tr><th>Day</th><th>Builder</th><th>Line Lead</th><th>Area</th><th>Hours</th></tr></thead>
                <tbody>{weeklyLaborShareRows.length ? weeklyLaborShareRows.map((row, index) => <tr key={row.builder.id + '-' + row.day + '-' + row.area + '-' + index}><td>{row.day}</td><td>{row.builder.name}</td><td>{normalizeBuilderProfile(row.builder).isLineLead ? 'Yes' : 'No'}</td><td>{row.area}</td><td>{row.hours.toFixed(2)}</td></tr>) : <tr><td colSpan="5">No weekly labor-share hours.</td></tr>}</tbody>
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
