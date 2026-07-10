export function laborShareBoardUiPlugin() {
  return {
    name: 'staffboard-labor-share-board-ui',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      next = next.replace(
        `                      <div key={builder.id} className={\`tag roster-item ${'${profile.badgeType === \'green\' ? \'badge-green-tag\' : profile.badgeType === \'night\' ? \'badge-night-tag\' : \'badge-day-tag\'}'}\`}>`,
        `                      <div key={builder.id} className={\`tag roster-item ${'${profile.badgeType === \'green\' ? \'badge-green-tag\' : profile.badgeType === \'night\' ? \'badge-night-tag\' : \'badge-day-tag\'}'}\`} draggable onDragStart={(e) => { setDraggedBuilderId(builder.id); e.dataTransfer.setData('text/plain', builder.id) }} onDragEnd={() => setDraggedBuilderId(null)}>`
      )

      next = next.replace(
        '                    className={`area ${people.length > 0 ? "area-active" : "area-idle"}`}',
        '                    className={`area area-type-${area.areaType || \'production\'} ${people.length > 0 ? "area-active" : "area-idle"}`}'
      )
      next = next.replace(
        '                         <div className="area-title">{area.name}</div>\n                         <div className={`area-count ${people.length > 0 ? "filled" : "empty"}`}>{area.capacity ? `${people.length}/${area.capacity}` : people.length}</div>',
        '                         <div><div className="area-title">{area.name}</div><span className={`area-type-badge area-type-${area.areaType || \'production\'}`}>{areaTypeLabel(area.areaType)}</span></div>\n                         <div className={`area-count ${people.length > 0 ? "filled" : "empty"}`}>{area.capacity ? `${people.length}/${area.capacity}` : people.length}</div>'
      )

      next = next.replace(
        '<div className="small">Drag people between areas. The master roster does not count until you add them to a day.</div>',
        '<div className="small">Drag builders or line leads between typed areas. Labor Share and Support remain in Total Shift HC but are excluded from SPEED Production HC.</div>'
      )
      next = next.replace(
        '<div className="small">Separate section for people flagged as line leads. They are included in total headcount.</div>',
        '<div className="small">Line leads remain in Total Shift HC. Drag them into Labor Share, or mark them as Production Labor before assigning them to a production area.</div>'
      )
      next = next.replace(
        '            TPH uses recovery goal + prep goal + media/6.4 with current headcount and remaining shift hours.',
        '            SPEED TPH uses only active Production HC. Labor Share, Support, Unassigned, unavailable staff, and non-production line leads are excluded.'
      )

      next = next.replaceAll(
        '<div className="kpi-label">Weighted TPH / Total HC</div>',
        '<div className="kpi-label">{isSpeedBoard ? \'Live SPEED TPH / Production HC\' : \'Weighted TPH / Total HC\'}</div>'
      )
      next = next.replaceAll(
        '<div className="ops-label">Weighted TPH / Total HC</div>',
        '<div className="ops-label">{isSpeedBoard ? \'Live SPEED TPH / Production HC\' : \'Weighted TPH / Total HC\'}</div>'
      )
      next = next.replaceAll(
        '<div className="kpi-label">Goal TPH / Total HC</div>',
        '<div className="kpi-label">{isSpeedBoard ? \'Goal SPEED TPH / Production HC\' : \'Goal TPH / Total HC\'}</div>'
      )
      next = next.replaceAll(
        '<div className="ops-label">Goal TPH / Total HC</div>',
        '<div className="ops-label">{isSpeedBoard ? \'Goal SPEED TPH / Production HC\' : \'Goal TPH / Total HC\'}</div>'
      )

      const rackMarker = `          <div className="card">
            <div className="table-title-row">
              <div>
                <div className="table-kicker">Rack ID Summary ({state.selectedDay})</div>`
      if (!next.includes('Labor Share Detail (' + "{state.selectedDay}")) {
        const section = `          <div className="summary-card-block card labor-share-summary-card">
            <div className="table-title-row">
              <div><div className="table-kicker">SPEED Labor Allocation ({state.selectedDay})</div><div className="small">Total Shift HC stays constant when people are labor shared. Only SPEED Production HC changes the SPEED TPH denominator.</div></div>
            </div>
            <div className="summary-grid labor-share-kpi-grid">
              {[["Total Shift HC", laborShareStats.totalShiftHeadcount],["SPEED Production HC", laborShareStats.speedProductionHeadcount],["Labor Share HC", laborShareStats.laborShareHeadcount],["Labor-Shared Line Leads", laborShareStats.laborSharedLineLeads],["Line Leads", laborShareStats.lineLeadHeadcount],["Support / Indirect", laborShareStats.supportIndirectHeadcount],["Unassigned HC", laborShareStats.unassignedHeadcount],["Live SPEED TPH", isSpeedBoard ? currentLiveTPH.toFixed(2) : 'N/A'],["Required SPEED TPH", isSpeedBoard ? metrics.requiredTPH.toFixed(2) : 'N/A']].map(([label, value]) => <div className="summary-card kpi-highlight-card" key={label}><div className="summary-label">{label}</div><div className="summary-value">{value}</div></div>)}
            </div>
            <div className="analysis-chip-wrap">{laborShareAreaCounts.map((area) => <span className="analysis-chip labor-share-chip" key={area.name}>{area.name}: {area.count}</span>)}</div>
          </div>

          <div className="summary-card-block card labor-share-detail-card">
            <div className="table-title-row"><div><div className="table-kicker">Labor Share Detail ({state.selectedDay})</div><div className="small">Active Labor Share builders and line leads, with current tracked hours and movement context.</div></div><span className="pill">Hours {laborShareHoursToday.toFixed(2)}</span></div>
            <div className="analysis-table-wrap compact"><table><thead><tr><th>Builder</th><th>Line Lead</th><th>Labor Share Area</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Previous Production Area</th><th>Moved By</th></tr></thead><tbody>{laborShareDetailRows.length ? laborShareDetailRows.map((row) => <tr key={row.builder.id}><td>{row.builder.name}</td><td>{row.profile.isLineLead ? 'Yes' : 'No'}</td><td>{row.area}</td><td>{row.assignment.clockInTime || '—'}</td><td>{row.assignment.leaveTime || '—'}</td><td>{row.hours.toFixed(2)}</td><td>{row.previousProductionArea}</td><td>{row.admin}</td></tr>) : <tr><td colSpan="8" className="small">No active labor-share assignments for this day.</td></tr>}</tbody></table></div>
          </div>

`
        next = next.replace(rackMarker, section + rackMarker)
      }

      return next === code ? null : { code: next, map: null }
    },
  }
}
