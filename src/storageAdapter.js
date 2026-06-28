
const STORAGE_KEY = 'staffing_board_redo_complete_v2_weekly'

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
  return merged
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
function authHeaders(extra = {}) {
  const token = localStorage.getItem('staffboard2_token') || ''
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra
}

export async function loadRemoteState(defaultState) {
  const res = await fetch('/api/state', { headers: authHeaders() })
  if (!res.ok) throw new Error(await res.text() || 'Failed to load remote state')
  const payload = await res.json()
  const normalized = normalize(defaultState, payload.state || {})
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}
export async function saveRemoteState(state) {
  const res = await fetch('/api/state', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ state }),
  })
  if (!res.ok) throw new Error(await res.text() || 'Failed to save remote state')
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  return res.json()
}
