export function builderAreaHoursPlugin() {
  return {
    name: 'staffboard-builder-area-hours',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code
      if (!next.includes("import BuilderAreaHoursPanel from './BuilderAreaHoursPanel'")) {
        const importMarker = "import { exportEndOfShiftExcel, exportWeeklyExcel } from './reporting'"
        next = next.replace(importMarker, `${importMarker}\nimport BuilderAreaHoursPanel from './BuilderAreaHoursPanel'`)
      }
      if (!next.includes('data-builder-area-hours')) {
        const marker = `          <div className="summary-card-block card">\n            <div className="table-title-row">\n              <div>\n                <div className="table-kicker">Saved Week History</div>`
        const panel = `          <BuilderAreaHoursPanel state={state} />\n\n`
        next = next.replace(marker, panel + marker)
      }
      return next === code ? null : { code: next, map: null }
    },
  }
}

export function validateBuilderAreaHoursOutput(code) {
  const required = [
    "import BuilderAreaHoursPanel from './BuilderAreaHoursPanel'",
    '<BuilderAreaHoursPanel state={state} />',
  ]
  const missing = required.filter((marker) => !code.includes(marker))
  if (missing.length) throw new Error(`Builder Area Hours integration missing: ${missing.join(', ')}`)
  return true
}
