export function speedLiteTeamsLogicPlugin() {
  return {
    name: 'staffboard-speed-lite-teams-logic',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code
      if (next.includes('const speedLiteTeamRows =')) return null

      const marker = '  return (\n    <div className={state.darkMode ? "app dark" : "app"}'
      const logic = `  const speedLiteTeamsEnabled = String(state.currentBoardId || '').startsWith('speed_')
  const speedLiteTeams = normalizeSpeedLiteTeams(dayState)
  const speedLiteAssignedBuilders = activeBuilders.filter((builder) => (getAssignment(builder.id).area || '') === 'Speed Lite')
  const speedLiteActiveBuilders = speedLiteAssignedBuilders.filter((builder) => staffedStatuses().includes(getAssignment(builder.id).status || 'Present'))
  const validSpeedLiteTeamIds = new Set(speedLiteTeams.map((team) => team.id))
  const speedLiteUngroupedBuilders = speedLiteAssignedBuilders.filter((builder) => !validSpeedLiteTeamIds.has(String(getAssignment(builder.id).speedLiteTeamId || '')))
  const speedLiteUngroupedActiveBuilders = speedLiteUngroupedBuilders.filter((builder) => staffedStatuses().includes(getAssignment(builder.id).status || 'Present'))
  const speedLiteTeamRows = speedLiteTeams.map((team, index) => {
    const members = speedLiteAssignedBuilders.filter((builder) => String(getAssignment(builder.id).speedLiteTeamId || '') === team.id)
    const activeMembers = members.filter((builder) => staffedStatuses().includes(getAssignment(builder.id).status || 'Present'))
    const teamLead = members.find((builder) => builder.id === team.teamLeadBuilderId) || null
    const status = speedLiteTeamStatus(team, activeMembers.length)
    const hours = members.reduce((sum, builder) => sum + speedLiteTeamHoursForAssignment(getAssignment(builder.id), team.id, state.selectedDay, state.weekStartDate), 0)
    return { ...team, index, members, activeMembers, teamLead, status, hours }
  })
  const speedLiteTeamMetrics = {
    headcount: speedLiteActiveBuilders.length,
    configuredTeams: speedLiteTeams.length,
    activeTeams: speedLiteTeamRows.filter((row) => row.activeMembers.length > 0).length,
    completeTeams: speedLiteTeamRows.filter((row) => row.status.key === 'complete').length,
    understaffedTeams: speedLiteTeamRows.filter((row) => row.status.key === 'needs').length,
    overTargetTeams: speedLiteTeamRows.filter((row) => row.status.key === 'over').length,
    emptyTeams: speedLiteTeamRows.filter((row) => row.status.key === 'empty').length,
    ungrouped: speedLiteUngroupedActiveBuilders.length,
    averageTeamSize: speedLiteTeamRows.length ? speedLiteTeamRows.reduce((sum, row) => sum + row.activeMembers.length, 0) / speedLiteTeamRows.length : 0,
    teamLeads: speedLiteTeamRows.filter((row) => !!row.teamLead).length,
  }
  const speedLiteTeamEventsToday = Array.isArray(dayState.speedLiteTeamHistory) ? dayState.speedLiteTeamHistory : []

  const speedLiteTeamEvent = (action, builderName = '', previousTeam = '', newTeam = '', detail = '') => ({
    timestamp: nowString(),
    timestampIso: nowIso(),
    admin: enhancementAdmin,
    boardId: state.currentBoardId,
    board: boardLabel,
    shift: BOARD_PRESETS[state.currentBoardId]?.shift || state.boardShift,
    week: state.weekStartDate,
    day: state.selectedDay,
    builder: builderName,
    action,
    previousTeam,
    newTeam,
    detail,
  })

  const createSpeedLiteTeam = () => {
    if (!speedLiteTeamsEnabled) return alert('Speed Lite teams are available on SPEED boards only.')
    const suggested = 'Team ' + (speedLiteTeams.length + 1)
    const name = clean(prompt('Team name?', suggested))
    if (!name) return
    saveState((prev) => {
      const current = clone(prev.weeklyData[prev.selectedDay] || defaultDay())
      const teams = normalizeSpeedLiteTeams(current)
      if (teams.some((team) => team.name.toLowerCase() === name.toLowerCase())) return prev
      const team = { id: 'slt-' + makeId(), name, targetSize: 2, teamLeadBuilderId: '', collapsed: false, createdAt: nowString(), createdBy: enhancementAdmin, updatedAt: nowString() }
      const event = speedLiteTeamEvent('Speed Lite Team Created', '', '', name, 'Target size 2')
      const nextDay = { ...current, speedLiteTeams: [...teams, team], speedLiteTeamHistory: [event, ...(current.speedLiteTeamHistory || [])].slice(0, 1000), updatedAt: nowString() }
      return appendAudit({ ...prev, weeklyData: { ...prev.weeklyData, [prev.selectedDay]: nextDay } }, { action: event.action, oldValue: '', newValue: name })
    })
  }

  const renameSpeedLiteTeam = (teamId) => {
    const team = speedLiteTeams.find((row) => row.id === teamId)
    if (!team) return
    const name = clean(prompt('Rename team?', team.name))
    if (!name || name === team.name) return
    saveState((prev) => {
      const current = clone(prev.weeklyData[prev.selectedDay] || defaultDay())
      const teams = normalizeSpeedLiteTeams(current).map((row) => row.id === teamId ? { ...row, name, updatedAt: nowString() } : row)
      const assignments = { ...(current.assignments || {}) }
      Object.keys(assignments).forEach((builderId) => {
        const assignment = assignments[builderId]
        if (String(assignment.speedLiteTeamId || '') !== teamId) return
        assignments[builderId] = { ...assignment, speedLiteTeamHistory: (assignment.speedLiteTeamHistory || []).map((history) => String(history.teamId || '') === teamId ? { ...history, teamName: name } : history) }
      })
      const event = speedLiteTeamEvent('Speed Lite Team Renamed', '', team.name, name)
      const nextDay = { ...current, assignments, speedLiteTeams: teams, speedLiteTeamHistory: [event, ...(current.speedLiteTeamHistory || [])].slice(0, 1000), updatedAt: nowString() }
      return appendAudit({ ...prev, weeklyData: { ...prev.weeklyData, [prev.selectedDay]: nextDay } }, { action: event.action, oldValue: team.name, newValue: name })
    })
  }

  const setSpeedLiteTeamTarget = (teamId, targetValue) => {
    const targetSize = Math.max(1, Math.min(4, Number(targetValue || 2)))
    const team = speedLiteTeams.find((row) => row.id === teamId)
    if (!team || team.targetSize === targetSize) return
    const activeCount = speedLiteTeamRows.find((row) => row.id === teamId)?.activeMembers.length || 0
    if (activeCount > targetSize && !confirm(team.name + ' currently has ' + activeCount + ' active builders. Set target to ' + targetSize + ' and mark it Over Target?')) return
    saveState((prev) => {
      const current = clone(prev.weeklyData[prev.selectedDay] || defaultDay())
      const teams = normalizeSpeedLiteTeams(current).map((row) => row.id === teamId ? { ...row, targetSize, updatedAt: nowString() } : row)
      const event = speedLiteTeamEvent('Speed Lite Team Target Changed', '', String(team.targetSize), String(targetSize), team.name)
      const nextDay = { ...current, speedLiteTeams: teams, speedLiteTeamHistory: [event, ...(current.speedLiteTeamHistory || [])].slice(0, 1000), updatedAt: nowString() }
      return appendAudit({ ...prev, weeklyData: { ...prev.weeklyData, [prev.selectedDay]: nextDay } }, { action: event.action, oldValue: team.name + ': ' + team.targetSize, newValue: team.name + ': ' + targetSize })
    })
  }

  const deleteSpeedLiteTeam = (teamId) => {
    const row = speedLiteTeamRows.find((team) => team.id === teamId)
    if (!row) return
    if (row.members.length) return alert('Move all builders out of ' + row.name + ' before deleting it.')
    if (!confirm('Delete empty team "' + row.name + '"?')) return
    saveState((prev) => {
      const current = clone(prev.weeklyData[prev.selectedDay] || defaultDay())
      const teams = normalizeSpeedLiteTeams(current).filter((team) => team.id !== teamId)
      const event = speedLiteTeamEvent('Speed Lite Team Deleted', '', row.name, '')
      const nextDay = { ...current, speedLiteTeams: teams, speedLiteTeamHistory: [event, ...(current.speedLiteTeamHistory || [])].slice(0, 1000), updatedAt: nowString() }
      return appendAudit({ ...prev, weeklyData: { ...prev.weeklyData, [prev.selectedDay]: nextDay } }, { action: event.action, oldValue: row.name, newValue: 'Deleted' })
    })
  }

  const reorderSpeedLiteTeam = (teamId, direction) => {
    saveState((prev) => {
      const current = clone(prev.weeklyData[prev.selectedDay] || defaultDay())
      const teams = normalizeSpeedLiteTeams(current)
      const index = teams.findIndex((team) => team.id === teamId)
      const targetIndex = index + direction
      if (index < 0 || targetIndex < 0 || targetIndex >= teams.length) return prev
      const reordered = [...teams]
      const [moved] = reordered.splice(index, 1)
      reordered.splice(targetIndex, 0, { ...moved, updatedAt: nowString() })
      return { ...prev, weeklyData: { ...prev.weeklyData, [prev.selectedDay]: { ...current, speedLiteTeams: reordered, updatedAt: nowString() } } }
    })
  }

  const toggleSpeedLiteTeamCollapsed = (teamId) => {
    updateDay((prev) => ({ ...prev, speedLiteTeams: normalizeSpeedLiteTeams(prev).map((team) => team.id === teamId ? { ...team, collapsed: !team.collapsed, updatedAt: nowString() } : team) }))
  }

  const setSpeedLiteTeamLead = (teamId, builderId) => {
    const team = speedLiteTeams.find((row) => row.id === teamId)
    if (!team) return
    const builder = builderId ? state.builderPool.find((row) => row.id === builderId) : null
    if (builderId) {
      const assignment = getAssignment(builderId)
      if ((assignment.area || '') !== 'Speed Lite' || String(assignment.speedLiteTeamId || '') !== teamId) return alert('The Team Lead must be a member of this Speed Lite team.')
      const profile = normalizeBuilderProfile(builder || {})
      if (profile.isLineLead && !profile.countsAsProductionLabor) return alert('A permanent Line Lead must be marked Counts as Production Labor before leading a Speed Lite production team.')
    }
    const previousLead = state.builderPool.find((row) => row.id === team.teamLeadBuilderId)?.name || ''
    saveState((prev) => {
      const current = clone(prev.weeklyData[prev.selectedDay] || defaultDay())
      const teams = normalizeSpeedLiteTeams(current).map((row) => ({ ...row, teamLeadBuilderId: row.id === teamId ? builderId : (row.teamLeadBuilderId === builderId ? '' : row.teamLeadBuilderId), updatedAt: row.id === teamId || row.teamLeadBuilderId === builderId ? nowString() : row.updatedAt }))
      const action = builderId ? (team.teamLeadBuilderId ? 'Speed Lite Team Lead Changed' : 'Speed Lite Team Lead Assigned') : 'Speed Lite Team Lead Removed'
      const event = speedLiteTeamEvent(action, builder?.name || previousLead, previousLead, builder?.name || '', team.name)
      const nextDay = { ...current, speedLiteTeams: teams, speedLiteTeamHistory: [event, ...(current.speedLiteTeamHistory || [])].slice(0, 1000), updatedAt: nowString() }
      return appendAudit({ ...prev, weeklyData: { ...prev.weeklyData, [prev.selectedDay]: nextDay } }, { builder: builder?.name || previousLead, action, oldValue: previousLead || 'None', newValue: builder?.name || 'None' })
    })
  }

  const moveBuilderToSpeedLiteTeam = (builderId, teamId) => {
    const team = speedLiteTeamRows.find((row) => row.id === teamId)
    const builder = state.builderPool.find((row) => row.id === builderId) || activeBuilders.find((row) => row.id === builderId)
    if (!team || !builder) return
    const profile = normalizeBuilderProfile(builder)
    if (profile.isLineLead && !profile.countsAsProductionLabor) return alert(builder.name + ' is a Line Lead. Enable Counts as Production Labor before assigning them to a Speed Lite team.')
    const before = getAssignment(builderId)
    const alreadyMember = (before.area || '') === 'Speed Lite' && String(before.speedLiteTeamId || '') === teamId
    if (alreadyMember) return
    if (team.activeMembers.length >= team.targetSize && !confirm(team.name + ' is already at its target of ' + team.targetSize + '. Add ' + builder.name + ' and mark the team Over Target?')) return
    const previousTeam = speedLiteTeams.find((row) => row.id === String(before.speedLiteTeamId || ''))
    const ts = nowIso()
    saveState((prev) => {
      const current = clone(prev.weeklyData[prev.selectedDay] || defaultDay())
      const currentAssignment = current.assignments?.[builderId] || blankAssignment()
      const nextDraft = {
        ...currentAssignment,
        area: 'Speed Lite',
        status: ['PTO', 'LOA', 'VTO', 'Absent'].includes(currentAssignment.status) ? 'Present' : (currentAssignment.status || 'Present'),
        speedLiteTeamId: teamId,
        speedLiteTeamHistory: syncSpeedLiteTeamSession(currentAssignment, teamId, team.name, ts),
        updatedAt: nowString(),
      }
      const nextAssignment = { ...nextDraft, areaHistory: syncAreaSession(currentAssignment, nextDraft, ts) }
      const teams = normalizeSpeedLiteTeams(current).map((row) => row.teamLeadBuilderId === builderId && row.id !== teamId ? { ...row, teamLeadBuilderId: '', updatedAt: nowString() } : row)
      const action = previousTeam ? 'Builder Moved Between Speed Lite Teams' : 'Builder Assigned to Speed Lite Team'
      const event = speedLiteTeamEvent(action, builder.name, previousTeam?.name || (currentAssignment.area || 'Unassigned'), team.name)
      const movement = { timestamp: nowString(), admin: enhancementAdmin, builder: builder.name, action, fromArea: currentAssignment.area || 'Unassigned', toArea: 'Speed Lite', fromTeam: previousTeam?.name || '', toTeam: team.name, fromStatus: currentAssignment.status || 'Present', toStatus: nextAssignment.status || 'Present', notes: 'Speed Lite team drag' }
      const nextDay = { ...current, assignments: { ...(current.assignments || {}), [builderId]: nextAssignment }, speedLiteTeams: teams, speedLiteTeamHistory: [event, ...(current.speedLiteTeamHistory || [])].slice(0, 1000), movementLog: [movement, ...(current.movementLog || [])].slice(0, 1000), updatedAt: nowString() }
      return appendAudit({ ...prev, weeklyData: { ...prev.weeklyData, [prev.selectedDay]: nextDay } }, { builder: builder.name, action, oldValue: event.previousTeam, newValue: team.name })
    })
  }

  const moveBuilderToSpeedLiteUngrouped = (builderId) => {
    const builder = state.builderPool.find((row) => row.id === builderId) || activeBuilders.find((row) => row.id === builderId)
    const before = getAssignment(builderId)
    const previousTeam = speedLiteTeams.find((row) => row.id === String(before.speedLiteTeamId || ''))
    if (!builder || !previousTeam) return
    const ts = nowIso()
    saveState((prev) => {
      const current = clone(prev.weeklyData[prev.selectedDay] || defaultDay())
      const assignment = current.assignments?.[builderId] || blankAssignment()
      const nextAssignment = { ...assignment, area: 'Speed Lite', speedLiteTeamId: '', speedLiteTeamHistory: syncSpeedLiteTeamSession(assignment, '', '', ts), updatedAt: nowString() }
      const teams = normalizeSpeedLiteTeams(current).map((row) => row.teamLeadBuilderId === builderId ? { ...row, teamLeadBuilderId: '', updatedAt: nowString() } : row)
      const action = 'Builder Removed From Speed Lite Team'
      const event = speedLiteTeamEvent(action, builder.name, previousTeam.name, 'Ungrouped Speed Lite')
      const movement = { timestamp: nowString(), admin: enhancementAdmin, builder: builder.name, action, fromArea: 'Speed Lite', toArea: 'Speed Lite', fromTeam: previousTeam.name, toTeam: 'Ungrouped', fromStatus: assignment.status || 'Present', toStatus: assignment.status || 'Present', notes: 'Kept in Speed Lite' }
      const nextDay = { ...current, assignments: { ...(current.assignments || {}), [builderId]: nextAssignment }, speedLiteTeams: teams, speedLiteTeamHistory: [event, ...(current.speedLiteTeamHistory || [])].slice(0, 1000), movementLog: [movement, ...(current.movementLog || [])].slice(0, 1000), updatedAt: nowString() }
      return appendAudit({ ...prev, weeklyData: { ...prev.weeklyData, [prev.selectedDay]: nextDay } }, { builder: builder.name, action, oldValue: previousTeam.name, newValue: 'Ungrouped Speed Lite' })
    })
  }

`
      next = next.replace(marker, logic + marker)
      return next === code ? null : { code: next, map: null }
    },
  }
}
