import { getStorageDiagnostics } from './storageAdapter'

const LOGIN_TOKEN_KEY = 'staffboard2_token'
const AUTH_TOKEN_KEY = 'staffboard_shared_auth_token'

function authHeaders(extra = {}) {
  const token = localStorage.getItem(LOGIN_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY) || ''
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra
}

async function readJson(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.errorDetail?.message || payload.error || 'Diagnostics request failed.')
  return payload
}

export async function loadPlatformDiagnostics() {
  const response = await fetch('/api/platform/diagnostics', { headers: authHeaders(), cache: 'no-store' })
  return readJson(response)
}

export async function verifyServerBackup(backupId) {
  const response = await fetch('/api/platform/backups/verify', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ backupId }),
  })
  return readJson(response)
}

export function buildSanitizedClientDiagnostics(server = {}) {
  return {
    generatedAt: new Date().toISOString(),
    client: getStorageDiagnostics(),
    server,
    browser: {
      online: navigator.onLine,
      language: navigator.language,
      visibilityState: document.visibilityState,
    },
  }
}

export async function copySanitizedDiagnostics(server = {}) {
  const text = JSON.stringify(buildSanitizedClientDiagnostics(server), null, 2)
  await navigator.clipboard.writeText(text)
  return text
}
