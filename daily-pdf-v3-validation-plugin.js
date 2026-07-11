import fs from 'node:fs'
import path from 'node:path'

function writeDiagnostic(payload) {
  const file = path.join(process.cwd(), 'daily-pdf-v3-transform-status.json')
  fs.writeFileSync(file, JSON.stringify({ checkedAt: new Date().toISOString(), ...payload }, null, 2))
}

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
      const dailyIndex = code.indexOf('data-daily-pdf-v3-component="true"')
      const weeklyIndex = code.indexOf('ref={weeklyPdfRef} className="pdf-report-sheet"')
      const oldDailyExport = code.includes('await exportElementToPdf(dailyPdfRef.current')
      const orderingValid = dailyIndex >= 0 && weeklyIndex >= 0 && dailyIndex < weeklyIndex

      writeDiagnostic({
        required,
        missing,
        dailyIndex,
        weeklyIndex,
        orderingValid,
        oldDailyExport,
        passed: missing.length === 0 && orderingValid && !oldDailyExport,
      })

      if (missing.length) throw new Error(`Daily PDF v3 transform incomplete: ${missing.join(', ')}`)
      if (!orderingValid) throw new Error('Daily PDF v3 must render before the unchanged Weekly PDF report')
      if (oldDailyExport) throw new Error('Daily PDF still uses the legacy tall-canvas slicing exporter')

      return null
    },
  }
}
