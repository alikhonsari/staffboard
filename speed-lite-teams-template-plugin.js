export function speedLiteTeamsTemplatePlugin() {
  return {
    name: 'staffboard-speed-lite-teams-template-tools',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      next = next.replace(
        '<option value="metrics">Goals / Rack Metrics Only</option></select>',
        '<option value="metrics">Goals / Rack Metrics Only</option><option value="speedTeamsFull">Speed Lite Teams + Memberships</option><option value="speedTeamsStructure">Speed Lite Team Structure Only</option><option value="speedAssignmentsNoTeams">Speed Lite Assignments, No Teams</option></select>'
      )
      next = next.replace(
        '<button className="primary" onClick={copySelectedDayScoped}>Copy Day with Scope Check</button>',
        '<div className="small">Speed Lite team modes overwrite only Speed Lite team structure and/or Speed Lite assignments on the target day.</div><button className="primary" onClick={copySelectedDayScoped}>Copy Day with Scope Check</button>'
      )
      next = next.replace(
        '<button className="secondary" onClick={saveScopedDayTemplate}>Save Current Day as Template</button>',
        '<div className="row"><div><label>Speed Lite Template Handling</label><select id="templateSpeedLiteMode"><option value="withTeams">Include Teams + Memberships</option><option value="structureOnly">Team Structure Only</option><option value="withoutTeams">Apply Without Team Structure</option></select></div></div><button className="secondary" onClick={saveScopedDayTemplate}>Save Current Day as Template</button>'
      )

      next = next.replace(
        "    const mode = document.getElementById('copyDayMode')?.value || 'full'\n    if (!BOARD_PRESETS[targetBoardId]",
        "    const mode = document.getElementById('copyDayMode')?.value || 'full'\n    if (String(mode).startsWith('speed') && !confirm('This Speed Lite copy mode may overwrite existing Speed Lite teams or assignments on the target day. Continue?')) return\n    if (!BOARD_PRESETS[targetBoardId]"
      )

      next = next.replace(
        "        if (mode === 'roster') nextDay.assignments = source.assignments || {}\n        if (mode === 'clock')",
        `        if (mode === 'roster') nextDay.assignments = Object.fromEntries(Object.entries(source.assignments || {}).map(([id, assignment]) => [id, { ...assignment, speedLiteTeamId: '', speedLiteTeamHistory: [] }]))
        if (mode === 'speedTeamsFull') {
          const assignments = Object.fromEntries(Object.entries(nextDay.assignments || {}).filter(([, assignment]) => (assignment.area || '') !== 'Speed Lite'))
          Object.entries(source.assignments || {}).filter(([, assignment]) => (assignment.area || '') === 'Speed Lite').forEach(([id, assignment]) => { assignments[id] = clone(assignment) })
          nextDay.assignments = assignments
          nextDay.speedLiteTeams = clone(source.speedLiteTeams || [])
          nextDay.speedLiteTeamHistory = []
        }
        if (mode === 'speedTeamsStructure') {
          nextDay.speedLiteTeams = (source.speedLiteTeams || []).map((team) => ({ ...clone(team), teamLeadBuilderId: '', createdAt: nowString(), createdBy: enhancementAdmin, updatedAt: nowString() }))
          nextDay.assignments = Object.fromEntries(Object.entries(nextDay.assignments || {}).map(([id, assignment]) => [id, (assignment.area || '') === 'Speed Lite' ? { ...assignment, speedLiteTeamId: '', speedLiteTeamHistory: [] } : assignment]))
          nextDay.speedLiteTeamHistory = []
        }
        if (mode === 'speedAssignmentsNoTeams') {
          const assignments = Object.fromEntries(Object.entries(nextDay.assignments || {}).filter(([, assignment]) => (assignment.area || '') !== 'Speed Lite'))
          Object.entries(source.assignments || {}).filter(([, assignment]) => (assignment.area || '') === 'Speed Lite').forEach(([id, assignment]) => { assignments[id] = { ...clone(assignment), speedLiteTeamId: '', speedLiteTeamHistory: [] } })
          nextDay.assignments = assignments
          nextDay.speedLiteTeamHistory = []
        }
        if (mode === 'clock')`
      )

      const oldApply = `    saveState((prev) => appendAudit({ ...prev, weeklyData: { ...prev.weeklyData, [targetDay]: { ...clone(template.data), updatedAt: nowString() } } }, { action: 'Apply ' + (template.scope || 'board') + ' Template', oldValue: template.name, newValue: targetDay }))`
      const newApply = `    saveState((prev) => {
      const speedMode = document.getElementById('templateSpeedLiteMode')?.value || 'withTeams'
      const source = clone(template.data)
      const target = clone(prev.weeklyData[targetDay] || defaultDay())
      let applied = { ...source, updatedAt: nowString() }
      if (speedMode === 'structureOnly') {
        const targetAssignments = Object.fromEntries(Object.entries(target.assignments || {}).map(([id, assignment]) => [id, (assignment.area || '') === 'Speed Lite' ? { ...assignment, speedLiteTeamId: '', speedLiteTeamHistory: [] } : assignment]))
        applied = { ...target, speedLiteTeams: (source.speedLiteTeams || []).map((team) => ({ ...clone(team), teamLeadBuilderId: '', createdAt: nowString(), createdBy: enhancementAdmin, updatedAt: nowString() })), speedLiteTeamHistory: [], assignments: targetAssignments, updatedAt: nowString() }
      }
      if (speedMode === 'withoutTeams') {
        applied = { ...source, speedLiteTeams: [], speedLiteTeamHistory: [], assignments: Object.fromEntries(Object.entries(source.assignments || {}).map(([id, assignment]) => [id, { ...assignment, speedLiteTeamId: '', speedLiteTeamHistory: [] }])), updatedAt: nowString() }
      }
      return appendAudit({ ...prev, weeklyData: { ...prev.weeklyData, [targetDay]: applied } }, { action: 'Apply ' + (template.scope || 'board') + ' Template · ' + speedMode, oldValue: template.name, newValue: targetDay })
    })`
      next = next.replace(oldApply, newApply)

      return next === code ? null : { code: next, map: null }
    },
  }
}
