export function speedLiteTeamsExcelPlugin() {
  return {
    name: 'staffboard-speed-lite-teams-excel',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/reporting.js')) return null
      let next = code

      if (!next.includes('function speedLiteTeamRowsForDay')) {
        const marker = 'function statusCounts(dayData, builderPool = []) {'
        const helper = `function normalizedSpeedLiteTeams(dayData = {}) {
  return (Array.isArray(dayData.speedLiteTeams) ? dayData.speedLiteTeams : []).filter((team) => team && team.id).map((team, index) => ({
    id: String(team.id),
    name: String(team.name || ('Team ' + (index + 1))),
    targetSize: Math.max(1, Math.min(4, number(team.targetSize || 2))),
    teamLeadBuilderId: String(team.teamLeadBuilderId || ''),
  }))
}

function reportingTeamStatus(target, active) {
  if (active <= 0) return 'Empty'
  if (active < target) return 'Needs ' + (target - active)
  if (active === target) return 'Complete'
  return 'Over Target'
}

function speedLiteTeamHoursForReporting(assignment = {}, teamId, areaHours) {
  const sessions = (assignment.speedLiteTeamHistory || []).filter((row) => String(row.teamId || '') === String(teamId || ''))
  if (sessions.length) {
    return sessions.reduce((sum, row) => {
      const start = row.startIso ? new Date(row.startIso) : null
      const end = row.endIso ? new Date(row.endIso) : new Date()
      if (!start || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return sum
      return sum + Math.max(0, Math.min(SHIFT_HOURS, (end - start) / 3600000))
    }, 0)
  }
  return areaHours ? number(areaHours['Speed Lite']) : basicAssignmentHours(assignment)
}

function speedLiteTeamRowsForDay({ dayData, builderPool, day, weekStartDate, computeHoursForAssignment }) {
  const teams = normalizedSpeedLiteTeams(dayData)
  const assignments = dayData.assignments || {}
  const teamRows = []
  const memberRows = []
  const validIds = new Set(teams.map((team) => team.id))
  teams.forEach((team) => {
    const members = builderPool.filter((builder) => {
      const assignment = assignments[builder.id]
      return assignment && (assignment.area || '') === 'Speed Lite' && String(assignment.speedLiteTeamId || '') === team.id
    })
    const activeMembers = members.filter((builder) => ['Present', 'Training', 'Indirect'].includes(assignments[builder.id]?.status || 'Present'))
    const lead = members.find((builder) => builder.id === team.teamLeadBuilderId)
    let teamHours = 0
    members.forEach((builder) => {
      const assignment = assignments[builder.id]
      const areaHours = typeof computeHoursForAssignment === 'function' ? computeHoursForAssignment(assignment, day, weekStartDate) : null
      const hours = speedLiteTeamHoursForReporting(assignment, team.id, areaHours)
      teamHours += hours
      memberRows.push({ day, team: team.name, builder: builder.name, team_lead: builder.id === team.teamLeadBuilderId ? 'Yes' : 'No', permanent_line_lead: builder.isLineLead ? 'Yes' : 'No', status: assignment.status || 'Present', clock_in: assignment.clockInTime || '', clock_out: assignment.leaveTime || '', team_hours: round(hours) })
    })
    teamRows.push({ day, team: team.name, target_size: team.targetSize, active_builders: activeMembers.length, assigned_builders: members.length, status: reportingTeamStatus(team.targetSize, activeMembers.length), team_lead: lead?.name || '', builders: members.map((builder) => builder.name).join(', '), team_hours: round(teamHours) })
  })
  const ungrouped = builderPool.filter((builder) => {
    const assignment = assignments[builder.id]
    return assignment && (assignment.area || '') === 'Speed Lite' && !validIds.has(String(assignment.speedLiteTeamId || ''))
  })
  const ungroupedActive = ungrouped.filter((builder) => ['Present', 'Training', 'Indirect'].includes(assignments[builder.id]?.status || 'Present'))
  teamRows.push({ day, team: 'Ungrouped', target_size: '', active_builders: ungroupedActive.length, assigned_builders: ungrouped.length, status: ungroupedActive.length ? 'Needs grouping' : 'Clear', team_lead: '', builders: ungrouped.map((builder) => builder.name).join(', '), team_hours: '' })
  return { teamRows, memberRows }
}

`
        next = next.replace(marker, helper + marker)
      }

      next = next.replace(
        '  const laborHours = laborRows.reduce((sum, row) => sum + number(row.labor_share_hours), 0)\n  const calc =',
        "  const laborHours = laborRows.reduce((sum, row) => sum + number(row.labor_share_hours), 0)\n  const speedLiteDaily = speedLiteTeamRowsForDay({ dayData: dayState, builderPool: state.builderPool || activeBuilders, day: selectedDay, weekStartDate: state.weekStartDate, computeHoursForAssignment })\n  const calc ="
      )
      next = next.replace(
        "  appendDataSheet(wb, 'Labor Share Detail', laborRows, { title: `${selectedDay} Labor Share Detail`, subtitle: 'Builders and line leads excluded from SPEED Production HC', meta, accent: COLORS.orange })",
        "  appendDataSheet(wb, 'Labor Share Detail', laborRows, { title: `${selectedDay} Labor Share Detail`, subtitle: 'Builders and line leads excluded from SPEED Production HC', meta, accent: COLORS.orange })\n  appendDataSheet(wb, 'Speed Lite Teams', speedLiteDaily.teamRows, { title: `${selectedDay} Speed Lite Team Summary`, subtitle: 'Team targets, status, leads, membership, and hours', meta, accent: COLORS.green })\n  appendDataSheet(wb, 'Speed Lite Members', speedLiteDaily.memberRows, { title: `${selectedDay} Speed Lite Team Members`, subtitle: 'Team hours are a breakdown of Speed Lite production hours', meta, accent: COLORS.green })"
      )

      next = next.replace(
        '  const weeklyLaborHours = weeklyLaborRows.reduce((sum, row) => sum + number(row.labor_share_hours), 0)\n  const dailyAllocation =',
        "  const weeklyLaborHours = weeklyLaborRows.reduce((sum, row) => sum + number(row.labor_share_hours), 0)\n  const weeklySpeedLite = weekDays.map((day) => speedLiteTeamRowsForDay({ dayData: getDayData(day), builderPool, day, weekStartDate: state.weekStartDate, computeHoursForAssignment }))\n  const weeklySpeedLiteTeams = weeklySpeedLite.flatMap((row) => row.teamRows)\n  const weeklySpeedLiteMembers = weeklySpeedLite.flatMap((row) => row.memberRows)\n  const dailyAllocation ="
      )
      next = next.replace(
        "  appendDataSheet(wb, 'Weekly Labor Share', weeklyLaborRows, { title: 'Weekly Labor Share Detail', subtitle: 'Labor-share hours by day, builder, and area', meta, accent: COLORS.orange })",
        "  appendDataSheet(wb, 'Weekly Labor Share', weeklyLaborRows, { title: 'Weekly Labor Share Detail', subtitle: 'Labor-share hours by day, builder, and area', meta, accent: COLORS.orange })\n  appendDataSheet(wb, 'Weekly Speed Lite Teams', weeklySpeedLiteTeams, { title: 'Weekly Speed Lite Team Summary', subtitle: 'Team targets, actual staffing, status, leads, and hours by day', meta, accent: COLORS.green })\n  appendDataSheet(wb, 'Weekly Speed Lite Members', weeklySpeedLiteMembers, { title: 'Weekly Speed Lite Team Members', subtitle: 'Team membership and hours by builder and day', meta, accent: COLORS.green })"
      )

      return next === code ? null : { code: next, map: null }
    },
  }
}
