export function speedLiteTeamsUiPlugin() {
  return {
    name: 'staffboard-speed-lite-teams-ui',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      next = next.replace(
        '                const people = areaBuilders(area.name)\n                return (',
        "                const people = area.name === 'Speed Lite' ? speedLiteUngroupedBuilders : areaBuilders(area.name)\n                const displayedCount = area.name === 'Speed Lite' ? speedLiteAssignedBuilders.length : people.length\n                return ("
      )
      next = next.replace(
        'className={`area area-type-${area.areaType || \'production\'} ${people.length > 0 ? "area-active" : "area-idle"}`}',
        'className={`area area-type-${area.areaType || \'production\'} ${displayedCount > 0 ? "area-active" : "area-idle"} ${area.name === \'Speed Lite\' ? \'speed-lite-team-area\' : \'\'}`}'
      )
      next = next.replace(
        '<div className={`area-count ${people.length > 0 ? "filled" : "empty"}`}>{area.capacity ? `${people.length}/${area.capacity}` : people.length}</div>',
        '<div className={`area-count ${displayedCount > 0 ? "filled" : "empty"}`}>{area.capacity ? `${displayedCount}/${area.capacity}` : displayedCount}</div>'
      )
      next = next.replace(
        "<div className=\"area-meta\">{area.note || 'Drop staff here'}</div>",
        "<div className=\"area-meta\">{area.name === 'Speed Lite' ? (speedLiteTeamMetrics.configuredTeams + ' teams · ' + speedLiteTeamMetrics.ungrouped + ' ungrouped') : (area.note || 'Drop staff here')}</div>"
      )

      const bodyMarker = '                    <div className="area-body">\n                      {people.length ? people.map((builder) => {'
      if (!next.includes('speed-lite-team-workspace')) {
        const workspace = `                    <div className="area-body">
                      {area.name === 'Speed Lite' ? (
                        <div className="speed-lite-team-workspace">
                          <div className="speed-lite-team-toolbar">
                            <div>
                              <strong>Speed Lite Teams</strong>
                              <div className="tiny">Teams group Speed Lite staff only. Production HC and area hours are counted once.</div>
                            </div>
                            <button className="mini-btn primary" onClick={(e) => { e.stopPropagation(); createSpeedLiteTeam() }}>+ Create Team</button>
                          </div>
                          {speedLiteUngroupedActiveBuilders.length > 0 ? <div className="speed-lite-warning">{speedLiteUngroupedActiveBuilders.length} active Speed Lite builder(s) are not assigned to a team.</div> : null}
                          <div className="speed-lite-team-list">
                            {speedLiteTeamRows.map((team) => (
                              <div
                                className={\`speed-lite-team-card team-status-${'${team.status.key}'}\`}
                                key={team.id}
                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const builderId = draggedBuilderId || e.dataTransfer.getData('text/plain'); if (builderId) moveBuilderToSpeedLiteTeam(builderId, team.id) }}
                              >
                                <div className="speed-lite-team-head">
                                  <div>
                                    <div className="speed-lite-team-name">{team.name}</div>
                                    <div className="tiny">{team.activeMembers.length}/{team.targetSize} · {team.status.label} · {team.hours.toFixed(2)}h</div>
                                  </div>
                                  <div className="speed-lite-team-actions">
                                    <button className="mini-btn" title="Move team up" disabled={team.index === 0} onClick={(e) => { e.stopPropagation(); reorderSpeedLiteTeam(team.id, -1) }}>↑</button>
                                    <button className="mini-btn" title="Move team down" disabled={team.index === speedLiteTeamRows.length - 1} onClick={(e) => { e.stopPropagation(); reorderSpeedLiteTeam(team.id, 1) }}>↓</button>
                                    <button className="mini-btn" onClick={(e) => { e.stopPropagation(); renameSpeedLiteTeam(team.id) }}>Rename</button>
                                    <button className="mini-btn" onClick={(e) => { e.stopPropagation(); toggleSpeedLiteTeamCollapsed(team.id) }}>{team.collapsed ? 'Expand' : 'Collapse'}</button>
                                    <button className="mini-btn danger-lite" disabled={team.members.length > 0} onClick={(e) => { e.stopPropagation(); deleteSpeedLiteTeam(team.id) }}>Delete</button>
                                  </div>
                                </div>
                                <div className="speed-lite-team-settings">
                                  <label>Target <select value={team.targetSize} onChange={(e) => setSpeedLiteTeamTarget(team.id, e.target.value)}><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label>
                                  <label>Team Lead <select value={team.teamLeadBuilderId || ''} onChange={(e) => setSpeedLiteTeamLead(team.id, e.target.value)}><option value="">None</option>{team.members.map((builder) => <option key={builder.id} value={builder.id}>{builder.name}</option>)}</select></label>
                                </div>
                                {!team.collapsed ? (
                                  <div className="speed-lite-team-members">
                                    {team.members.length ? team.members.map((builder) => {
                                      const assignment = getAssignment(builder.id)
                                      const profile = normalizeBuilderProfile(state.builderPool.find((item) => item.id === builder.id) || builder)
                                      const isLead = team.teamLeadBuilderId === builder.id
                                      return (
                                        <div className={\`speed-lite-member ${'${!staffedStatuses().includes(assignment.status || \'Present\') ? \'member-unavailable\' : \'\'}'}\`} key={builder.id} draggable onDragStart={(e) => { setDraggedBuilderId(builder.id); e.dataTransfer.setData('text/plain', builder.id); e.stopPropagation() }} onDragEnd={() => setDraggedBuilderId(null)}>
                                          <div><strong>{builder.name}</strong>{isLead ? <span className="speed-lite-lead-badge">Team Lead</span> : null}{profile.isLineLead ? <span className="speed-lite-role-badge">Line Lead</span> : null}<div className="tiny">{assignment.status || 'Present'} · {speedLiteTeamHoursForAssignment(assignment, team.id, state.selectedDay, state.weekStartDate).toFixed(2)}h</div></div>
                                          <button className="mini-btn" onClick={(e) => { e.stopPropagation(); moveBuilderToSpeedLiteUngrouped(builder.id) }}>Ungroup</button>
                                        </div>
                                      )
                                    }) : <div className="small speed-lite-team-drop-hint">Drop builders here.</div>}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                            {!speedLiteTeamRows.length ? <div className="small speed-lite-team-drop-hint">No teams created. Existing Speed Lite builders remain ungrouped.</div> : null}
                          </div>
                          <div className="speed-lite-ungrouped-head" onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const builderId = draggedBuilderId || e.dataTransfer.getData('text/plain'); if (builderId) moveBuilderToSpeedLiteUngrouped(builderId) }}>
                            <strong>Ungrouped Speed Lite Staff</strong><span className="pill">{speedLiteUngroupedBuilders.length}</span>
                          </div>
                        </div>
                      ) : null}
                      {people.length ? people.map((builder) => {`
        next = next.replace(bodyMarker, workspace)
      }

      return next === code ? null : { code: next, map: null }
    },
  }
}
