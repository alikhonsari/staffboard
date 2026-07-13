export function reportingV2Plugin() {
  return {
    name: 'staffboard-reporting-v2',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/reporting.js')) return null
      return {
        code: "export { exportEndOfShiftExcel, exportWeeklyExcel, buildDailyWorkbook, buildWeeklyWorkbook, __reportingV2 } from './reporting-v2.js'\n",
        map: null,
      }
    },
  }
}
