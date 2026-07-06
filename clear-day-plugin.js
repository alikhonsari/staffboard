export function clearDayPlugin() {
  return {
    name: 'staffboard-clear-day',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      if (!next.includes('const clearSelectedDay = () =>')) {
        const marker = '  const resetWeek = () => {'
        const fn = `  const clearSelectedDay = () => {\n    const day = state.selectedDay\n    if (!confirm(\`Clear all data for ${'${day}'} in Week ${'${weekInfo.week}'}? This cannot be undone.\`)) return\n    saveState((prev) => ({\n      ...prev,\n      weeklyData: {\n        ...prev.weeklyData,\n        [prev.selectedDay]: defaultDay(),\n      },\n    }))\n    setSelectedBuilderId('')\n  }\n\n`
        next = next.replace(marker, fn + marker)
      }

      next = next.replace(
        `          <div className="row">\n            <button className="danger" onClick={resetWeek}>Reset Week</button>\n          </div>`,
        `          <div className="row two">\n            <button className="danger" onClick={clearSelectedDay}>Clear Day</button>\n            <button className="danger" onClick={resetWeek}>Reset Week</button>\n          </div>`
      )

      return next === code ? null : { code: next, map: null }
    },
  }
}
