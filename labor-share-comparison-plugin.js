export function laborShareComparisonPlugin() {
  return {
    name: 'staffboard-labor-share-comparison',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      next = next.replace(
        `    const assignments = selected.assignments || {}
    const status = { present: 0, training: 0, indirect: 0, pto: 0, loa: 0, vto: 0, absent: 0, unassigned: 0, lineLeads: 0 }
    let headcount = 0
    Object.entries(assignments).forEach(([builderId, assignment]) => {
      const value = assignment.status || 'Present'
      const key = value.toLowerCase()
      if (Object.prototype.hasOwnProperty.call(status, key)) status[key] += 1
      if (!['PTO', 'LOA', 'VTO', 'Absent'].includes(value)) headcount += 1
      const profile = state.builderPool.find((builder) => builder.id === builderId) || {}
      if (profile.isLineLead) status.lineLeads += 1
      if (staffedStatuses().includes(value) && (assignment.area || 'Unassigned') === 'Unassigned' && !profile.isLineLead) status.unassigned += 1
    })`,
        `    const assignments = selected.assignments || {}
    const scopedAreaDefs = normalizeAreaDefinitions(boardState?.areaDefs || preset.areaDefs || [], boardId)
    const scopedAreaType = (areaName) => scopedAreaDefs.find((area) => area.name === (areaName || 'Unassigned'))?.areaType || inferredAreaType(areaName, boardId)
    const status = { present: 0, training: 0, indirect: 0, pto: 0, loa: 0, vto: 0, absent: 0, unassigned: 0, lineLeads: 0 }
    let headcount = 0
    let productionHeadcount = 0
    let laborShareHeadcount = 0
    let laborSharedLineLeads = 0
    Object.entries(assignments).forEach(([builderId, assignment]) => {
      const value = assignment.status || 'Present'
      const key = value.toLowerCase()
      if (Object.prototype.hasOwnProperty.call(status, key)) status[key] += 1
      if (!['PTO', 'LOA', 'VTO', 'Absent'].includes(value)) headcount += 1
      const profile = state.builderPool.find((builder) => builder.id === builderId) || {}
      const type = scopedAreaType(assignment.area || 'Unassigned')
      if (profile.isLineLead) status.lineLeads += 1
      if (staffedStatuses().includes(value) && type === 'production' && (!profile.isLineLead || profile.countsAsProductionLabor)) productionHeadcount += 1
      if (staffedStatuses().includes(value) && type === 'labor_share') {
        laborShareHeadcount += 1
        if (profile.isLineLead) laborSharedLineLeads += 1
      }
      if (staffedStatuses().includes(value) && type === 'unassigned') status.unassigned += 1
    })`
      )
      next = next.replace(
        `    const normalizedTPH = headcount > 0 ? completed / (headcount * SHIFT_HOURS) : 0
    const requiredTPH = headcount > 0 ? goal / (headcount * SHIFT_HOURS) : 0`,
        `    const comparisonTPHHeadcount = String(boardId).startsWith('speed_') ? productionHeadcount : headcount
    const normalizedTPH = comparisonTPHHeadcount > 0 ? completed / (comparisonTPHHeadcount * SHIFT_HOURS) : 0
    const requiredTPH = comparisonTPHHeadcount > 0 ? goal / (comparisonTPHHeadcount * SHIFT_HOURS) : 0`
      )
      next = next.replace(
        `    return { boardId, label: preset.label, title: preset.title, shift: preset.shift, boardType: String(boardId).split('_')[0], headcount, status, goal, completed, normalizedTPH, requiredTPH, completion, overCapacity, missingSkills, rackGoalMissing: !numVal(ops.targetRackMediaRecovery) && !numVal(ops.targetRackPrep), mediaMissing: !numVal(ops.totalMediaCount), assignments }`,
        `    return { boardId, label: preset.label, title: preset.title, shift: preset.shift, boardType: String(boardId).split('_')[0], headcount, productionHeadcount, laborShareHeadcount, laborSharedLineLeads, status, goal, completed, normalizedTPH, requiredTPH, completion, overCapacity, missingSkills, rackGoalMissing: !numVal(ops.targetRackMediaRecovery) && !numVal(ops.targetRackPrep), mediaMissing: !numVal(ops.totalMediaCount), assignments }`
      )

      return next === code ? null : { code: next, map: null }
    },
  }
}
