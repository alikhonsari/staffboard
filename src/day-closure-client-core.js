const clean = (value) => String(value || '').trim()

export function buildDayClosurePayload(action, details = {}, revision = {}) {
  return {
    action,
    requestId: details.requestId || globalThis.crypto?.randomUUID?.() || `closure-${Date.now()}`,
    baseUpdatedAt: String(revision.updatedAt || ''),
    baseStateRevision: Number(revision.stateRevision || 0),
    ...details,
  }
}

export function validateDayClosurePayload(payload = {}) {
  const issues = []
  if (!['close', 'reopen'].includes(payload.action)) issues.push('Choose close or reopen.')
  if (!clean(payload.boardId)) issues.push('Board is required.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(payload.weekStartDate))) issues.push('A valid week start date is required.')
  if (!['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(clean(payload.day))) issues.push('A valid operational day is required.')
  if (!['entire_day', 'day_shift', 'night_shift'].includes(payload.scope)) issues.push('A valid closure scope is required.')
  if (payload.action === 'close' && !clean(payload.reason)) issues.push('A closure reason is required.')
  if (payload.action === 'close' && payload.reason === 'Other' && !clean(payload.customReason)) issues.push('Enter a custom closure reason.')
  return { ok: issues.length === 0, issues }
}

export function createDayClosureError(status, payload = {}, fallback = 'Failed to update day closure') {
  const message = payload.errorDetail?.message || payload.error || payload.message || fallback
  const error = new Error(message)
  error.name = 'DayClosureRequestError'
  error.status = Number(status || 0)
  error.code = payload.errorDetail?.code || payload.code || ''
  error.requestId = payload.requestId || payload.errorDetail?.requestId || ''
  error.conflict = status === 409 || payload.conflict === true || error.code === 'STATE_REVISION_CONFLICT'
  error.details = payload.errorDetail?.details || payload.details || {}
  return error
}

export function validateDayClosureSuccess(payload = {}) {
  const state = payload.normalizedState || payload.state
  if (!state || typeof state !== 'object') {
    const error = new Error('The server did not return the persisted StaffBoard state. The closure was not applied to this browser.')
    error.name = 'DayClosureResponseError'
    error.code = 'INVALID_CLOSURE_RESPONSE'
    throw error
  }
  return state
}
