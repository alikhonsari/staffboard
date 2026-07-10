export function speedLiteTeamsOrderPlugin() {
  return {
    name: 'staffboard-speed-lite-teams-order',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      const declaration = "  const speedLiteTeamsEnabled = String(state.currentBoardId || '').startsWith('speed_')"
      const dayStateMarker = '  const dayState = state.weeklyData[state.selectedDay] || defaultDay()'
      if (!code.includes(declaration) || !code.includes(dayStateMarker)) return null

      let next = code.replace(declaration + '\n', '')
      next = next.replace(dayStateMarker, dayStateMarker + '\n' + declaration)
      return next === code ? null : { code: next, map: null }
    },
  }
}
