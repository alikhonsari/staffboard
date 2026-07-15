const HELPER_MARKER = "const REQUEST_TIMEOUT_MS = 12000"

const QUOTA_SAFE_HELPERS = `
const LOCAL_STATE_CACHE_MAX_BYTES = 1500000
let lastLocalCacheError = ''

function compactLocalState(state = {}) {
  return {
    __staffboardCompactCache: true,
    currentBoardId: state.currentBoardId || '',
    boardTitle: state.boardTitle || '',
    boardShift: state.boardShift || '',
    selectedDay: state.selectedDay || '',
    weekStartDate: state.weekStartDate || '',
    stateRevision: Number(state.stateRevision || 0),
    updatedAt: state.updatedAt || '',
    storageConfig: state.storageConfig || {},
  }
}

function persistLocalStateSafely(state = {}, serialized = '') {
  const fullJson = serialized || JSON.stringify(state)
  const compactJson = JSON.stringify(compactLocalState(state))
  const preferred = fullJson.length <= LOCAL_STATE_CACHE_MAX_BYTES ? fullJson : compactJson
  try {
    localStorage.setItem(STORAGE_KEY, preferred)
    lastLocalCacheError = ''
    return true
  } catch (error) {
    lastLocalCacheError = error?.name || error?.message || 'Local storage write failed.'
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.setItem(STORAGE_KEY, compactJson)
      return true
    } catch (fallbackError) {
      lastLocalCacheError = fallbackError?.name || fallbackError?.message || lastLocalCacheError
      return false
    }
  }
}`

export function injectQuotaSafeStorage(code) {
  if (!code.includes(HELPER_MARKER)) throw new Error('Quota-safe storage transform could not locate timeout marker.')
  let next = code
  if (!next.includes('function persistLocalStateSafely')) {
    next = next.replace(HELPER_MARKER, `${HELPER_MARKER}\n${QUOTA_SAFE_HELPERS}`)
  }
  next = next
    .replace('localStorage.setItem(STORAGE_KEY, lastRemoteStateJson)', 'persistLocalStateSafely(normalized, lastRemoteStateJson)')
    .replace('localStorage.setItem(STORAGE_KEY, JSON.stringify(state))', 'persistLocalStateSafely(state)')
    .replace('localStorage.setItem(STORAGE_KEY, lastRemoteStateJson)', 'persistLocalStateSafely(savedState, lastRemoteStateJson)')
    .replace('saveQueued: Boolean(saveQueue),', 'saveQueued: Boolean(saveQueue),\n    localCacheError: lastLocalCacheError,')

  const unsafePatterns = [
    'localStorage.setItem(STORAGE_KEY, lastRemoteStateJson)',
    'localStorage.setItem(STORAGE_KEY, JSON.stringify(state))',
  ]
  if (unsafePatterns.some((pattern) => next.includes(pattern))) {
    throw new Error('Quota-safe storage transform left an unsafe direct state-cache write.')
  }
  return next
}

export function quotaSafeStoragePlugin() {
  return {
    name: 'staffboard-quota-safe-storage',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/storageAdapter.js')) return null
      const next = injectQuotaSafeStorage(code)
      return next === code ? null : { code: next, map: null }
    },
  }
}

export const __test = { injectQuotaSafeStorage }
