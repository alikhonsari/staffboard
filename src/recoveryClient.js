import { getRemoteUpdatedAt, loadRemoteState } from './storageAdapter'

const LOGIN_TOKEN_KEY = 'staffboard2_token'
const AUTH_TOKEN_KEY = 'staffboard_shared_auth_token'
const REQUEST_TIMEOUT_MS = 12000

function token() {
  return localStorage.getItem(LOGIN_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY) || ''
}

function headers(extra = {}) {
  const value = token()
  return value ? { ...extra, Authorization: `Bearer ${value}` } : extra
}

async function request(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' })
    if (response.status === 401) throw new Error('Invalid admin session. Please log in again.')
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      const error = new Error(payload.error || 'Recovery request failed.')
      error.status = response.status
      error.conflict = !!payload.conflict
      throw error
    }
    return response
  } finally {
    clearTimeout(timeout)
  }
}

function queryString(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') params.set(key, String(value))
  })
  const query = params.toString()
  return query ? `?${query}` : ''
}

export async function loadRecoveryVersions(filters = {}) {
  const response = await request(`/api/recovery/versions${queryString(filters)}`, { headers: headers() })
  return response.json()
}

export async function loadRecoveryBackups(limit = 50) {
  const response = await request(`/api/recovery/backups?limit=${encodeURIComponent(limit)}`, { headers: headers() })
  return response.json()
}

export async function previewRecoveryVersion(versionId, compareVersionId = '') {
  const response = await request('/api/recovery/preview', {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ versionId, compareVersionId }),
  })
  return response.json()
}

export async function requestRecoveryAction(action, details = {}, defaultState = {}) {
  const response = await request('/api/recovery/actions', {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      action,
      requestId: details.requestId || globalThis.crypto?.randomUUID?.() || `recovery-${Date.now()}`,
      baseUpdatedAt: getRemoteUpdatedAt(),
      ...details,
    }),
  })
  const payload = await response.json()
  const normalizedState = await loadRemoteState(defaultState)
  return { ...payload, normalizedState }
}

export async function downloadRecoveryExport(scope, context = {}) {
  const response = await request(`/api/recovery/export${queryString({ scope, ...context })}`, { headers: headers() })
  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') || ''
  const match = /filename="?([^";]+)"?/i.exec(disposition)
  const filename = match?.[1] || `staffboard-admin-backup-${scope}.json`
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return filename
}
