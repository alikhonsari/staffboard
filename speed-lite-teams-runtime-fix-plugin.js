export function speedLiteTeamsRuntimeFixPlugin() {
  return {
    name: 'staffboard-speed-lite-teams-runtime-fix',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null

      const enabledExpression = "(String(state.currentBoardId || '').startsWith('speed_'))"
      let next = code

      // Remove every generated declaration, regardless of where another plugin placed it.
      next = next.replace(/^\s*(?:const|let|var)\s+speedLiteTeamsEnabled\s*=\s*String\(state\.currentBoardId\s*\|\|\s*''\)\.startsWith\('speed_'\)\s*;?\s*$/gm, '')

      // Inline the scope check everywhere so there is no temporal-dead-zone risk.
      next = next.replace(/\bspeedLiteTeamsEnabled\b/g, enabledExpression)

      return next === code ? null : { code: next, map: null }
    },
  }
}
