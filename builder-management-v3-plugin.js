export function builderManagementV3Plugin() {
  return {
    name: 'staffboard-builder-management-v3',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      if (!next.includes("./BuilderManagementWorkspace.jsx")) {
        const importMarker = "import { exportEndOfShiftExcel, exportWeeklyExcel } from './reporting'"
        next = next.replace(importMarker, `${importMarker}\nimport BuilderManagementWorkspace, { DEFAULT_BUILDER_SKILLS } from './BuilderManagementWorkspace.jsx'`)
      }

      if (!next.includes('builderManagementVersion: 1')) {
        next = next.replace(
          "  builderGroups: [],\n",
          "  builderGroups: [],\n  builderLists: [],\n  skillDefinitions: DEFAULT_BUILDER_SKILLS,\n  builderManagementVersion: 1,\n"
        )
      }

      if (!next.includes('removedAssignments: {}')) {
        next = next.replace(
          "  assignments: {},\n  movementLog: [],",
          "  assignments: {},\n  removedAssignments: {},\n  movementLog: [],"
        )
        next = next.replace(
          "        assignments: s.assignments || {},\n        movementLog: s.movementLog || [],",
          "        assignments: s.assignments || {},\n        removedAssignments: s.removedAssignments || {},\n        movementLog: s.movementLog || [],"
        )
      }

      if (!next.includes("    employeeId: '',\n    defaultShift: ''")) {
        const profileMarker = "    countsAsProductionLabor: false,\n"
        const extraFields = `    employeeId: '',
    defaultShift: '',
    defaultBoardId: '',
    defaultArea: '',
    defaultStatus: 'Present',
    defaultClockIn: '',
    defaultClockOut: '',
    startDate: '',
    notes: '',
    trainingNotes: '',
    restrictions: '',
    skills: [],
    skillRecords: [],
    isArchived: false,
    archivedAt: '',
    archivedBy: '',
    archiveReason: '',
    createdAt: '',
    createdBy: '',
    updatedBy: '',
`
        next = next.replaceAll(profileMarker, profileMarker + extraFields)
      }

      if (!next.includes('state.builderManagementVersion = 1')) {
        const normalizeMarker = "  state.builderGroups = Array.isArray(saved?.builderGroups) ? saved.builderGroups : []"
        const normalizeAddition = `${normalizeMarker}
  state.builderGroups = state.builderGroups.map((group) => ({
    id: group.id || ('group-' + Math.random().toString(36).slice(2, 10)),
    name: group.name || 'Unnamed Group',
    description: group.description || '',
    color: group.color || '#64748b',
    icon: group.icon || '◉',
    builderIds: Array.isArray(group.builderIds) ? group.builderIds : [],
    defaultBoardId: group.defaultBoardId || '',
    defaultShift: group.defaultShift || '',
    defaultArea: group.defaultArea || '',
    defaultStatus: group.defaultStatus || 'Present',
    notes: group.notes || '',
    isArchived: !!group.isArchived,
    ...group,
  }))
  state.builderLists = Array.isArray(saved?.builderLists) ? saved.builderLists.map((list) => ({
    id: list.id || ('list-' + Math.random().toString(36).slice(2, 10)),
    name: list.name || 'Unnamed List',
    description: list.description || '',
    type: list.type === 'smart' ? 'smart' : 'static',
    builderIds: Array.isArray(list.builderIds) ? list.builderIds : [],
    filters: list.filters && typeof list.filters === 'object' ? list.filters : {},
    isArchived: !!list.isArchived,
    createdAt: list.createdAt || '',
    createdBy: list.createdBy || '',
    updatedAt: list.updatedAt || '',
    ...list,
  })) : []
  state.skillDefinitions = Array.isArray(saved?.skillDefinitions) && saved.skillDefinitions.length ? saved.skillDefinitions : DEFAULT_BUILDER_SKILLS
  state.builderManagementVersion = 1`
        next = next.replace(normalizeMarker, normalizeAddition)
      }

      const removeStart = next.indexOf('  const removePoolBuilder = (builderId) => {')
      const removeEndMarker = '\n\n  const addGroup = () => {'
      const removeEnd = removeStart >= 0 ? next.indexOf(removeEndMarker, removeStart) : -1
      if (removeStart >= 0 && removeEnd > removeStart && !next.slice(removeStart, removeEnd).includes('Historical staffing, hours, and reports will be preserved')) {
        const replacement = `  const removePoolBuilder = (builderId) => {
    const builder = state.builderPool.find((b) => b.id === builderId)
    if (!builder || builder.isArchived) return
    const reason = prompt('Archive ' + builder.name + '? Historical staffing, hours, and reports will be preserved.\\n\\nOptional reason:', '')
    if (reason === null) return
    if (!confirm('Archive ' + builder.name + '?')) return
    const timestamp = new Date().toISOString()
    saveState((prev) => ({
      ...prev,
      builderPool: prev.builderPool.map((b) => b.id === builderId ? {
        ...b,
        isArchived: true,
        archivedAt: timestamp,
        archivedBy: user?.username || prev.adminName || 'Unknown admin',
        archiveReason: clean(reason),
        updatedAt: timestamp,
        updatedBy: user?.username || prev.adminName || 'Unknown admin',
      } : b),
      auditLog: [{
        timestamp: nowString(),
        admin: user?.username || prev.adminName || 'Unknown admin',
        board: prev.currentBoardId,
        shift: prev.boardShift,
        week: prev.weekStartDate,
        day: prev.selectedDay,
        builder: builder.name,
        action: 'Builder archived',
        oldValue: 'Active',
        newValue: clean(reason) || 'Archived',
      }, ...(prev.auditLog || [])].slice(0, 1000),
    }))
    if (selectedPoolBuilderId === builderId) setSelectedPoolBuilderId('')
    if (selectedBuilderId === builderId && !dayState.assignments?.[builderId]) setSelectedBuilderId('')
  }`
        next = next.slice(0, removeStart) + replacement + next.slice(removeEnd)
      }

      const activateStart = next.indexOf('  const activateBuilderForDay = (builderId) => {')
      const activateEndMarker = '\n\n  const removeBuilderFromDay = () => {'
      const activateEnd = activateStart >= 0 ? next.indexOf(activateEndMarker, activateStart) : -1
      if (activateStart >= 0 && activateEnd > activateStart && !next.slice(activateStart, activateEnd).includes('This builder is archived')) {
        const replacement = `  const activateBuilderForDay = (builderId) => {
    const profile = normalizeBuilderProfile(state.builderPool.find((b) => b.id === builderId) || {})
    if (!profile.id) return
    if (profile.isArchived) return alert('This builder is archived. Restore the profile before adding it to a new day.')
    const exists = dayState.assignments[builderId]
    if (exists) {
      setSelectedBuilderId(builderId)
      return
    }
    updateDay((prev) => {
      const removedAssignments = { ...(prev.removedAssignments || {}) }
      const restored = removedAssignments[builderId]
      delete removedAssignments[builderId]
      const assignment = restored || {
        ...blankAssignment(),
        status: profile.defaultStatus || 'Present',
        area: profile.defaultArea || '',
        clockInTime: profile.defaultClockIn || '',
        leaveTime: profile.defaultClockOut || '',
      }
      return {
        ...prev,
        removedAssignments,
        assignments: { ...prev.assignments, [builderId]: assignment },
      }
    })
    setSelectedBuilderId(builderId)
  }`
        next = next.slice(0, activateStart) + replacement + next.slice(activateEnd)
      }

      next = next.replace(
        '  const filteredBuilderPool = state.builderPool.filter((b) => {',
        '  const filteredBuilderPool = state.builderPool.filter((b) => !b.isArchived).filter((b) => {'
      )

      const builderStartMarker = "        ) : mainTab === 'builders' ? ("
      const builderStart = next.indexOf(builderStartMarker)
      if (builderStart >= 0 && !next.includes('data-builder-management-v3')) {
        const afterStart = builderStart + builderStartMarker.length
        const rest = next.slice(afterStart)
        const match = rest.match(/\n        \) : mainTab === '[^']+' \? \(/)
        if (match && typeof match.index === 'number') {
          const builderEnd = afterStart + match.index
          const workspace = `${builderStartMarker}
        <BuilderManagementWorkspace
          state={state}
          saveState={saveState}
          user={user}
          dayState={dayState}
          activeBuilders={activeBuilders}
          effectiveAreaDefs={effectiveAreaDefs}
          updateBuilderAssignment={updateBuilderAssignment}
          getAssignment={getAssignment}
          computeHoursForAssignment={computeHoursForAssignment}
          blankAssignment={blankAssignment}
          builderFlags={builderFlags}
          badgeTypeClass={badgeTypeClass}
          boardPresets={BOARD_PRESETS}
          weekdays={WEEKDAYS}
          nowString={nowString}
          makeId={makeId}
        />`
          next = next.slice(0, builderStart) + workspace + next.slice(builderEnd)
        }
      }

      return next === code ? null : { code: next, map: null }
    },
  }
}
