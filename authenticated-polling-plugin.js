const TOKEN_CHECK = "const hasStaffBoardAuthToken = () => Boolean(localStorage.getItem('staffboard2_token') || localStorage.getItem('staffboard_shared_auth_token'))"
const POLL_INTERVAL_MS = 10000

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
  next = next
    .replace('setInterval(pollScheduledStatus, 2000)', `setInterval(pollScheduledStatus, ${POLL_INTERVAL_MS})`)
    .replace('setInterval(pollClosures, 2000)', `setInterval(pollClosures, ${POLL_INTERVAL_MS})`)

  for (const marker of ['const pollScheduledStatus = async', 'const pollClosures = async']) {
    if (next.includes(marker) && !next.includes(`${marker === 'const pollScheduledStatus = async' ? '    const pollScheduledStatus = async () => {' : '    const pollClosures = async () => {'}\n      if (!hasStaffBoardAuthToken()) return`)) {
      throw new Error(`Authenticated polling transform did not guard ${marker}.`)
    }
  }
  if (next.includes('setInterval(pollScheduledStatus, 2000)') || next.includes('setInterval(pollClosures, 2000)')) {
    throw new Error('Authenticated polling transform did not reduce the legacy two-second polling interval.')
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

export const __test = { injectAuthenticatedPolling, POLL_INTERVAL_MS }
