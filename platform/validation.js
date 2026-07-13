import { errors } from './errors.js'

const BOARD_IDS = new Set(['speed_day', 'speed_night', 'fa_day', 'fa_night', 'bodega_day', 'bodega_night'])
const WEEKDAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
const CLOSURE_SCOPES = new Set(['entire_day', 'day_shift', 'night_shift'])
const CLOSURE_ACTIONS = new Set(['close', 'reopen'])
const CLOSURE_REASONS = new Set(['Holiday', 'Building Closure', 'Severe Weather', 'Maintenance', 'Emergency', 'Planned Shutdown', 'Other'])
const SCHEDULE_ACTIONS = new Set(['schedule', 'cancel', 'immediate', 'override'])
const RECOVERY_ACTIONS = new Set(['create_backup', 'undo_last', 'restore_version', 'restore_backup'])

const clean = (value) => String(value || '').trim()
const plainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value))

export function validateStateShape(state, { compatible = true } = {}) {
  const issues = []
  if (!plainObject(state)) return { ok: false, issues: [{ path: 'state', message: 'State must be an object.' }] }
  if (!BOARD_IDS.has(clean(state.currentBoardId))) issues.push({ path: 'state.currentBoardId', message: 'Unknown board ID.' })
  if (!clean(state.weekStartDate)) issues.push({ path: 'state.weekStartDate', message: 'Week start date is required.' })
  if (!plainObject(state.weeklyData)) issues.push({ path: 'state.weeklyData', message: 'Weekly data must be an object.' })
  if (state.selectedDay != null && !WEEKDAYS.has(clean(state.selectedDay))) issues.push({ path: 'state.selectedDay', message: 'Selected day must be Monday through Friday.' })
  if (state.builderPool != null && !Array.isArray(state.builderPool)) issues.push({ path: 'state.builderPool', message: 'Builder pool must be an array.' })
  if (state.boardStore != null && !plainObject(state.boardStore)) issues.push({ path: 'state.boardStore', message: 'Board store must be an object.' })
  if (!compatible && state.stateRevision != null && (!Number.isInteger(Number(state.stateRevision)) || Number(state.stateRevision) < 0)) {
    issues.push({ path: 'state.stateRevision', message: 'State revision must be a non-negative integer.' })
  }
  return { ok: issues.length === 0, issues }
}

export function assertValidState(state, options = {}) {
  const result = validateStateShape(state, options)
  if (!result.ok) throw errors.invalid('Shared state validation failed.', { issues: result.issues })
  return state
}

export function validateActionPayload(kind, body = {}) {
  const issues = []
  const requireField = (name) => { if (!clean(body[name])) issues.push({ path: name, message: `${name} is required.` }) }

  if (kind === 'schedule') {
    requireField('action'); requireField('boardId'); requireField('weekStartDate'); requireField('day'); requireField('builderId')
    if (body.action && !SCHEDULE_ACTIONS.has(body.action)) issues.push({ path: 'action', message: 'Unknown schedule action.' })
  } else if (kind === 'closure') {
    requireField('action'); requireField('boardId'); requireField('weekStartDate'); requireField('day'); requireField('scope')
    if (body.action && !CLOSURE_ACTIONS.has(body.action)) issues.push({ path: 'action', message: 'Unknown closure action.' })
    if (body.scope && !CLOSURE_SCOPES.has(body.scope)) issues.push({ path: 'scope', message: 'Unknown closure scope.' })
    if (body.action === 'close') {
      requireField('reason')
      if (body.reason && !CLOSURE_REASONS.has(body.reason)) issues.push({ path: 'reason', message: 'Unknown closure reason.' })
      if (body.reason === 'Other' && !clean(body.customReason)) issues.push({ path: 'customReason', message: 'customReason is required when Other is selected.' })
    }
  } else if (kind === 'recovery') {
    requireField('action')
    if (body.action && !RECOVERY_ACTIONS.has(body.action)) issues.push({ path: 'action', message: 'Unknown recovery action.' })
  }

  if (body.boardId && !BOARD_IDS.has(clean(body.boardId))) issues.push({ path: 'boardId', message: 'Unknown board ID.' })
  if (body.day && !WEEKDAYS.has(clean(body.day))) issues.push({ path: 'day', message: 'Operational day must be Monday through Friday.' })
  return { ok: issues.length === 0, issues }
}

export function assertValidAction(kind, body) {
  const result = validateActionPayload(kind, body)
  if (!result.ok) throw errors.invalid(`${kind} request validation failed.`, { issues: result.issues })
  return body
}

export function validateBackupEnvelope(envelope) {
  const issues = []
  if (!plainObject(envelope)) return { ok: false, issues: [{ path: 'backup', message: 'Backup must be a JSON object.' }] }
  if (!plainObject(envelope.metadata)) issues.push({ path: 'metadata', message: 'Backup metadata is missing.' })
  if (!plainObject(envelope.state)) issues.push({ path: 'state', message: 'Backup state is missing.' })
  if (envelope.metadata && !clean(envelope.metadata.id)) issues.push({ path: 'metadata.id', message: 'Backup ID is missing.' })
  if (envelope.metadata && !clean(envelope.metadata.createdAt)) issues.push({ path: 'metadata.createdAt', message: 'Backup creation time is missing.' })
  if (plainObject(envelope.state)) issues.push(...validateStateShape(envelope.state).issues.map((issue) => ({ ...issue, path: `state.${issue.path.replace(/^state\./, '')}` })))
  return { ok: issues.length === 0, issues }
}

export const schemaConstants = { BOARD_IDS, WEEKDAYS, CLOSURE_SCOPES, CLOSURE_ACTIONS, CLOSURE_REASONS, SCHEDULE_ACTIONS, RECOVERY_ACTIONS }
