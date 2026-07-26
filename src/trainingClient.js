const AUTH_TOKEN_KEY = 'staffboard_shared_auth_token'
const LOGIN_TOKEN_KEY = 'staffboard2_token'
const REQUEST_TIMEOUT_MS = 30_000

function getAuthToken() {
  return localStorage.getItem(LOGIN_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY) || ''
}

function headers(extra = {}) {
  const token = getAuthToken()
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra
}

async function request(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...options, headers: headers(options.headers), signal: controller.signal, cache: 'no-store' })
    const type = response.headers.get('content-type') || ''
    const payload = type.includes('application/json') ? await response.json() : await response.text()
    if (!response.ok) {
      const message = typeof payload === 'string' ? payload : payload?.error || payload?.message
      throw new Error(message || `Training request failed with ${response.status}.`)
    }
    return payload
  } finally {
    clearTimeout(timeout)
  }
}

export function loadTrainingSnapshot() {
  return request('/api/training')
}

export function syncTrainingBuilders(builders) {
  return request('/api/training/builders/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ builders }),
  })
}

export function createTrainingBuilder(input) {
  return request('/api/training/builders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function updateTrainingBuilder(id, input) {
  return request(`/api/training/builders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function createTrainingPath(input) {
  return request('/api/training/catalog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function updateTrainingPath(id, input) {
  return request(`/api/training/catalog/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function reorderTrainingPaths(orderedIds) {
  return request('/api/training/catalog/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds }),
  })
}

export function archiveTrainingPath(id) {
  return request(`/api/training/catalog/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function saveQualification(input) {
  return request('/api/training/qualifications', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function saveQualificationsBulk(items) {
  return request('/api/training/qualifications/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
}

export function addTrainingNote(input) {
  return request('/api/training/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function trainingCsvUrl() {
  const token = getAuthToken()
  return token ? `/api/training/export.csv?token=${encodeURIComponent(token)}` : '/api/training/export.csv'
}

export async function downloadTrainingCsv() {
  const response = await fetch('/api/training/export.csv', { headers: headers(), cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to export Training CSV.')
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `staffboard-training-${new Date().toISOString().slice(0, 10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}
