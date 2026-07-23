import fs from 'node:fs'
import path from 'node:path'

function writeDiagnostic(scope, required, missing, extra = {}) {
  const file = path.join(process.cwd(), 'speed-lite-transform-status.json')
  let current = {}
  try { current = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { current = {} }
  current[scope] = {
    checkedAt: new Date().toISOString(),
    required,
    missing,
    passed: missing.length === 0 && !extra.runtimeVariableError,
    ...extra,
  }
  fs.writeFileSync(file, JSON.stringify(current, null, 2))
}

export function speedLiteTeamsValidationPlugin() {
  return {
    name: 'staffboard-speed-lite-teams-validation',
    enforce: 'post',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null

      const required = [
        'const speedLiteTeamRows =',
        'const suggestionSpeedLiteEnabled =',
        'Speed Lite Team Health',
        'Speed Lite Team Analysis',
        'Weekly Speed Lite Team Summary',
        'Speed Lite Teams + Memberships',
      ]
      const missing = required.filter((marker) => !code.includes(marker))
      const runtimeVariableError = code.includes('speedLiteTeamsEnabled')
        ? 'The final generated App still contains speedLiteTeamsEnabled.'
        : ''

      writeDiagnostic('app', required, missing, { runtimeVariableError })
      if (missing.length) throw new Error('Speed Lite team App transforms missing: ' + missing.join(', '))
      if (runtimeVariableError) throw new Error('Speed Lite runtime safety validation failed: ' + runtimeVariableError)
      return null
    },
  }
}
