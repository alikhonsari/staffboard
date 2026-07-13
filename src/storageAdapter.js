import {
  buildDayClosurePayload, createDayClosureError, validateDayClosurePayload, validateDayClosureSuccess,
} from './day-closure-client-core.js'

const STORAGE_KEY = 'staffing_board_redo_complete_v2_weekly'
const AUTH_TOKEN_KEY = 'staffboard_shared_auth_token'
const LOGIN_TOKEN_KEY = 'staffboard2_token'
const LOGIN_USER_KEY = 'staffboard2_user'
const REQUEST_TIMEOUT_MS = 12000

let remoteHydrated = false
let remoteUpdatedAt = null
let remoteStateRevision = 0
let lastRemoteStateJson = ''
let saveQueue = Promise.resolve()
let conflictReloading = false
let lastSyncAt = ''
let lastSaveError = ''

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
  merged.dayClosures = saved.dayClosures && typeof saved.dayClosures === 'object' ? saved.dayClosures : {}
  merged.closureRevision = Number(saved.closureRevision || 0)
  merged.closureNotifications = Array.isArray(saved.closureNotifications) ? saved.closureNotifications : []
  merged.stateRevision = Number(saved.stateRevision || 0)
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

async function responsePayload(res) {
  try {
    const type = res.headers.get('content-type') || ''
    if (type.includes('application/json')) return await res.json()
    const text = await res.text()
    return text ? { error: text } : {}
  } catch {
    return {}
  }
}

async function responseMessage(res, fallback) {
  const data = await responsePayload(res)
  return data.errorDetail?.message || data.error || data.message || fallback
}

function rememberRemotePayload(payload, defaultState = {}) {
  const normalized = normalize(defaultState, payload.state || {})
  remoteUpdatedAt = String(payload.updatedAt || '')
  remoteStateRevision = Number(payload.stateRevision || normalized.stateRevision || 0)
  normalized.stateRevision = remoteStateRevision
  remoteHydrated = true
  lastRemoteStateJson = JSON.stringify(normalized)
  lastSyncAt = new Date().toISOString()
  lastSaveError = ''
  localStorage.setItem(STORAGE_KEY, lastRemoteStateJson)
  return normalized
}

async function fetchLatestRemote(defaultState = {}) {
  const res = await requestWithTimeout('/api/state', { headers: authHeaders(), cache: 'no-store' })
  if (!res.ok) return null
  const payload = await res.json()
  const normalized = rememberRemotePayload(payload, defaultState)
  return { payload, state: normalized }
}

function reloadOnConflict(detail = {}) {
  if (conflictReloading) return
  conflictReloading = true
  try {
    sessionStorage.setItem('staffboard_last_conflict', JSON.stringify({
      at: new Date().toISOString(),
      updatedAt: detail.updatedAt || '',
      stateRevision: Number(detail.stateRevision || 0),
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
  return rememberRemotePayload(payload, defaultState)
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
      baseStateRevision: Number(remoteStateRevision || 0),
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
      stateRevision: Number(latest?.payload?.stateRevision || conflict.currentStateRevision || 0),
      updatedBy: latest?.payload?.updatedBy || '',
    })
    throw new Error(conflict.error || 'Board changed in another session. Reloading latest version.')
  }

  if (!res.ok) {
    lastSaveError = await responseMessage(res, 'Failed to save remote state')
    throw new Error(lastSaveError)
  }

  const payload = await res.json()
  remoteUpdatedAt = String(payload.updatedAt || remoteUpdatedAt || '')
  remoteStateRevision = Number(payload.stateRevision || payload.state?.stateRevision || remoteStateRevision || 0)
  remoteHydrated = true
  const savedState = { ...(payload.state || state), stateRevision: remoteStateRevision }
  lastRemoteStateJson = JSON.stringify(savedState)
  lastSyncAt = new Date().toISOString()
  lastSaveError = ''
  localStorage.setItem(STORAGE_KEY, lastRemoteStateJson)
  return payload
}

export function saveRemoteState(state) {
  const job = saveQueue.catch(() => {}).then(() => performRemoteSave(state))
  saveQueue = job
  return job
}

export async function requestScheduledTransition(action, details = {}, defaultState = {}) {
  const res = await requestWithTimeout('/api/scheduled-transitions', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ action, ...details }),
  })
  if (res.status === 401) {
    clearSharedAuthToken()
    throw new Error('Invalid admin session. Please log in again.')
  }
  if (!res.ok) throw new Error(await responseMessage(res, 'Failed to update scheduled transition'))
  const payload = await res.json()
  if (payload.state) payload.normalizedState = rememberRemotePayload(payload, defaultState)
  return payload
}

export async function loadScheduledTransitionStatus() {
  const res = await requestWithTimeout('/api/scheduled-transitions/status', {
    headers: authHeaders(),
    cache: 'no-store',
  })
  if (res.status === 401) {
    clearSharedAuthToken()
    throw new Error('Invalid admin session. Please log in again.')
  }
  if (!res.ok) throw new Error(await responseMessage(res, 'Failed to check scheduled transitions'))
  return res.json()
}

export async function requestDayClosure(action, details = {}, defaultState = {}) {
  const body = buildDayClosurePayload(action, details, {
    updatedAt: remoteUpdatedAt || '',
    stateRevision: Number(remoteStateRevision || 0),
  })
  const validation = validateDayClosurePayload(body)
  if (!validation.ok) {
    const error = new Error(validation.issues.join(' '))
    error.name = 'DayClosureValidationError'
    error.code = 'VALIDATION_FAILED'
    throw error
  }

  const res = await requestWithTimeout('/api/day-closures', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })

  const payload = await responsePayload(res)
  if (res.status === 401) {
    clearSharedAuthToken()
    throw createDayClosureError(res.status, payload, 'Invalid admin session. Please log in again.')
  }

  if (res.status === 409) {
    const latest = await fetchLatestRemote(defaultState).catch(() => null)
    const error = createDayClosureError(res.status, payload, 'The board changed in another session.')
    error.latestState = latest?.state || null
    error.latestPayload = latest?.payload || null
    throw error
  }

  if (!res.ok) throw createDayClosureError(res.status, payload, 'Failed to update day closure')

  const persistedState = validateDayClosureSuccess(payload)
  payload.normalizedState = rememberRemotePayload({ ...payload, state: persistedState }, defaultState)
  return payload
}

export async function loadDayClosureStatus() {
  const res = await requestWithTimeout('/api/day-closures/status', {
    headers: authHeaders(),
    cache: 'no-store',
  })
  if (res.status === 401) {
    clearSharedAuthToken()
    throw new Error('Invalid admin session. Please log in again.')
  }
  if (!res.ok) throw new Error(await responseMessage(res, 'Failed to check day closure status'))
  return res.json()
}

export function getRemoteUpdatedAt() {
  return remoteUpdatedAt || ''
}

export function getRemoteStateRevision() {
  return Number(remoteStateRevision || 0)
}

export function getStorageDiagnostics() {
  return {
    remoteHydrated,
    remoteUpdatedAt: remoteUpdatedAt || '',
    remoteStateRevision: Number(remoteStateRevision || 0),
    lastSyncAt,
    lastSaveError,
    saveQueued: Boolean(saveQueue),
  }
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
