const helpers = `

function pdfClosureForState(state, boardId, day) {
  const operationId = String(boardId || 'speed_day').replace(/_(day|night)$/i, '')
  const record = state?.dayClosures?.[operationId]?.[state?.weekStartDate]?.[day]
  if (!record) return null
  if (record.entireDay?.closed) return { ...record.entireDay, scope: 'Entire Day' }
  const night = /_night$/i.test(String(boardId || ''))
  const closure = night ? record.nightShift : record.dayShift
  return closure?.closed ? { ...closure, scope: night ? 'Night Shift' : 'Day Shift' } : null
}
const pdfClosureReason = (closure) => closure?.reason === 'Other' ? (closure.customReason || 'Other') : (closure?.reason || 'Closed')
`

export function injectDailyPdf(code) {
  let next = code
  const helperMarker = "const text = (value, fallback = '—') => String(value || '').trim() || fallback"
  if (!next.includes('function pdfClosureForState')) next = next.replace(helperMarker, helperMarker + helpers)
  next = next.replace("  const boardId = state.currentBoardId || 'speed_day'\n  const speedBoard", "  const boardId = state.currentBoardId || 'speed_day'\n  const closure = pdfClosureForState(state, boardId, state.selectedDay)\n  const speedBoard")
  const marker = `  return (
    <div ref={ref} className="daily-pdf-v3-root" data-daily-pdf-v3="true" data-report-version={DAILY_PDF_V3_VERSION}>`
  if (!next.includes(marker) || next.includes('daily-pdf-v3-closure-page')) return next
  const closed = `  if (closure) {
    const closureReason = pdfClosureReason(closure)
    const preservedData = activeBuilders.length > 0 || rackRows.length > 0 || Object.values(dayState.opsMetrics || {}).some((value) => String(value || '').trim())
    return (
      <div ref={ref} className="daily-pdf-v3-root" data-daily-pdf-v3="true" data-report-version={DAILY_PDF_V3_VERSION}>
        <article className="daily-pdf-v3-page daily-pdf-v3-closure-page" data-daily-pdf-page="1">
          <PageHeader boardTitle={boardTitle} boardType={boardType} shift={shift} reportDate={reportDate} selectedDay={state.selectedDay} weekStart={state.weekStartDate} weekLabel={weekLabel} admin={reportAdminName} generated={generated} shiftWindow={shiftWindow} />
          <section className="daily-pdf-v3-closure-card"><div className="daily-pdf-v3-closure-icon" aria-hidden="true">⛔</div><div><div className="daily-pdf-v3-kicker">Operational Status</div><h1>SITE CLOSED — {closureReason.toUpperCase()}</h1><p>{closure.scope} · {reportDate}</p>{closure.note ? <div className="daily-pdf-v3-closure-note">{closure.note}</div> : null}</div></section>
          <Section title="Closure Record" subtitle="This day is excluded from staffing, productivity, TPH, utilization, attendance exceptions, rotation fairness, and goal-completion averages.">
            <div className="daily-pdf-v3-closure-grid">
              <div><span>Reason</span><strong>{closureReason}</strong></div><div><span>Scope</span><strong>{closure.scope}</strong></div>
              <div><span>Closed By</span><strong>{closure.closedBy || 'Admin'}</strong></div><div><span>Applied</span><strong>{closure.closedAt ? new Date(closure.closedAt).toLocaleString() : '—'}</strong></div>
              <div><span>Scheduled Transitions Canceled</span><strong>{number(closure.canceledTransitionCount)}</strong></div><div><span>Historical Data</span><strong>{preservedData ? 'Preserved · partial data present' : 'Preserved · no operational entries'}</strong></div>
            </div>
          </Section>
          {noteRows.length ? <Section title="Recorded Notes"><div className="daily-pdf-v3-notes">{noteRows.map((row) => <div key={row.key}><strong>{row.label}</strong><p>{row.value}</p></div>)}</div></Section> : null}
          <PageFooter boardType={boardType} shift={shift} reportDate={reportDate} admin={reportAdminName} generated={generated} pageNumber={1} pageCount={1} />
        </article>
      </div>
    )
  }

`
  return next.replace(marker, closed + marker)
}
