export function speedLiteTeamsSuggestionsPlugin() {
  return {
    name: 'staffboard-speed-lite-teams-suggestions',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code
      next = next.replace(
        '    return suggestions.slice(0, 14)',
        `    const suggestionSpeedLiteEnabled = String(state.currentBoardId || '').startsWith('speed_')
    if (suggestionSpeedLiteEnabled) {
      const suggestionTeams = normalizeSpeedLiteTeams(dayState)
      const suggestionValidTeamIds = new Set(suggestionTeams.map((team) => team.id))
      const suggestionAssignedBuilders = activeBuilders.filter((builder) => (getAssignment(builder.id).area || '') === 'Speed Lite')
      const suggestionUngroupedActiveBuilders = suggestionAssignedBuilders.filter((builder) => {
        const assignment = getAssignment(builder.id)
        return staffedStatuses().includes(assignment.status || 'Present') && !suggestionValidTeamIds.has(String(assignment.speedLiteTeamId || ''))
      })
      const suggestionTeamRows = suggestionTeams.map((team) => {
        const members = suggestionAssignedBuilders.filter((builder) => String(getAssignment(builder.id).speedLiteTeamId || '') === team.id)
        const activeMembers = members.filter((builder) => staffedStatuses().includes(getAssignment(builder.id).status || 'Present'))
        return { ...team, members, activeMembers, status: speedLiteTeamStatus(team, activeMembers.length) }
      })
      const suggestionTeamEventsToday = Array.isArray(dayState.speedLiteTeamHistory) ? dayState.speedLiteTeamHistory : []
      suggestionTeamRows.forEach((team) => {
        if (team.status.key === 'needs') suggestions.unshift({ title: team.name + ' needs ' + (team.targetSize - team.activeMembers.length) + ' more builder(s)', reason: team.name + ' has ' + team.activeMembers.length + ' active builder(s) against a target of ' + team.targetSize + '. This is advisory only.' })
        if (team.status.key === 'over') suggestions.unshift({ title: team.name + ' is over target', reason: team.name + ' has ' + team.activeMembers.length + ' active builders against a target of ' + team.targetSize + '. Review the staffing plan before moving anyone.' })
        if (team.status.key === 'empty') suggestions.push({ title: team.name + ' is empty', reason: 'The team exists but has no active builders for ' + state.selectedDay + '.' })
      })
      if (suggestionUngroupedActiveBuilders.length) suggestions.unshift({ title: suggestionUngroupedActiveBuilders.length + ' Speed Lite builder(s) are ungrouped', reason: suggestionUngroupedActiveBuilders.map((builder) => builder.name).join(', ') + ' remain in Speed Lite Production HC but are not assigned to a team.' })
      const movesByBuilder = suggestionTeamEventsToday.filter((event) => String(event.action || '').includes('Builder')).reduce((acc, event) => { if (event.builder) acc[event.builder] = (acc[event.builder] || 0) + 1; return acc }, {})
      Object.entries(movesByBuilder).filter(([, count]) => count >= 3).forEach(([builder, count]) => suggestions.push({ title: builder + ' changed Speed Lite teams ' + count + ' times today', reason: 'Frequent team movement may affect continuity. Review the movement history before making another change.' }))
    }
    return suggestions.slice(0, 18)`
      )
      return next === code ? null : { code: next, map: null }
    },
  }
}
