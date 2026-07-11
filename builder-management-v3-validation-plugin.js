export function builderManagementV3ValidationPlugin() {
  return {
    name: 'staffboard-builder-management-v3-validation',
    enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('/src/App.jsx')) {
        const required = [
          "./BuilderManagementWorkspace.jsx",
          "./BuilderHealthInsights.jsx",
          'builderManagementVersion: 1',
          'state.builderManagementVersion = 1',
          'builderLists:',
          'skillDefinitions:',
          'removedAssignments:',
          'Historical staffing, hours, and reports will be preserved',
          '<BuilderManagementWorkspace',
          'mode="manager"',
          'mode="suggestions"',
        ]
        const missing = required.filter((token) => !code.includes(token))
        if (missing.length) throw new Error(`Builder Management v3 App transform missing: ${missing.join(', ')}`)
      }
      if (id.endsWith('/src/BuilderManagementWorkspace.jsx')) {
        const required = [
          'data-builder-management-v3',
          'Master Builder List',
          'Saved Builder Lists',
          'Archived Builders',
          'Quick Add Builders',
          'Builder Profile',
          "command === 'search'",
          "event.key === 'Escape'",
        ]
        const missing = required.filter((token) => !code.includes(token))
        if (missing.length) throw new Error(`Builder Management v3 workspace transform missing: ${missing.join(', ')}`)
      }
      return null
    },
  }
}
