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
      if (!next.includes('<BuilderAreaHoursPanel state={state} />')) {
        const titleMarker = '<div className="table-kicker">Saved Week History</div>'
        const titleIndex = next.indexOf(titleMarker)
        const cardMarker = '<div className="summary-card-block card">'
        const cardIndex = titleIndex >= 0 ? next.lastIndexOf(cardMarker, titleIndex) : -1
        const lineStart = cardIndex >= 0 ? next.lastIndexOf('\n', cardIndex) + 1 : -1
        if (lineStart >= 0) {
          next = `${next.slice(0, lineStart)}          <BuilderAreaHoursPanel state={state} />\n\n${next.slice(lineStart)}`
        }
      }
      validateBuilderAreaHoursOutput(next)
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
  const duplicatePanelCount = code.split('<BuilderAreaHoursPanel state={state} />').length - 1
  if (duplicatePanelCount > 1) throw new Error(`Builder Area Hours panel injected ${duplicatePanelCount} times.`)
  return true
}
