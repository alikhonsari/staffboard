export function auditAdminPlugin() {
  return {
    name: 'staffboard-audit-admin',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      if (code.includes('admin: user?.username || state.adminName || \'System\'')) return null
      const next = code.replaceAll(
        '          timestamp,\n          builder: builder.name,',
        "          timestamp,\n          admin: user?.username || state.adminName || 'System',\n          builder: builder.name,"
      ).replaceAll(
        '        timestamp: nowString(),\n        builder: builder.name,',
        "        timestamp: nowString(),\n        admin: user?.username || state.adminName || 'System',\n        builder: builder.name,"
      )
      return next === code ? null : { code: next, map: null }
    },
  }
}
