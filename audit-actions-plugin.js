export function auditActionsPlugin() {
  return {
    name: 'staffboard-audit-actions',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code
      next = next.replace(
        `    saveState((prev) => ({
      ...prev,
      weeklyData: {
        ...prev.weeklyData,
        [prev.selectedDay]: defaultDay(),
      },
    }))`,
        `    saveState((prev) => appendAudit({
      ...prev,
      weeklyData: {
        ...prev.weeklyData,
        [prev.selectedDay]: defaultDay(),
      },
    }, { action: 'Clear Day', oldValue: prev.selectedDay, newValue: 'Blank day' }))`
      )
      next = next.replace(
        `    setState(cleaned)`,
        `    setState(appendAudit(cleaned, { action: 'Reset Week', oldValue: state.weekStartDate, newValue: 'Blank week' }))`
      )
      return next === code ? null : { code: next, map: null }
    },
  }
}
