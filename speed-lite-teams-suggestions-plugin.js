export function speedLiteTeamsSuggestionsPlugin() {
  return {
    name: 'staffboard-speed-lite-teams-suggestions',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code
      next = next.replace(
        '    return suggestions.slice(0, 14)',
        `    if (speedLiteTeamsEnabled) {
      speedLiteTeamRows.forEach((team) => {
        if (team.status.key === 'needs') suggestions.unshift({ title: team.name + ' needs ' + (team.targetSize - team.activeMembers.length) + ' more builder(s)', reason: team.name + ' has ' + team.activeMembers.length + ' active builder(s) against a target of ' + team.targetSize + '. This is advisory only.' })
        if (team.status.key === 'over') suggestions.unshift({ title: team.name + ' is over target', reason: team.name + ' has ' + team.activeMembers.length + ' active builders against a target of ' + team.targetSize + '. Review the staffing plan before moving anyone.' })
        if (team.status.key === 'empty') suggestions.push({ title: team.name + ' is empty', reason: 'The team exists but has no active builders for ' + state.selectedDay + '.' })
      })
      if (speedLiteUngroupedActiveBuilders.length) suggestions.unshift({ title: speedLiteUngroupedActiveBuilders.length + ' Speed Lite builder(s) are ungrouped', reason: speedLiteUngroupedActiveBuilders.map((builder) => builder.name).join(', ') + ' remain in Speed Lite Production HC but are not assigned to a team.' })
      const movesByBuilder = speedLiteTeamEventsToday.filter((event) => String(event.action || '').includes('Builder')).reduce((acc, event) => { if (event.builder) acc[event.builder] = (acc[event.builder] || 0) + 1; return acc }, {})
      Object.entries(movesByBuilder).filter(([, count]) => count >= 3).forEach(([builder, count]) => suggestions.push({ title: builder + ' changed Speed Lite teams ' + count + ' times today', reason: 'Frequent team movement may affect continuity. Review the movement history before making another change.' }))
    }
    return suggestions.slice(0, 18)`
      )
      return next === code ? null : { code: next, map: null }
    },
  }
}
