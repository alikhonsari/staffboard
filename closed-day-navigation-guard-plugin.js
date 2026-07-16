const TARGET = `  if (res.status === 409) {
    const conflict = await res.json().catch(() => ({}))
    const latest = await fetchLatestRemote(state)
    reloadOnConflict({
      message: conflict.error || 'Board changed in another session.',
      updatedAt: latest?.payload?.updatedAt || conflict.currentUpdatedAt || '',
      stateRevision: Number(latest?.payload?.stateRevision || conflict.currentStateRevision || 0),
      updatedBy: latest?.payload?.updatedBy || '',
    })
    throw new Error(conflict.error || 'Board changed in another session. Reloading latest version.')
  }`

const REPLACEMENT = `  if (res.status === 409) {
    const conflict = await res.json().catch(() => ({}))
    const message = conflict.errorDetail?.message || conflict.error || conflict.message || 'Board changed in another session.'
    const closedDayRejection = /operational day is closed|reopen it before editing/i.test(message)

    if (closedDayRejection) {
      lastSaveError = message
      window.dispatchEvent(new CustomEvent('staffboard:save-rejected', {
        detail: { code: 'CLOSED_OPERATIONAL_DAY', message },
      }))
      throw new Error(message)
    }

    const latest = await fetchLatestRemote(state)
    reloadOnConflict({
      message,
      updatedAt: latest?.payload?.updatedAt || conflict.currentUpdatedAt || '',
      stateRevision: Number(latest?.payload?.stateRevision || conflict.currentStateRevision || 0),
      updatedBy: latest?.payload?.updatedBy || '',
    })
    throw new Error(message || 'Board changed in another session. Reloading latest version.')
  }`

export function injectClosedDayNavigationGuard(source) {
  if (source.includes("code: 'CLOSED_OPERATIONAL_DAY'")) return source
  if (!source.includes(TARGET)) throw new Error('Closed-day navigation guard could not locate the storage conflict handler.')
  return source.replace(TARGET, REPLACEMENT)
}

export function closedDayNavigationGuardPlugin() {
  return {
    name: 'closed-day-navigation-guard',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/src/storageAdapter.js')) return null
      return { code: injectClosedDayNavigationGuard(source), map: null }
    },
  }
}
