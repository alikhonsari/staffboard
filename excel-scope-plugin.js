export function excelScopePlugin() {
  return {
    name: 'staffboard-excel-scope',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/reporting.js')) return null
      let next = code
      next = next.replaceAll(
        "    ['Board', state.boardTitle], ['Logged-in Admin', reportAdmin],",
        "    ['Board ID', state.currentBoardId || 'unknown'], ['Board', state.boardTitle], ['Logged-in Admin', reportAdmin],"
      )
      next = next.replace(
        'writeWorkbook(wb, `end-of-shift-${state.weekStartDate}-${selectedDay}.xlsx`, reportAdmin)',
        "writeWorkbook(wb, `end-of-shift-${state.currentBoardId || 'board'}-${state.weekStartDate}-${selectedDay}.xlsx`, reportAdmin)"
      )
      next = next.replace(
        'writeWorkbook(wb, `weekly-staffing-board-${state.weekStartDate}.xlsx`, reportAdmin)',
        "writeWorkbook(wb, `weekly-staffing-board-${state.currentBoardId || 'board'}-${state.weekStartDate}.xlsx`, reportAdmin)"
      )
      return next === code ? null : { code: next, map: null }
    },
  }
}
