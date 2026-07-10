export function speedLiteTeamsMovementPlugin() {
  return {
    name: 'staffboard-speed-lite-teams-movement',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      const updateStart = next.indexOf('  const updateBuilderAssignment = (builderId, patch) => {')
      const updateEnd = updateStart >= 0 ? next.indexOf('  const saveCurrentWeekSnapshot = () => {', updateStart) : -1
      if (updateStart >= 0 && updateEnd > updateStart) {
        const block = `  const updateBuilderAssignment = (builderId, patch) => {
    if (!builderId) return
    const previewAssignment = getAssignment(builderId)
    const previewTeam = speedLiteTeams.find((team) => team.id === String(previewAssignment.speedLiteTeamId || ''))
    const becomingUnavailable = patch.status !== undefined && ['PTO', 'LOA', 'VTO', 'Absent'].includes(patch.status)
    if (becomingUnavailable && previewTeam?.teamLeadBuilderId === builderId) {
      alert((state.builderPool.find((builder) => builder.id === builderId)?.name || 'This builder') + ' was the Team Lead for ' + previewTeam.name + '. The Team Lead assignment will be cleared; please select a replacement.')
    }
    updateDay((prev) => {
      const currentAssignment = prev.assignments?.[builderId] || blankAssignment()
      const builder = state.builderPool.find((b) => b.id === builderId) || activeBuilders.find((b) => b.id === builderId) || { name: builderId }
      const timestamp = nowString()
      const timestampIso = nowIso()
      const currentStatus = currentAssignment.status || 'Present'
      const currentArea = currentAssignment.area || 'Unassigned'
      const nextAssignment = {
        ...currentAssignment,
        ...patch,
        updatedAt: timestamp,
      }
      const nextStatus = nextAssignment.status || 'Present'
      const nextArea = nextAssignment.area || 'Unassigned'
      const currentAreaType = areaTypeFor(currentArea)
      const nextAreaType = areaTypeFor(nextArea)
      if (patch.area !== undefined && currentAreaType === 'production' && nextAreaType === 'labor_share') nextAssignment.previousProductionArea = currentArea
      else if (!nextAssignment.previousProductionArea) nextAssignment.previousProductionArea = currentAssignment.previousProductionArea || ''

      const areaChanged = patch.area !== undefined && nextArea !== currentArea
      const previousTeamId = String(currentAssignment.speedLiteTeamId || '')
      const previousTeam = normalizeSpeedLiteTeams(prev).find((team) => team.id === previousTeamId)
      const leaveTeam = !!previousTeamId && (areaChanged || nextArea !== 'Speed Lite')
      if (leaveTeam) {
        nextAssignment.speedLiteTeamId = ''
        nextAssignment.speedLiteTeamHistory = syncSpeedLiteTeamSession(currentAssignment, '', '', timestampIso)
      } else {
        nextAssignment.speedLiteTeamId = currentAssignment.speedLiteTeamId || ''
        nextAssignment.speedLiteTeamHistory = Array.isArray(currentAssignment.speedLiteTeamHistory) ? currentAssignment.speedLiteTeamHistory : []
      }
      if (patch.clockInTime !== undefined && patch.clockInTime && !currentAssignment.sessionStartIso) nextAssignment.sessionStartIso = timestampIso
      nextAssignment.areaHistory = areaChanged ? syncAreaSession(currentAssignment, nextAssignment, timestampIso) : (Array.isArray(currentAssignment.areaHistory) ? currentAssignment.areaHistory : [])

      let movementLog = Array.isArray(prev.movementLog) ? [...prev.movementLog] : []
      let teamHistory = Array.isArray(prev.speedLiteTeamHistory) ? [...prev.speedLiteTeamHistory] : []
      let teams = normalizeSpeedLiteTeams(prev)

      if (leaveTeam && previousTeam) {
        const event = speedLiteTeamEvent('Builder Removed From Speed Lite Team', builder.name, previousTeam.name, nextArea === 'Speed Lite' ? 'Ungrouped Speed Lite' : nextArea)
        teamHistory.unshift(event)
        movementLog.unshift({ timestamp, admin: enhancementAdmin, builder: builder.name, action: event.action, fromArea: currentArea, toArea: nextArea, fromTeam: previousTeam.name, toTeam: nextArea === 'Speed Lite' ? 'Ungrouped' : '', fromStatus: currentStatus, toStatus: nextStatus, notes: 'Manual area edit' })
        teams = teams.map((team) => team.teamLeadBuilderId === builderId ? { ...team, teamLeadBuilderId: '', updatedAt: timestamp } : team)
      }

      if (areaChanged) {
        movementLog.unshift({ timestamp, admin: user?.username || state.adminName || 'System', builder: builder.name, action: laborShareActionFor(builderId, currentArea, nextArea), from: currentArea + ' / ' + currentStatus, to: nextArea + ' / ' + nextStatus, fromArea: currentArea, toArea: nextArea, fromAreaType: currentAreaType, toAreaType: nextAreaType, previousProductionArea: nextAssignment.previousProductionArea || '', note: 'Area changed from ' + currentArea + ' to ' + nextArea })
      }
      if (patch.status !== undefined && nextStatus !== currentStatus) {
        movementLog.unshift({ timestamp, admin: user?.username || state.adminName || 'System', builder: builder.name, action: nextAreaType === 'labor_share' ? 'Labor Share Status Changed' : 'Status Changed', from: nextArea + ' / ' + currentStatus, to: nextArea + ' / ' + nextStatus, fromArea: nextArea, toArea: nextArea, fromAreaType: nextAreaType, toAreaType: nextAreaType, previousProductionArea: nextAssignment.previousProductionArea || '', note: 'Status changed from ' + currentStatus + ' to ' + nextStatus })
        if (['PTO', 'LOA', 'VTO', 'Absent'].includes(nextStatus)) teams = teams.map((team) => team.teamLeadBuilderId === builderId ? { ...team, teamLeadBuilderId: '', updatedAt: timestamp } : team)
      }

      return { ...prev, speedLiteTeams: teams, speedLiteTeamHistory: teamHistory.slice(0, 1000), movementLog: movementLog.slice(0, 1000), assignments: { ...(prev.assignments || {}), [builderId]: nextAssignment } }
    })
  }

`
        next = next.slice(0, updateStart) + block + next.slice(updateEnd)
      }

      const moveStart = next.indexOf('  const moveBuilderBetweenAreas = (builderId, nextArea) => {')
      const moveEnd = moveStart >= 0 ? next.indexOf('  const captureSnapshot = (key, label) => {', moveStart) : -1
      if (moveStart >= 0 && moveEnd > moveStart) {
        const block = `  const moveBuilderBetweenAreas = (builderId, nextArea) => {
    const builder = state.builderPool.find((row) => row.id === builderId) || activeBuilders.find((row) => row.id === builderId)
    const profile = normalizeBuilderProfile(builder || {})
    if (nextArea === 'Speed Lite' && profile.isLineLead && !profile.countsAsProductionLabor) return alert((builder?.name || 'This Line Lead') + ' must be marked Counts as Production Labor before being assigned to Speed Lite.')
    const before = getAssignment(builderId)
    const ts = nowIso()
    const previousTeamId = String(before.speedLiteTeamId || '')
    const previousTeam = speedLiteTeams.find((team) => team.id === previousTeamId)
    const nextDraft = {
      ...before,
      area: nextArea === 'Unassigned' ? '' : nextArea,
      status: ['PTO', 'LOA', 'VTO', 'Absent'].includes(before.status) ? 'Present' : (before.status || 'Present'),
      previousProductionArea: areaTypeFor(before.area || 'Unassigned') === 'production' && areaTypeFor(nextArea || 'Unassigned') === 'labor_share' ? (before.area || '') : (before.previousProductionArea || ''),
      speedLiteTeamId: '',
      speedLiteTeamHistory: previousTeamId ? syncSpeedLiteTeamSession(before, '', '', ts) : (before.speedLiteTeamHistory || []),
      updatedAt: nowString(),
    }
    const nextAssignment = { ...nextDraft, areaHistory: syncAreaSession(before, nextDraft, ts) }
    updateDay((prev) => {
      let teams = normalizeSpeedLiteTeams(prev)
      let teamHistory = Array.isArray(prev.speedLiteTeamHistory) ? [...prev.speedLiteTeamHistory] : []
      let movementLog = Array.isArray(prev.movementLog) ? [...prev.movementLog] : []
      if (previousTeam) {
        const destination = nextArea === 'Speed Lite' ? 'Ungrouped Speed Lite' : nextArea
        const event = speedLiteTeamEvent('Builder Removed From Speed Lite Team', builder?.name || builderId, previousTeam.name, destination)
        teamHistory.unshift(event)
        movementLog.unshift({ timestamp: nowString(), admin: enhancementAdmin, builder: builder?.name || builderId, action: event.action, fromArea: before.area || 'Speed Lite', toArea: nextArea, fromTeam: previousTeam.name, toTeam: nextArea === 'Speed Lite' ? 'Ungrouped' : '', fromStatus: before.status || 'Present', toStatus: nextAssignment.status || 'Present', notes: 'Area drag' })
        teams = teams.map((team) => team.teamLeadBuilderId === builderId ? { ...team, teamLeadBuilderId: '', updatedAt: nowString() } : team)
      }
      return { ...prev, speedLiteTeams: teams, speedLiteTeamHistory: teamHistory.slice(0, 1000), movementLog: movementLog.slice(0, 1000), assignments: { ...prev.assignments, [builderId]: nextAssignment } }
    })
    logMovement(builderId, before, nextAssignment, 'drag')
  }

`
        next = next.slice(0, moveStart) + block + next.slice(moveEnd)
      }

      return next === code ? null : { code: next, map: null }
    },
  }
}
