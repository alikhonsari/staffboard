export function pdfDailySectionPlugin() {
  return {
    name: 'staffboard-pdf-daily-section',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') || code.includes('Staffing Exceptions & Schedule Variance')) return null
      const block = `            <div className="pdf-report-section-title">Staffing Exceptions & Schedule Variance</div>\n            <div className="pdf-chart-card pdf-table-card">\n              <table className="pdf-mini-table"><thead><tr><th>Builder</th><th>Status</th><th>Area</th><th>Clock In</th><th>Clock Out</th><th>Exception</th></tr></thead><tbody>\n                {dailyPdfExceptions.length ? dailyPdfExceptions.map((row) => <tr key={row.builder + row.reason}><td>{row.builder}</td><td>{row.status}</td><td>{row.area}</td><td>{row.clockIn || '—'}</td><td>{row.clockOut || '—'}</td><td>{row.reason}</td></tr>) : <tr><td colSpan="6">No staffing or schedule exceptions detected.</td></tr>}\n              </tbody></table>\n            </div>\n            <div className="pdf-two-col">\n              <div className="pdf-chart-card pdf-table-card"><div className="pdf-chart-title pdf-card-heading">Skill Coverage on Shift</div><table className="pdf-mini-table"><thead><tr><th>Skill / Role</th><th>Active Trained Staff</th></tr></thead><tbody>{dailyPdfSkillCoverage.map((row) => <tr key={row.label}><td>{row.label}</td><td>{row.count}</td></tr>)}</tbody></table></div>\n              <div className="pdf-chart-card pdf-table-card"><div className="pdf-chart-title pdf-card-heading">Area Coverage Detail</div><table className="pdf-mini-table"><thead><tr><th>Area</th><th>Staffed</th><th>Capacity</th><th>Gap</th></tr></thead><tbody>{areaCounts.filter((area) => area.name !== 'Unassigned').map((area) => { const capacity = Number(area.capacity || 0); return <tr key={area.name}><td>{area.name}</td><td>{area.count}</td><td>{area.capacity || '—'}</td><td>{capacity ? capacity - area.count : '—'}</td></tr> })}</tbody></table></div>\n            </div>\n`
      const marker = '          </div>\n\n          <div ref={weeklyPdfRef} className="pdf-report-sheet">'
      const next = code.replace(marker, block + marker)
      return next === code ? null : { code: next, map: null }
    },
  }
}
