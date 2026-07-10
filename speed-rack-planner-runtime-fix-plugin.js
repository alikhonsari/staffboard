export function speedRackPlannerRuntimeFixPlugin() {
  return {
    name: 'staffboard-speed-rack-planner-runtime-fix',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      const oldLine = "  const speedRackActualProductionHC = typeof laborShareStats !== 'undefined' ? numVal(laborShareStats.speedProductionHeadcount) : activeProductionHeadcount"
      const newLine = '  const speedRackActualProductionHC = activeProductionHeadcount'
      const next = code.replace(oldLine, newLine)
      return next === code ? null : { code: next, map: null }
    },
  }
}
