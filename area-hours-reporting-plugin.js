export function areaHoursReportingPlugin() {
  return {
    name: 'staffboard-area-hours-reporting',
    enforce: 'post',
    transform(code, id) {
      if (!id.endsWith('/src/reporting-v2.js')) return null
      let next = code
      if (!next.includes("from './reporting-area-hours.js'")) {
        next = next.replace("import * as XLSX from 'xlsx'", "import * as XLSX from 'xlsx'\nimport { enhanceDailyAreaHoursWorkbook, enhanceWeeklyAreaHoursWorkbook } from './reporting-area-hours.js'")
      }
      const dailyMarker = "  appendSheet(wb, 'Report Guide', guideRows('Daily'), { title: 'Daily Report Guide', accent: C.navy })\n  return wb"
      if (!next.includes('enhanceDailyAreaHoursWorkbook(wb')) {
        next = next.replace(dailyMarker, "  enhanceDailyAreaHoursWorkbook(wb, { state, dayState, selectedDay, builders, adminName: admin })\n" + dailyMarker)
      }
      const weeklyMarker = "  appendSheet(wb, 'Report Guide', guideRows('Weekly'), { title: 'Weekly Report Guide', accent: C.navy })\n  return wb"
      if (!next.includes('enhanceWeeklyAreaHoursWorkbook(wb')) {
        next = next.replace(weeklyMarker, "  enhanceWeeklyAreaHoursWorkbook(wb, { state, weekDays, getDayData, builderPool, adminName: admin })\n" + weeklyMarker)
      }
      validateAreaHoursReportingOutput(next)
      return next === code ? null : { code: next, map: null }
    },
  }
}

export function validateAreaHoursReportingOutput(code) {
  const required = [
    "from './reporting-area-hours.js'",
    'enhanceDailyAreaHoursWorkbook(wb',
    'enhanceWeeklyAreaHoursWorkbook(wb',
  ]
  const missing = required.filter((marker) => !code.includes(marker))
  if (missing.length) throw new Error(`Area-hours Excel integration missing: ${missing.join(', ')}`)
  return true
}
