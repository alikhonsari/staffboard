const TOKEN_CHECK = "const hasStaffBoardAuthToken = () => Boolean(localStorage.getItem('staffboard2_token') || localStorage.getItem('staffboard_shared_auth_token'))"
const TAB_ID_HELPER = `const staffBoardPollingTabId = sessionStorage.getItem('staffboard_polling_tab_id') || crypto.randomUUID()
sessionStorage.setItem('staffboard_polling_tab_id', staffBoardPollingTabId)
const claimStaffBoardPollingLease = (name, ttlMs = 25000) => {
  const key = \`staffboard_polling_lease_\${name}\`
  const now = Date.now()
  try {
    const current = JSON.parse(localStorage.getItem(key) || '{}')
    if (current.owner && current.owner !== staffBoardPollingTabId && Number(current.expiresAt || 0) > now) return false
    localStorage.setItem(key, JSON.stringify({ owner: staffBoardPollingTabId, expiresAt: now + ttlMs }))
    return true
  } catch {
    return true
  }
}`
const POLL_INTERVAL_MS = 10000

function injectPollingGuard(code, marker, leaseName) {
  if (!code.includes(marker)) return code
  const guarded = `${marker}\n      if (!hasStaffBoardAuthToken()) return\n      if (!claimStaffBoardPollingLease('${leaseName}')) return`
  if (code.includes(guarded)) return code
  return code.replace(marker, guarded)
}

export function injectAuthenticatedPolling(code) {
  let next = code
  if (!next.includes('const hasStaffBoardAuthToken =')) {
    const componentMarker = 'function StaffBoardApp({ user, onLogout }) {'
    if (!next.includes(componentMarker)) throw new Error('Authenticated polling transform could not locate StaffBoardApp.')
    next = next.replace(componentMarker, `${TOKEN_CHECK}\n${TAB_ID_HELPER}\n\n${componentMarker}`)
  }

  next = injectPollingGuard(next, '    const pollScheduledStatus = async () => {', 'scheduled-status')
  next = injectPollingGuard(next, '    const pollClosures = async () => {', 'closure-status')
  next = next
    .replace('setInterval(pollScheduledStatus, 2000)', `setInterval(pollScheduledStatus, ${POLL_INTERVAL_MS})`)
    .replace('setInterval(pollClosures, 2000)', `setInterval(pollClosures, ${POLL_INTERVAL_MS})`)

  for (const [marker, lease] of [['const pollScheduledStatus = async', 'scheduled-status'], ['const pollClosures = async', 'closure-status']]) {
    const signature = marker === 'const pollScheduledStatus = async'
      ? '    const pollScheduledStatus = async () => {'
      : '    const pollClosures = async () => {'
    if (next.includes(marker) && !next.includes(`${signature}\n      if (!hasStaffBoardAuthToken()) return\n      if (!claimStaffBoardPollingLease('${lease}')) return`)) {
      throw new Error(`Authenticated polling transform did not guard ${marker}.`)
    }
  }
  if (next.includes('setInterval(pollScheduledStatus, 2000)') || next.includes('setInterval(pollClosures, 2000)')) {
    throw new Error('Authenticated polling transform did not reduce the legacy two-second polling interval.')
  }
  if (!next.includes('claimStaffBoardPollingLease')) throw new Error('Cross-tab polling lease helper is missing.')
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
