const TOKEN_CHECK = "const hasStaffBoardAuthToken = () => Boolean(localStorage.getItem('staffboard2_token') || localStorage.getItem('staffboard_shared_auth_token'))"

function injectAuthGuard(code, marker) {
  if (!code.includes(marker)) return code
  const guarded = `${marker}\n      if (!hasStaffBoardAuthToken()) return`
  if (code.includes(guarded)) return code
  return code.replace(marker, guarded)
}

export function injectAuthenticatedPolling(code) {
  let next = code
  if (!next.includes('const hasStaffBoardAuthToken =')) {
    const componentMarker = 'function StaffBoardApp({ user, onLogout }) {'
    if (!next.includes(componentMarker)) throw new Error('Authenticated polling transform could not locate StaffBoardApp.')
    next = next.replace(componentMarker, `${TOKEN_CHECK}\n\n${componentMarker}`)
  }

  next = injectAuthGuard(next, '    const pollScheduledStatus = async () => {')
  next = injectAuthGuard(next, '    const pollClosures = async () => {')

  for (const marker of ['const pollScheduledStatus = async', 'const pollClosures = async']) {
    if (next.includes(marker) && !next.includes(`${marker === 'const pollScheduledStatus = async' ? '    const pollScheduledStatus = async () => {' : '    const pollClosures = async () => {'}\n      if (!hasStaffBoardAuthToken()) return`)) {
      throw new Error(`Authenticated polling transform did not guard ${marker}.`)
    }
  }
  return next
}

export function authenticatedPollingPlugin() {
  return {
    name: 'staffboard-authenticated-polling',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      const next = injectAuthenticatedPolling(code)
      return next === code ? null : { code: next, map: null }
    },
  }
}

export const __test = { injectAuthenticatedPolling }
