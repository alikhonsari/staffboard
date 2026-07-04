const STORAGE_KEY = 'staffing_board_redo_complete_v2_weekly'
const AUTH_TOKEN_KEY = 'staffboard_shared_auth_token'
const LOGIN_TOKEN_KEY = 'staffboard2_token'
const LOGIN_USER_KEY = 'staffboard2_user'
const REQUEST_TIMEOUT_MS = 12000

let remoteHydrated = false
let remoteUpdatedAt = null
let lastRemoteStateJson = ''
let saveQueue = Promise.resolve()
let conflictReloading = false

export const defaultStorageConfig = {
  mode: 'spaces-auto',
  s3Bucket: '',
  s3Region: '',
  s3KeyPrefix: 'staffing-board/',
}

function normalize(defaultState, saved) {
  if (!saved) return defaultState
  const merged = { ...defaultState, ...saved }
  merged.builderPool = Array.isArray(saved.builderPool) ? saved.builderPool : []
  merged.storageConfig = { ...defaultStorageConfig, ...(saved.storageConfig || {}) }
  merged.weeklyData = { ...defaultState.weeklyData, ...(saved.weeklyData || {}) }
  merged.weeklyBoards = saved.weeklyBoards || defaultState.weeklyBoards || {}
  merged.weeklyHistory = saved.weeklyHistory || defaultState.weeklyHistory || {}
  merged.lockedWeeks = saved.lockedWeeks || defaultState.lockedWeeks || {}
  return merged
}

function getAuthToken() {
  const appLogin = localStorage.getItem(LOGIN_TOKEN_KEY) || ''
  if (appLogin) return appLogin
  return localStorage.getItem(AUTH_TOKEN_KEY) || ''
}

function authHeaders(extra = {}) {
  const token = getAuthToken()
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra
}

export function clearSharedAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(LOGIN_TOKEN_KEY)
  localStorage.removeItem(LOGIN_USER_KEY)
}

async function requestWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function responseMessage(res, fallback) {
  try {
    const type = res.headers.get('content-type') || ''
    if (type.includes('application/json')) {
      const data = await res.json()
      return data.error || data.message || fallback
    }
    const text = await res.text()
    return text || fallback
  } catch {
    return fallback
  }
}

async function fetchLatestRemote(defaultState = {}) {
  const res = await requestWithTimeout('/api/state', { headers: authHeaders(), cache: 'no-store' })
  if (!res.ok) return null
  const payload = await res.json()
  const normalized = normalize(defaultState, payload.state || {})
  remoteUpdatedAt = String(payload.updatedAt || '')
  remoteHydrated = true
  lastRemoteStateJson = JSON.stringify(normalized)
  localStorage.setItem(STORAGE_KEY, lastRemoteStateJson)
  return { payload, state: normalized }
}

function reloadOnConflict(detail = {}) {
  if (conflictReloading) return
  conflictReloading = true
  try {
    sessionStorage.setItem('staffboard_last_conflict', JSON.stringify({
      at: new Date().toISOString(),
      updatedAt: detail.updatedAt || '',
      updatedBy: detail.updatedBy || '',
    }))
  } catch {}
  window.dispatchEvent(new CustomEvent('staffboard:state-conflict', { detail }))
  setTimeout(() => window.location.reload(), 250)
}

export function loadState(defaultState) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaultState, storageConfig: { ...defaultStorageConfig, ...(defaultState.storageConfig || {}) } }
    return normalize(defaultState, JSON.parse(raw))
  } catch {
    return { ...defaultState, storageConfig: { ...defaultStorageConfig, ...(defaultState.storageConfig || {}) } }
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export async function loadRemoteState(defaultState) {
  const res = await requestWithTimeout('/api/state', { headers: authHeaders(), cache: 'no-store' })
  if (res.status === 401) {
    clearSharedAuthToken()
    throw new Error('Invalid admin session. Please log in again.')
  }
  if (!res.ok) throw new Error(await responseMessage(res, 'Failed to load remote state'))
  const payload = await res.json()
  const normalized = normalize(defaultState, payload.state || {})
  remoteUpdatedAt = String(payload.updatedAt || '')
  remoteHydrated = true
  lastRemoteStateJson = JSON.stringify(normalized)
  localStorage.setItem(STORAGE_KEY, lastRemoteStateJson)
  return normalized
}

async function performRemoteSave(state) {
  if (!remoteHydrated) return { skipped: true, reason: 'remote-not-loaded' }

  const stateJson = JSON.stringify(state)
  if (stateJson === lastRemoteStateJson) return { skipped: true, reason: 'unchanged' }

  const res = await requestWithTimeout('/api/state', {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      state,
      baseUpdatedAt: remoteUpdatedAt ?? '',
    }),
  })

  if (res.status === 401) {
    clearSharedAuthToken()
    throw new Error('Invalid admin session. Please log in again.')
  }

  if (res.status === 409) {
    const conflict = await res.json().catch(() => ({}))
    const latest = await fetchLatestRemote(state)
    reloadOnConflict({
      message: conflict.error || 'Board changed in another session.',
      updatedAt: latest?.payload?.updatedAt || conflict.currentUpdatedAt || '',
      updatedBy: latest?.payload?.updatedBy || '',
    })
    throw new Error(conflict.error || 'Board changed in another session. Reloading latest version.')
  }

  if (!res.ok) throw new Error(await responseMessage(res, 'Failed to save remote state'))

  const payload = await res.json()
  remoteUpdatedAt = String(payload.updatedAt || remoteUpdatedAt || '')
  remoteHydrated = true
  lastRemoteStateJson = JSON.stringify(payload.state || state)
  localStorage.setItem(STORAGE_KEY, lastRemoteStateJson)
  return payload
}

export function saveRemoteState(state) {
  const job = saveQueue.catch(() => {}).then(() => performRemoteSave(state))
  saveQueue = job
  return job
}

export async function loadHistory() {
  const res = await requestWithTimeout('/api/history', { headers: authHeaders() })
  if (res.status === 401) {
    clearSharedAuthToken()
    throw new Error('Invalid admin session. Please log in again.')
  }
  if (!res.ok) throw new Error(await responseMessage(res, 'Failed to load history'))
  return res.json()
}
