export function speedLiteTeamsValidationPlugin() {
  return {
    name: 'staffboard-speed-lite-teams-validation',
    enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('/src/App.jsx')) {
        const required = [
          'const speedLiteTeamRows =',
          'speed-lite-team-workspace',
          'Speed Lite Team Health',
          'Speed Lite Team Analysis',
          'Daily Speed Lite Teams',
          'Weekly Speed Lite Team Summary',
          'Speed Lite Teams + Memberships',
        ]
        const missing = required.filter((marker) => !code.includes(marker))
        if (missing.length) throw new Error('Speed Lite team App transforms missing: ' + missing.join(', '))
      }
      if (id.endsWith('/src/reporting.js')) {
        const required = [
          'function speedLiteTeamRowsForDay',
          "'Speed Lite Teams'",
          "'Weekly Speed Lite Teams'",
          "'Weekly Speed Lite Members'",
        ]
        const missing = required.filter((marker) => !code.includes(marker))
        if (missing.length) throw new Error('Speed Lite team reporting transforms missing: ' + missing.join(', '))
      }
      return null
    },
  }
}
