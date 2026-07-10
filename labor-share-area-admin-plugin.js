export function laborShareAreaAdminPlugin() {
  return {
    name: 'staffboard-labor-share-area-admin',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      if (!next.includes('const updateAreaDefinition =')) {
        const marker = '  const activateBuilderForDay = (builderId) => {'
        const logic = `  const areaAssignedCount = (areaName) => WEEKDAYS.reduce((sum, day) => {
    const assignments = state.weeklyData?.[day]?.assignments || {}
    return sum + Object.values(assignments).filter((assignment) => (assignment.area || 'Unassigned') === areaName).length
  }, 0)

  const updateAreaDefinition = (areaName, patch) => {
    const current = effectiveAreaDefsTyped.find((area) => area.name === areaName)
    if (!current) return
    if (patch.areaType && patch.areaType !== current.areaType && areaAssignedCount(areaName) > 0) {
      if (!confirm('Change ' + areaName + ' from ' + areaTypeLabel(current.areaType) + ' to ' + areaTypeLabel(patch.areaType) + '? ' + areaAssignedCount(areaName) + ' assignment(s) currently use this area.')) return
    }
    saveState((prev) => appendAudit({
      ...prev,
      areaDefs: normalizeAreaDefinitions(prev.areaDefs || AREA_DEFS, prev.currentBoardId).map((area) => area.name === areaName ? normalizeAreaDefinition({ ...area, ...patch }, prev.currentBoardId) : area),
    }, {
      action: patch.areaType ? 'Area Type Changed' : 'Area Definition Updated',
      oldValue: patch.areaType ? areaTypeLabel(current.areaType) : areaName,
      newValue: patch.areaType ? areaTypeLabel(patch.areaType) : JSON.stringify(patch),
    }))
  }

  const renameArea = (areaName) => {
    const nextName = clean(prompt('Rename area:', areaName))
    if (!nextName || nextName === areaName) return
    if (effectiveAreaDefsTyped.some((area) => area.name.toLowerCase() === nextName.toLowerCase())) return alert('An area with that name already exists.')
    const assigned = areaAssignedCount(areaName)
    if (assigned > 0 && !confirm('Rename ' + areaName + ' to ' + nextName + '? Current assignments in this week will be updated. Historical area sessions will remain unchanged.')) return
    saveState((prev) => {
      const weeklyData = { ...prev.weeklyData }
      WEEKDAYS.forEach((day) => {
        const dayData = weeklyData[day] || defaultDay()
        const assignments = { ...(dayData.assignments || {}) }
        Object.entries(assignments).forEach(([builderId, assignment]) => {
          if ((assignment.area || 'Unassigned') === areaName) assignments[builderId] = { ...assignment, area: nextName, updatedAt: nowString() }
        })
        weeklyData[day] = { ...dayData, assignments }
      })
      return appendAudit({
        ...prev,
        weeklyData,
        areaDefs: normalizeAreaDefinitions(prev.areaDefs || AREA_DEFS, prev.currentBoardId).map((area) => area.name === areaName ? { ...area, name: nextName } : area),
      }, { action: 'Area Renamed', oldValue: areaName, newValue: nextName })
    })
  }

`
        next = next.replace(marker, logic + marker)
      }

      const oldManage = `        <div className="section">
          <h2>Manage Areas</h2>
          <div className="row">
            <div className="row-inline">
              <input value={newAreaName} onChange={(e) => setNewAreaName(e.target.value)} placeholder="Add new area" />
              <button className="primary" onClick={addArea}>Add Area</button>
            </div>
          </div>
          <div className="area-admin-list">
            {effectiveAreaDefs.map((area) => (
              <div key={area.name} className="area-admin-row">
                <div>
                  <strong>{area.name}</strong>
                  <div className="small">{area.note || 'Custom staffing area'}</div>
                </div>
                {area.name !== 'Unassigned' ? <button className="mini-btn danger-lite" onClick={() => deleteArea(area.name)}>Delete</button> : <span className="small">Locked</span>}
              </div>
            ))}
          </div>
        </div>`

      const newManage = `        <div className="section">
          <h2>Manage Areas</h2>
          <div className="small">Area type controls SPEED TPH eligibility. Labor Share and Support staff remain in Total Shift HC but are excluded from SPEED Production HC.</div>
          <div className="row two">
            <div><label>New Area</label><input value={newAreaName} onChange={(e) => setNewAreaName(e.target.value)} placeholder="Add new area" /></div>
            <div><label>Area Type</label><select id="newAreaType" defaultValue="production">{AREA_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          </div>
          <button className="primary" onClick={addArea}>Add Area</button>
          <div className="area-admin-list labor-share-area-admin-list">
            {effectiveAreaDefs.map((area) => (
              <div key={area.name} className={\`area-admin-row area-admin-type-${'${area.areaType}'}\`}>
                <div className="area-admin-main">
                  <div className="row-inline"><strong>{area.name}</strong><span className={\`area-type-badge area-type-${'${area.areaType}'}\`}>{areaTypeLabel(area.areaType)}</span></div>
                  <div className="row two">
                    <div><label>Type</label><select value={area.areaType || 'production'} disabled={area.name === 'Unassigned'} onChange={(e) => updateAreaDefinition(area.name, { areaType: e.target.value })}>{AREA_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                    <div><label>Capacity</label><input type="number" defaultValue={area.capacity || ''} onBlur={(e) => updateAreaDefinition(area.name, { capacity: e.target.value })} /></div>
                  </div>
                  <div><label>Area Note</label><input defaultValue={area.note || ''} onBlur={(e) => updateAreaDefinition(area.name, { note: e.target.value })} /></div>
                </div>
                <div className="pool-actions">
                  {area.name !== 'Unassigned' ? <button className="mini-btn" onClick={() => renameArea(area.name)}>Rename</button> : null}
                  {area.name !== 'Unassigned' ? <button className="mini-btn danger-lite" onClick={() => deleteArea(area.name)}>Delete</button> : <span className="small">Locked</span>}
                </div>
              </div>
            ))}
          </div>
        </div>`
      next = next.replace(oldManage, newManage)

      next = next.replace(
        `                  <div className="row">
                    <label className="check-pill"><input type="checkbox" checked={!!selectedPoolBuilder.isLineLead} onChange={(e) => updatePoolBuilder(selectedPoolBuilderId, { isLineLead: e.target.checked })} />Line Lead</label>
                  </div>`,
        `                  <div className="row two">
                    <label className="check-pill"><input type="checkbox" checked={!!selectedPoolBuilder.isLineLead} onChange={(e) => updatePoolBuilder(selectedPoolBuilderId, { isLineLead: e.target.checked })} />Line Lead</label>
                    <label className="check-pill"><input type="checkbox" checked={!!selectedPoolBuilder.countsAsProductionLabor} onChange={(e) => updatePoolBuilder(selectedPoolBuilderId, { countsAsProductionLabor: e.target.checked })} />Counts as Production Labor</label>
                  </div>
                  <div className="small">Line leads are excluded from SPEED Production HC unless “Counts as Production Labor” is enabled and they are assigned to a Production area.</div>`
      )

      return next === code ? null : { code: next, map: null }
    },
  }
}
