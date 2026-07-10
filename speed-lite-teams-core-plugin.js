export function speedLiteTeamsCorePlugin() {
  return {
    name: 'staffboard-speed-lite-teams-core',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      if (!next.includes('speedLiteTeams: []')) {
        next = next.replace(
          "  attendanceLog: [],\n  snapshots:",
          "  attendanceLog: [],\n  speedLiteTeams: [],\n  speedLiteTeamHistory: [],\n  snapshots:"
        )
      }

      if (!next.includes("speedLiteTeamId: ''")) {
        next = next.replace(
          "    areaHistory: [],\n  }",
          "    areaHistory: [],\n    speedLiteTeamId: '',\n    speedLiteTeamHistory: [],\n  }"
        )
      }

      if (!next.includes('function normalizeSpeedLiteTeams')) {
        const marker = 'function closeOpenSession(assignment, closeIso) {'
        const helpers = `function normalizeSpeedLiteTeams(dayData) {
  const teams = Array.isArray(dayData?.speedLiteTeams) ? dayData.speedLiteTeams : []
  const seen = new Set()
  return teams.filter((team) => team && team.id && !seen.has(team.id) && seen.add(team.id)).map((team, index) => ({
    id: String(team.id),
    name: String(team.name || ('Team ' + (index + 1))),
    targetSize: Math.max(1, Math.min(4, Number(team.targetSize || 2))),
    teamLeadBuilderId: String(team.teamLeadBuilderId || ''),
    collapsed: !!team.collapsed,
    createdAt: team.createdAt || '',
    createdBy: team.createdBy || '',
    updatedAt: team.updatedAt || '',
  }))
}

function speedLiteTeamStatus(team, count) {
  const target = Math.max(1, Number(team?.targetSize || 2))
  if (count <= 0) return { key: 'empty', label: 'Empty' }
  if (count < target) return { key: 'needs', label: 'Needs ' + (target - count) }
  if (count === target) return { key: 'complete', label: 'Complete' }
  return { key: 'over', label: 'Over Target' }
}

function closeOpenSpeedLiteTeamSession(history, closeIso) {
  const rows = Array.isArray(history) ? [...history] : []
  if (!rows.length) return rows
  const last = rows[rows.length - 1]
  if (last && !last.endIso) rows[rows.length - 1] = { ...last, endIso: closeIso }
  return rows
}

function syncSpeedLiteTeamSession(before, nextTeamId, nextTeamName, timestampIso) {
  const previousTeamId = String(before?.speedLiteTeamId || '')
  const targetTeamId = String(nextTeamId || '')
  let history = Array.isArray(before?.speedLiteTeamHistory) ? [...before.speedLiteTeamHistory] : []
  if (previousTeamId && previousTeamId !== targetTeamId) history = closeOpenSpeedLiteTeamSession(history, timestampIso)
  if (targetTeamId && previousTeamId !== targetTeamId) {
    history.push({ teamId: targetTeamId, teamName: nextTeamName || 'Speed Lite Team', startIso: timestampIso, endIso: '' })
  }
  if (!targetTeamId && previousTeamId) history = closeOpenSpeedLiteTeamSession(history, timestampIso)
  return history
}

function speedLiteTeamHoursForAssignment(assignment, teamId, day, weekStartDate) {
  const sessions = (assignment?.speedLiteTeamHistory || []).filter((row) => String(row.teamId || '') === String(teamId || ''))
  if (sessions.length) {
    return sessions.reduce((sum, row) => {
      const start = row.startIso ? new Date(row.startIso) : null
      const end = row.endIso ? new Date(row.endIso) : new Date()
      if (!start || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return sum
      return sum + Math.max(0, Math.min(8, (end - start) / 3600000))
    }, 0)
  }
  if ((assignment?.area || '') === 'Speed Lite' && String(assignment?.speedLiteTeamId || '') === String(teamId || '')) {
    const totals = computeHoursForAssignment(assignment, day, weekStartDate)
    return Number(totals['Speed Lite'] || 0)
  }
  return 0
}

`
        next = next.replace(marker, helpers + marker)
      }

      return next === code ? null : { code: next, map: null }
    },
  }
}
