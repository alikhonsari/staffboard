import fs from 'node:fs'
import path from 'node:path'

function writeDiagnostic(scope, required, missing, extra = {}) {
  const file = path.join(process.cwd(), 'speed-lite-transform-status.json')
  let current = {}
  try { current = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { current = {} }
  current[scope] = { checkedAt: new Date().toISOString(), required, missing, passed: missing.length === 0 && !extra.orderError, ...extra }
  fs.writeFileSync(file, JSON.stringify(current, null, 2))
}

export function speedLiteTeamsValidationPlugin() {
  return {
    name: 'staffboard-speed-lite-teams-validation',
    enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('/src/App.jsx')) {
        const required = [
          'const speedLiteTeamRows =',
          'const suggestionSpeedLiteEnabled =',
          'speed-lite-team-workspace',
          'Speed Lite Team Health',
          'Speed Lite Team Analysis',
          'Daily Speed Lite Teams',
          'Weekly Speed Lite Team Summary',
          'Speed Lite Teams + Memberships',
        ]
        const missing = required.filter((marker) => !code.includes(marker))
        const declarationIndex = code.indexOf('const speedLiteTeamsEnabled =')
        const earlyReference = declarationIndex >= 0 && code.slice(0, declarationIndex).includes('speedLiteTeamsEnabled')
        const orderError = declarationIndex < 0 ? 'speedLiteTeamsEnabled declaration missing' : earlyReference ? 'speedLiteTeamsEnabled referenced before initialization' : ''
        writeDiagnostic('app', required, missing, { orderError })
        if (missing.length) throw new Error('Speed Lite team App transforms missing: ' + missing.join(', '))
        if (orderError) throw new Error('Speed Lite team initialization order invalid: ' + orderError)
      }
      if (id.endsWith('/src/reporting.js')) {
        const required = [
          'function speedLiteTeamRowsForDay',
          "'Speed Lite Teams'",
          "'Weekly Speed Lite Teams'",
          "'Weekly Speed Lite Members'",
        ]
        const missing = required.filter((marker) => !code.includes(marker))
        writeDiagnostic('reporting', required, missing)
        if (missing.length) throw new Error('Speed Lite team reporting transforms missing: ' + missing.join(', '))
      }
      return null
    },
  }
}
