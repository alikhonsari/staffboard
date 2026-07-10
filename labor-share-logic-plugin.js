export function laborShareLogicPlugin() {
  return {
    name: 'staffboard-labor-share-logic',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      if (!next.includes('const speedProductionHeadcount =')) {
        const marker = '  const metrics = useMemo(() => {'
        const logic = `  const effectiveAreaDefsTyped = useMemo(
    () => normalizeAreaDefinitions(Array.isArray(state.areaDefs) && state.areaDefs.length ? state.areaDefs : AREA_DEFS, state.currentBoardId),
    [state.areaDefs, state.currentBoardId]
  )
  const areaTypeFor = (areaName) => {
    const normalizedName = areaName || 'Unassigned'
    return effectiveAreaDefsTyped.find((area) => area.name === normalizedName)?.areaType || inferredAreaType(normalizedName, state.currentBoardId)
  }
  const activeStaffedBuilders = activeBuilders.filter((builder) => staffedStatuses().includes(getAssignment(builder.id).status || 'Present'))
  const laborShareBuilders = activeStaffedBuilders.filter((builder) => areaTypeFor(getAssignment(builder.id).area || 'Unassigned') === 'labor_share')
  const laborSharedLineLeadBuilders = laborShareBuilders.filter((builder) => normalizeBuilderProfile(state.builderPool.find((profile) => profile.id === builder.id) || builder).isLineLead)
  const supportIndirectBuilders = activeStaffedBuilders.filter((builder) => areaTypeFor(getAssignment(builder.id).area || 'Unassigned') === 'support')
  const unassignedActiveBuilders = activeStaffedBuilders.filter((builder) => areaTypeFor(getAssignment(builder.id).area || 'Unassigned') === 'unassigned')
  const speedProductionBuilders = activeStaffedBuilders.filter((builder) => {
    const assignment = getAssignment(builder.id)
    const profile = normalizeBuilderProfile(state.builderPool.find((item) => item.id === builder.id) || builder)
    return areaTypeFor(assignment.area || 'Unassigned') === 'production' && (!profile.isLineLead || !!profile.countsAsProductionLabor)
  })
  const speedProductionHeadcount = speedProductionBuilders.length
  const isSpeedBoard = String(state.currentBoardId || '').startsWith('speed_')
  const tphHeadcount = isSpeedBoard ? speedProductionHeadcount : totalHeadCount
  const laborShareAreaCounts = effectiveAreaDefsTyped
    .filter((area) => area.areaType === 'labor_share')
    .map((area) => ({ ...area, count: laborShareBuilders.filter((builder) => (getAssignment(builder.id).area || 'Unassigned') === area.name).length }))
  const laborShareHoursToday = laborShareBuilders.reduce((sum, builder) => {
    const assignment = getAssignment(builder.id)
    const hours = computeHoursForAssignment(assignment, state.selectedDay, state.weekStartDate)
    return sum + Number(hours[assignment.area || 'Unassigned'] || 0)
  }, 0)
  const laborShareDetailRows = laborShareBuilders.map((builder) => {
    const assignment = getAssignment(builder.id)
    const profile = normalizeBuilderProfile(state.builderPool.find((item) => item.id === builder.id) || builder)
    const movement = (dayState.movementLog || []).find((row) => row.builder === builder.name && (row.toArea || row.to || '').includes(assignment.area || ''))
    const hours = computeHoursForAssignment(assignment, state.selectedDay, state.weekStartDate)
    return {
      builder,
      assignment,
      profile,
      area: assignment.area || 'Unassigned',
      hours: Number(hours[assignment.area || 'Unassigned'] || 0),
      previousProductionArea: assignment.previousProductionArea || movement?.previousProductionArea || '—',
      admin: movement?.admin || 'System / Legacy',
    }
  })
  const weeklyLaborShareRows = useMemo(() => {
    const rows = []
    state.builderPool.forEach((builder) => {
      WEEKDAYS.forEach((day) => {
        const assignment = state.weeklyData?.[day]?.assignments?.[builder.id]
        if (!assignment || !staffedStatuses().includes(assignment.status || 'Present')) return
        if (areaTypeFor(assignment.area || 'Unassigned') !== 'labor_share') return
        const hours = computeHoursForAssignment(assignment, day, state.weekStartDate)
        rows.push({ builder, day, area: assignment.area || 'Unassigned', hours: Number(hours[assignment.area || 'Unassigned'] || 0) })
      })
    })
    return rows
  }, [state.builderPool, state.weeklyData, state.weekStartDate, effectiveAreaDefsTyped])
  const weeklyLaborShareHours = weeklyLaborShareRows.reduce((sum, row) => sum + row.hours, 0)
  const laborShareStats = {
    totalShiftHeadcount: totalHeadCount,
    speedProductionHeadcount,
    laborShareHeadcount: laborShareBuilders.length,
    laborSharedLineLeads: laborSharedLineLeadBuilders.length,
    lineLeadHeadcount: activeBuilders.filter((builder) => normalizeBuilderProfile(state.builderPool.find((profile) => profile.id === builder.id) || builder).isLineLead).length,
    supportIndirectHeadcount: supportIndirectBuilders.length,
    unassignedHeadcount: unassignedActiveBuilders.length,
    laborShareHoursToday,
    weeklyLaborShareHours,
  }
  const laborShareActionFor = (builderId, beforeArea, afterArea) => {
    const profile = normalizeBuilderProfile(state.builderPool.find((item) => item.id === builderId) || {})
    const beforeType = areaTypeFor(beforeArea || 'Unassigned')
    const afterType = areaTypeFor(afterArea || 'Unassigned')
    if (beforeType !== 'labor_share' && afterType === 'labor_share') return profile.isLineLead ? 'Line Lead Labor Shared' : 'Builder Moved Into Labor Share'
    if (beforeType === 'labor_share' && afterType !== 'labor_share') return profile.isLineLead ? 'Line Lead Returned From Labor Share' : 'Builder Returned From Labor Share'
    return 'Area Movement'
  }

`
        next = next.replace(marker, logic + marker)
      }

      next = next.replace(
        '    const targetTPH = totalHeadCount > 0 ? weightedTarget / (totalHeadCount * SHIFT_HOURS) : 0\n    const requiredTPH = (totalHeadCount > 0 && shift.remainingHours > 0)\n      ? remainingWork / (totalHeadCount * shift.remainingHours)',
        '    const targetTPH = tphHeadcount > 0 ? weightedTarget / (tphHeadcount * SHIFT_HOURS) : 0\n    const requiredTPH = (tphHeadcount > 0 && shift.remainingHours > 0)\n      ? remainingWork / (tphHeadcount * shift.remainingHours)'
      )
      next = next.replace(
        '  }, [dayState.opsMetrics, totalHeadCount, shift.remainingHours])',
        '  }, [dayState.opsMetrics, tphHeadcount, shift.remainingHours])'
      )
      next = next.replace(
        '  const effectiveAreaDefs = Array.isArray(state.areaDefs) && state.areaDefs.length ? state.areaDefs : AREA_DEFS',
        '  const effectiveAreaDefs = effectiveAreaDefsTyped'
      )
      next = next.replace(
        "       return staffedStatuses().includes(assign.status || 'Present') && effectiveArea === a.name && !profile.isLineLead",
        "       return staffedStatuses().includes(assign.status || 'Present') && effectiveArea === a.name && (!profile.isLineLead || a.areaType === 'labor_share' || !!profile.countsAsProductionLabor)"
      )
      next = next.replace(
        '  const currentLiveTPH = shift.hoursWorked > 0 && totalHeadCount > 0 ? weightedDoneWork / (totalHeadCount * shift.hoursWorked) : 0',
        '  const currentLiveTPH = shift.hoursWorked > 0 && tphHeadcount > 0 ? weightedDoneWork / (tphHeadcount * shift.hoursWorked) : 0'
      )
      next = next.replace(
        '  const goalTPHTotalHC = totalHeadCount > 0 && SHIFT_HOURS > 0 ? weightedGoalWork / (totalHeadCount * SHIFT_HOURS) : 0',
        '  const goalTPHTotalHC = tphHeadcount > 0 && SHIFT_HOURS > 0 ? weightedGoalWork / (tphHeadcount * SHIFT_HOURS) : 0'
      )

      const oldProduction = `  const activeProductionHeadcount = activeBuilders.filter((b) => {
    const a = getAssignment(b.id)
    const area = a.area || 'Unassigned'
    const status = a.status || 'Present'
    return staffedStatuses().includes(status) && area !== 'Unassigned' && !normalizeBuilderProfile(state.builderPool.find((p) => p.id === b.id) || b).isLineLead
  }).length`
      next = next.replace(oldProduction, '  const activeProductionHeadcount = tphHeadcount')
      next = next.replace(
        '  const projectedOutputAtTargetTPH = totalHeadCount > 0 ? planningTargetTPH * totalHeadCount * SHIFT_HOURS : 0',
        '  const projectedOutputAtTargetTPH = tphHeadcount > 0 ? planningTargetTPH * tphHeadcount * SHIFT_HOURS : 0'
      )
      next = next.replace(
        '  const projectedAtCurrentPace = currentLiveTPH > 0 && totalHeadCount > 0\n    ? currentLiveTPH * totalHeadCount * SHIFT_HOURS',
        '  const projectedAtCurrentPace = currentLiveTPH > 0 && tphHeadcount > 0\n    ? currentLiveTPH * tphHeadcount * SHIFT_HOURS'
      )
      next = next.replace(
        '  const workPerBuilder = totalHeadCount > 0 ? weightedGoalWork / totalHeadCount : 0',
        '  const workPerBuilder = tphHeadcount > 0 ? weightedGoalWork / tphHeadcount : 0'
      )
      next = next.replace(
        '  const lineLeadBuilders = activeBuilders.filter((b) => normalizeBuilderProfile(state.builderPool.find((p) => p.id === b.id) || b).isLineLead)',
        "  const lineLeadBuilders = activeBuilders.filter((b) => { const profile = normalizeBuilderProfile(state.builderPool.find((p) => p.id === b.id) || b); const areaType = areaTypeFor(getAssignment(b.id).area || 'Unassigned'); return profile.isLineLead && areaType !== 'labor_share' && !(areaType === 'production' && profile.countsAsProductionLabor) })"
      )
      next = next.replace(
        `  const areaBuilders = (areaName) => activeBuilders.filter((b) => {
    const a = getAssignment(b.id)
    const profile = normalizeBuilderProfile(state.builderPool.find((p) => p.id === b.id) || b)
    const effectiveArea = a.area || 'Unassigned'
    return staffedStatuses().includes(a.status || 'Present') && effectiveArea === areaName && !profile.isLineLead
  })`,
        `  const areaBuilders = (areaName) => activeBuilders.filter((b) => {
    const a = getAssignment(b.id)
    const profile = normalizeBuilderProfile(state.builderPool.find((p) => p.id === b.id) || b)
    const effectiveArea = a.area || 'Unassigned'
    const areaType = areaTypeFor(areaName)
    return staffedStatuses().includes(a.status || 'Present') && effectiveArea === areaName && (!profile.isLineLead || areaType === 'labor_share' || !!profile.countsAsProductionLabor)
  })`
      )

      next = next.replace(
        "       status: ['PTO', 'LOA', 'VTO', 'Absent'].includes(before.status) ? 'Present' : (before.status || 'Present'),\n      updatedAt: nowString(),",
        "       status: ['PTO', 'LOA', 'VTO', 'Absent'].includes(before.status) ? 'Present' : (before.status || 'Present'),\n      previousProductionArea: areaTypeFor(before.area || 'Unassigned') === 'production' && areaTypeFor(nextArea || 'Unassigned') === 'labor_share' ? (before.area || '') : (before.previousProductionArea || ''),\n      updatedAt: nowString(),"
      )

      next = next.replace(
        `        timestamp: nowString(),
        builder: builder.name,
        fromArea: before.area || 'Unassigned',
        toArea: after.area || 'Unassigned',
        fromStatus: before.status || 'Present',
        toStatus: after.status || 'Present',
        notes: source,`,
        `        timestamp: nowString(),
        admin: user?.username || state.adminName || 'System',
        builder: builder.name,
        action: laborShareActionFor(builderId, before.area || 'Unassigned', after.area || 'Unassigned'),
        fromArea: before.area || 'Unassigned',
        toArea: after.area || 'Unassigned',
        fromAreaType: areaTypeFor(before.area || 'Unassigned'),
        toAreaType: areaTypeFor(after.area || 'Unassigned'),
        previousProductionArea: after.previousProductionArea || before.previousProductionArea || '',
        fromStatus: before.status || 'Present',
        toStatus: after.status || 'Present',
        notes: source,`
      )

      return next === code ? null : { code: next, map: null }
    },
  }
}
