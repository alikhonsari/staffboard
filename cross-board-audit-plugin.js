export function crossBoardAuditPlugin() {
  return {
    name: 'staffboard-cross-board-audit',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      const startMarker = '  const auditVisibleRows = auditFilteredRows.filter((row) => {'
      const endMarker = '  const activeRiskFlags = ['
      const start = code.indexOf(startMarker)
      const end = start >= 0 ? code.indexOf(endMarker, start) : -1
      if (start < 0 || end < 0) return null

      const block = `  const otherBoardAuditRows = Object.entries(state.boardStore || {}).flatMap(([boardId, boardState]) => {
    if (boardId === state.currentBoardId || !BOARD_PRESETS[boardId] || !boardState) return []
    const preset = BOARD_PRESETS[boardId]
    const manual = (boardState.auditLog || []).map((row) => ({ ...row, boardId: row.boardId || boardId, boardType: row.boardType || String(boardId).split('_')[0], board: row.board || preset.label, shift: row.shift || preset.shift, source: row.source || 'Audit' }))
    const weekData = getScopedWeekData({ ...boardState, currentBoardId: boardId })
    const movement = WEEKDAYS.flatMap((day) => (weekData?.[day]?.movementLog || []).map((row) => ({ timestamp: row.timestamp || '', admin: row.admin || 'System / Legacy', boardId, boardType: String(boardId).split('_')[0], board: preset.label, shift: preset.shift, week: state.weekStartDate, day, builder: row.builder || '', action: row.action || row.notes || 'Movement', oldValue: row.from || row.fromArea || row.fromStatus || '', newValue: row.to || row.toArea || row.toStatus || '', source: 'Movement' })))
    const attendance = WEEKDAYS.flatMap((day) => (weekData?.[day]?.attendanceLog || []).map((row) => ({ timestamp: row.timestamp || '', admin: row.admin || 'System / Legacy', boardId, boardType: String(boardId).split('_')[0], board: preset.label, shift: preset.shift, week: state.weekStartDate, day, builder: row.builder || '', action: row.event || 'Attendance', oldValue: '', newValue: row.note || row.clock_time || '', source: 'Attendance' })))
    return [...manual, ...movement, ...attendance]
  })
  const auditScopeRows = auditScope === 'currentBoard' ? auditFilteredRows : [...auditFilteredRows, ...otherBoardAuditRows].sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || ''))).slice(0, 1000)
  const auditVisibleRows = auditScopeRows.filter((row) => {
    const q = String(document.getElementById('auditSearch')?.value || '').toLowerCase()
    const matchesSearch = !q || [row.admin, row.boardId, row.board, row.shift, row.week, row.day, row.builder, row.action, row.oldValue, row.newValue, row.source].join(' ').toLowerCase().includes(q)
    if (!matchesSearch) return false
    if (auditScope === 'all') return true
    if (auditScope === 'day') return row.shift === 'Day Shift'
    if (auditScope === 'night') return row.shift === 'Night Shift'
    if (auditScope === 'currentShift') return row.shift === activeScopeShift
    return row.boardId ? row.boardId === state.currentBoardId : String(row.board || '').includes(activeBoardTypeLabel) && row.shift === activeScopeShift
  })

`
      const next = code.slice(0, start) + block + code.slice(end)
      return { code: next, map: null }
    },
  }
}
