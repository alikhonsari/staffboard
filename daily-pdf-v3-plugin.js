export function dailyPdfV3Plugin() {
  return {
    name: 'staffboard-daily-pdf-v3',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      const reportImport = "import { exportEndOfShiftExcel, exportWeeklyExcel } from './reporting'"
      if (!next.includes("./DailyPdfReportV3.jsx")) {
        next = next.replace(
          reportImport,
          `${reportImport}\nimport DailyPdfReportV3 from './DailyPdfReportV3.jsx'\nimport { buildDailyPdfFilenameV3, exportDailyPdfV3 } from './dailyPdfExportV3.js'`
        )
      }

      const statusMarker = "  const [syncStatus, setSyncStatus] = useState('Loading...')"
      if (!next.includes('const [dailyPdfExportStatus, setDailyPdfExportStatus]')) {
        next = next.replace(statusMarker, `${statusMarker}\n  const [dailyPdfExportStatus, setDailyPdfExportStatus] = useState('')`)
      }

      const newExport = `  const exportDailyPdf = async () => {
    if (!dailyPdfRef.current || dailyPdfExportStatus) return
    try {
      setDailyPdfExportStatus('Preparing report')
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      await exportDailyPdfV3(dailyPdfRef.current, {
        filename: buildDailyPdfFilenameV3(state),
        author: reportAdminName,
        subject: (BOARD_PRESETS[state.currentBoardId]?.title || state.boardTitle) + ' daily operations report',
        onStatus: setDailyPdfExportStatus,
      })
      window.setTimeout(() => setDailyPdfExportStatus(''), 1800)
    } catch (error) {
      console.error('Daily PDF v3 export failed', error)
      setDailyPdfExportStatus('')
      alert('Daily PDF generation failed: ' + (error?.message || 'Unknown error'))
    }
  }`
      const exportStartMarker = '  const exportDailyPdf = async () => {'
      const exportEndMarker = '\n\n  const exportWeeklyPdf = async () => {'
      const exportStart = next.indexOf(exportStartMarker)
      const exportEnd = exportStart >= 0 ? next.indexOf(exportEndMarker, exportStart) : -1
      if (exportStart >= 0 && exportEnd > exportStart) {
        next = next.slice(0, exportStart) + newExport + next.slice(exportEnd)
      }

      const dailyStartMarker = '          <div ref={dailyPdfRef} className="pdf-report-sheet">'
      const weeklyMarker = '          <div ref={weeklyPdfRef} className="pdf-report-sheet">'
      const dailyStart = next.indexOf(dailyStartMarker)
      const weeklyStart = next.indexOf(weeklyMarker)
      if (dailyStart >= 0 && weeklyStart > dailyStart && !next.slice(dailyStart, weeklyStart).includes('data-daily-pdf-v3-component')) {
        const component = `          <div data-daily-pdf-v3-component="true">
            <DailyPdfReportV3
              ref={dailyPdfRef}
              state={state}
              dayState={dayState}
              activeBuilders={activeBuilders}
              areaCounts={areaCounts}
              counts={counts}
              metrics={metrics}
              currentLiveTPH={currentLiveTPH}
              efficiencyPct={efficiencyPct}
              laborShareStats={laborShareStats}
              laborShareDetailRows={laborShareDetailRows}
              dailyPdfRackRows={dailyPdfRackRows}
              dailyPdfExceptions={dailyPdfExceptions}
              dailyPdfSkillCoverage={dailyPdfSkillCoverage}
              speedLiteTeamRows={speedLiteTeamRows}
              speedLiteUngroupedBuilders={speedLiteUngroupedBuilders}
              reportAdminName={reportAdminName}
              reportShiftWindow={reportShiftWindow}
              boardPresets={BOARD_PRESETS}
              getAssignment={getAssignment}
              computeHoursForAssignment={computeHoursForAssignment}
            />
          </div>

`
        next = next.slice(0, dailyStart) + component + next.slice(weeklyStart)
      }

      next = next.replace(
        '<button className="secondary" onClick={exportDailyPdf}>Daily PDF</button>',
        '<button className="secondary" onClick={exportDailyPdf} disabled={!!dailyPdfExportStatus} aria-busy={!!dailyPdfExportStatus}>{dailyPdfExportStatus || \'Daily PDF\'}</button>'
      )

      return next === code ? null : { code: next, map: null }
    },
  }
}
