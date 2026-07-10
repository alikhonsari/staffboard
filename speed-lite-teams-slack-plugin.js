export function speedLiteTeamsSlackPlugin() {
  return {
    name: 'staffboard-speed-lite-teams-slack',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      const startMarker = "  const slackText = (type = 'daily') => {"
      const endMarker = '  const copySlack = async (type) => {'
      const start = code.indexOf(startMarker)
      const end = start >= 0 ? code.indexOf(endMarker, start) : -1
      if (start < 0 || end < 0) return null

      const block = `  const slackText = (type = 'daily') => {
    const issues = []
    if (counts.unassigned) issues.push(counts.unassigned + ' unassigned')
    if (counts.pto) issues.push(counts.pto + ' PTO')
    if (counts.loa + counts.vto + counts.absent) issues.push((counts.loa + counts.vto + counts.absent) + ' unavailable')
    if (laborShareStats.laborShareHeadcount) issues.push(laborShareStats.laborShareHeadcount + ' labor shared')
    if (speedLiteTeamsEnabled && speedLiteTeamMetrics.ungrouped) issues.push(speedLiteTeamMetrics.ungrouped + ' ungrouped in Speed Lite')
    if (speedLiteTeamsEnabled && speedLiteTeamMetrics.understaffedTeams) issues.push(speedLiteTeamMetrics.understaffedTeams + ' understaffed Speed Lite team(s)')
    if (speedLiteTeamsEnabled && speedLiteTeamMetrics.overTargetTeams) issues.push(speedLiteTeamMetrics.overTargetTeams + ' over-target Speed Lite team(s)')
    const risk = currentLiveTPH >= metrics.requiredTPH ? 'Ahead / On Target' : 'Behind by ' + Math.abs(currentLiveTPH - metrics.requiredTPH).toFixed(1) + ' TPH'
    const laborShareAreas = laborShareAreaCounts.filter((area) => area.count > 0).map((area) => area.name + ' ' + area.count).join(' | ') || 'None'
    const scopeLine = boardLabel + ' — ' + state.selectedDay + ' — Week ' + String(weekInfo.week).padStart(2, '0')
    const generatedLine = 'Admin: ' + enhancementAdmin + ' | Generated: ' + new Date().toLocaleString()
    const laborLines = [
      'Total Shift HC: ' + laborShareStats.totalShiftHeadcount,
      'SPEED Production HC: ' + laborShareStats.speedProductionHeadcount,
      'Labor Share HC: ' + laborShareStats.laborShareHeadcount,
      'Line Leads: ' + laborShareStats.lineLeadHeadcount,
      'Labor-Shared Line Leads: ' + laborShareStats.laborSharedLineLeads,
      'Support / Indirect: ' + laborShareStats.supportIndirectHeadcount,
      'Unassigned: ' + laborShareStats.unassignedHeadcount,
      'Labor Share: ' + laborShareAreas,
    ]
    const speedLiteLines = speedLiteTeamsEnabled ? [
      'Speed Lite Teams',
      ...speedLiteTeamRows.map((team) => team.name + ': ' + team.activeMembers.length + '/' + team.targetSize + ' — ' + (team.members.map((builder) => builder.name + (team.teamLeadBuilderId === builder.id ? ' (Lead)' : '')).join(', ') || 'Empty')),
      'Ungrouped: ' + (speedLiteUngroupedBuilders.map((builder) => builder.name).join(', ') || 'None'),
    ] : []
    if (type === 'tph') return [scopeLine, 'Live SPEED TPH: ' + currentLiveTPH.toFixed(1) + ' | Required SPEED TPH: ' + metrics.requiredTPH.toFixed(1), 'Goal completion: ' + efficiencyPct.toFixed(0) + '% | Risk: ' + risk, ...laborLines, ...speedLiteLines, generatedLine].join(String.fromCharCode(10))
    if (type === 'issues') return [scopeLine + ' — Staffing Issues', issues.length ? issues.join(' | ') : 'No major staffing issues detected.', ...laborLines, ...speedLiteLines, generatedLine].join(String.fromCharCode(10))
    return [scopeLine, ...laborLines, ...speedLiteLines, 'Live SPEED TPH: ' + currentLiveTPH.toFixed(1), 'Required SPEED TPH: ' + metrics.requiredTPH.toFixed(1), 'Risk: ' + risk, 'Issues: ' + (issues.length ? issues.join(', ') : 'none'), generatedLine].join(String.fromCharCode(10))
  }

`
      return { code: code.slice(0, start) + block + code.slice(end), map: null }
    },
  }
}
