export function speedRackPlannerValidationPlugin() {
  return {
    name: 'staffboard-speed-rack-planner-validation',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      const required = [
        'speedRackPlanner: {',
        'const speedRackPlan =',
        "setMainTab('speedPlanner')",
        'SPEED Rack & Labor Planner',
        'Labor Hours per Rack',
        'Total Roster Needed',
      ]
      const missing = required.filter((marker) => !code.includes(marker))
      if (missing.length) throw new Error('SPEED rack planner transforms missing: ' + missing.join(', '))
      if (code.includes("typeof laborShareStats !== 'undefined'")) throw new Error('SPEED rack planner retained unsafe laborShareStats reference')
      return null
    },
  }
}
