export function dailyPdfV3ValidationPlugin() {
  return {
    name: 'staffboard-daily-pdf-v3-validation',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      const required = [
        "./DailyPdfReportV3.jsx",
        "./dailyPdfExportV3.js",
        'data-daily-pdf-v3-component="true"',
        'dailyPdfExportStatus',
        'exportDailyPdfV3(dailyPdfRef.current',
        'buildDailyPdfFilenameV3(state)',
        'speedLiteUngroupedBuilders={speedLiteUngroupedBuilders}',
        'laborShareDetailRows={laborShareDetailRows}',
      ]
      const missing = required.filter((marker) => !code.includes(marker))
      if (missing.length) throw new Error(`Daily PDF v3 transform incomplete: ${missing.join(', ')}`)

      const dailyIndex = code.indexOf('data-daily-pdf-v3-component="true"')
      const weeklyIndex = code.indexOf('ref={weeklyPdfRef} className="pdf-report-sheet"')
      if (dailyIndex < 0 || weeklyIndex < 0 || dailyIndex > weeklyIndex) throw new Error('Daily PDF v3 must render before the unchanged Weekly PDF report')

      const oldDailyExport = 'await exportElementToPdf(dailyPdfRef.current'
      if (code.includes(oldDailyExport)) throw new Error('Daily PDF still uses the legacy tall-canvas slicing exporter')

      return null
    },
  }
}
