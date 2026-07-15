import crypto from 'crypto'
import dotenv from 'dotenv'
import {
  deleteJsonDocument, getJsonDocument, postgresStoreConfig, putJsonDocument, updateJsonDocument,
} from './postgres-json-store.js'
import {
  DEFAULT_SITE_TIME_ZONE, getNextPendingTransitionAt, processDueScheduledTransitions,
} from './scheduled-transitions-core.js'
import { reconcileClosedDaySchedules } from './day-closures-core.js'
import {
  recordError, recordReconciliation, recordStateRead, recordStateWrite,
} from './platform/diagnostics.js'
import { assertValidState } from './platform/validation.js'

dotenv.config()

export const config = {
  port: Number(process.env.PORT || 8787),
  authToken: process.env.AUTH_TOKEN || '',
  authSecret: process.env.AUTH_SECRET || process.env.AUTH_TOKEN || process.env.PGPASSWORD || 'staffboard-dev-secret',
  key: process.env.STAFFBOARD_STATE_KEY || process.env.SPACES_OBJECT_KEY || 'weekly/staffboard-2/staffboard-state.json',
  timeZone: process.env.STAFFBOARD_TIME_ZONE || DEFAULT_SITE_TIME_ZONE,
  storageBackend: 'postgres',
  postgresConfigured: postgresStoreConfig.configured,
}
config.historyKey = process.env.STAFFBOARD_HISTORY_KEY || process.env.SPACES_HISTORY_KEY || config.key.replace(/\.json$/i, '-history.json')
config.spacesConfigured = false

export const runtime = {
  currentStateVersion: null,
  currentStateRevision: 0,
  queue: Promise.resolve(),
  scheduleTimer: null,
  fallbackTimer: null,
  beforePersistObservers: [],
  afterPersistObservers: [],
}

const BOARD_RULES = {
  speed_day: ['Day Shift', 'SPEED Staffing Board'], speed_night: ['Night Shift', 'SPEED Staffing Board'],
  fa_day: ['Day Shift', 'FA Lab Staffing Board'], fa_night: ['Night Shift', 'FA Lab Staffing Board'],
  bodega_day: ['Day Shift', 'Bodega Staffing Board'], bodega_night: ['Night Shift', 'Bodega Staffing Board'],
}
const AREA_TYPES = new Set(['production', 'support', 'labor_share', 'unassigned'])
const clean = (value) => String(value || '').trim()

export async function getObjectJson(key, fallback) {
  const started = Date.now()
  try {
    const parsed = await getJsonDocument(key, fallback)
    const body = JSON.stringify(parsed)
    recordStateRead({ durationMs: Date.now() - started, bytes: Buffer.byteLength(body), success: true })
    return parsed
  } catch (error) {
    recordStateRead({ durationMs: Date.now() - started, success: false, error })
    throw error
  }
}

export async function putObjectJson(key, payload) {
  const started = Date.now()
  const body = JSON.stringify(payload)
  try {
    await putJsonDocument(key, payload)
    recordStateWrite({ durationMs: Date.now() - started, bytes: Buffer.byteLength(body), success: true, revision: payload?.stateRevision || payload?.state?.stateRevision || 0 })
  } catch (error) {
    recordStateWrite({ durationMs: Date.now() - started, bytes: Buffer.byteLength(body), success: false, error })
    throw error
  }
}

export async function deleteObjectJson(key) {
  await deleteJsonDocument(key)
}

export function registerBeforePersistObserver(observer) {
  if (typeof observer === 'function' && !runtime.beforePersistObservers.includes(observer)) runtime.beforePersistObservers.push(observer)
}

export function registerAfterPersistObserver(observer) {
  if (typeof observer === 'function' && !runtime.afterPersistObservers.includes(observer)) runtime.afterPersistObservers.push(observer)
}

export async function appendHistory(entry) {
  try {
    await updateJsonDocument(config.historyKey, { events: [] }, (history) => {
      const rows = (Array.isArray(history?.events) ? history.events : []).filter((row) => !entry.id || row.id !== entry.id)
      rows.unshift(entry)
      return { events: rows.slice(0, 500), updatedAt: new Date().toISOString() }
    })
  } catch (error) {
    recordError(error)
    console.warn('Failed to write StaffBoard history:', error.message)
  }
}

export function enqueue(task) {
  const job = runtime.queue.catch(() => {}).then(task)
  runtime.queue = job.catch(() => {})
  return job
}

function scheduleHistory(event, state, source) {
  const notification = (state.scheduleNotifications || []).find((item) => item.id === event.id)
  return {
    id: `schedule-${event.id}`, at: event.processedAt || event.canceledAt || event.createdAt || new Date().toISOString(),
    user: event.processedBy || event.canceledBy || event.createdBy || 'System',
    action: notification?.message || `${event.type || 'Scheduled transition'} ${event.status || ''}`.trim(),
    boardTitle: state.boardTitle || '', boardId: event.boardId || '', weekStartDate: event.weekStartDate || '',
    selectedDay: event.day || '', builderId: event.builderId || '', transitionId: event.id,
    effectiveAt: event.effectiveAt || event.scheduledAt || '', processedAt: event.processedAt || '', delayed: !!event.delayed, source,
  }
}

function closureHistory(event, state, source) {
  return {
    id: `closure-history-${event.id}`, at: event.timestamp || event.canceledAt || new Date().toISOString(),
    user: event.actor || event.canceledBy || 'System', action: event.message || event.actionType || 'Operational day closure updated',
    actionType: event.actionType || '', boardTitle: state.boardTitle || '', boardId: event.boardId || '', operationId: event.operationId || '',
    weekStartDate: event.weekStartDate || '', selectedDay: event.day || '', scope: event.scope || '', reason: event.reason || '', note: event.note || '',
    builder: event.builder || '', builderId: event.builderId || '', transitionId: event.transitionId || event.id || '',
    closureId: event.closureId || event.id || '', canceledTransitionCount: Number(event.canceledTransitionCount || 0), source,
  }
}

export const historyEntryForEvent = (event, state, source) => event?.kind === 'closure' ? closureHistory(event, state, source) : scheduleHistory(event, state, source)

export async function persistState(state, actor, source, events = []) {
  const previousPayload = await getObjectJson(config.key, { state: {}, updatedAt: '', stateRevision: 0 })
  const previousState = previousPayload.state || {}
  const nextRevision = Math.max(Number(previousPayload.stateRevision || 0), Number(previousState.stateRevision || 0), Number(runtime.currentStateRevision || 0)) + 1
  state.stateRevision = nextRevision
  assertValidState(state)
  const context = { previousState, nextState: state, actor: actor || 'System', source, events, previousUpdatedAt: previousPayload.updatedAt || '', previousStateRevision: Number(previousPayload.stateRevision || previousState.stateRevision || 0) }
  for (const observer of runtime.beforePersistObservers) await observer(context)

  const savedAt = new Date().toISOString()
  const payload = { state: { ...state, updatedAt: savedAt, stateRevision: nextRevision }, updatedAt: savedAt, stateRevision: nextRevision, updatedBy: actor || 'System' }
  await putObjectJson(config.key, payload)
  runtime.currentStateVersion = savedAt
  runtime.currentStateRevision = nextRevision
  for (const event of events) await appendHistory(historyEntryForEvent(event, payload.state, source))
  for (const observer of runtime.afterPersistObservers) {
    try {
      await observer({ ...context, payload, nextState: payload.state, stateRevision: nextRevision })
    } catch (error) {
      recordError(error)
      console.warn('StaffBoard post-persist observer failed after state was saved:', error.message)
    }
  }
  scheduleNext(payload.state)
  return payload
}

export async function reconcilePersistedState(source = 'reconciliation') {
  if (!config.postgresConfigured) return { changed: false, payload: { state: {}, updatedAt: '', stateRevision: 0 }, events: [] }
  const payload = await getObjectJson(config.key, { state: {}, updatedAt: '', stateRevision: 0 })
  runtime.currentStateVersion = String(payload.updatedAt || '')
  runtime.currentStateRevision = Number(payload.stateRevision || payload.state?.stateRevision || 0)
  const closures = reconcileClosedDaySchedules(payload.state || {}, { actor: 'System', now: new Date() })
  const schedules = processDueScheduledTransitions(closures.state || payload.state || {}, new Date(), { timeZone: config.timeZone, actor: 'System' })
  const events = [...(closures.events || []), ...(schedules.events || [])]
  recordReconciliation({ revision: runtime.currentStateRevision })
  if (!closures.changed && !schedules.changed) {
    scheduleNext(payload.state || {})
    return { state: payload.state || {}, changed: false, events: [], payload }
  }
  const saved = await persistState(schedules.state, 'System', source, events)
  return { state: saved.state, changed: true, events, payload: saved }
}

export function scheduleNext(state) {
  if (runtime.scheduleTimer) clearTimeout(runtime.scheduleTimer)
  const nextDueAt = getNextPendingTransitionAt(state || {})
  if (!nextDueAt) { runtime.scheduleTimer = null; return }
  const delay = Math.max(0, new Date(nextDueAt).getTime() - Date.now()) + 10
  runtime.scheduleTimer = setTimeout(() => enqueue(() => reconcilePersistedState('scheduled-timer')).catch((error) => console.error('Scheduled transition timer failed:', error)), Math.min(delay, 2_147_000_000))
  runtime.scheduleTimer.unref?.()
}

export function requireAdminAuth(req, res, next) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : req.headers['x-auth-token'] || ''
  try {
    if (token?.includes('.')) {
      const [body, sig] = token.split('.')
      const expected = crypto.createHmac('sha256', config.authSecret).update(body).digest('base64url')
      if (Buffer.byteLength(sig) === Buffer.byteLength(expected) && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        const session = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'))
        const role = String(session.role || 'admin').toLowerCase()
        if ((!session.exp || Date.now() <= session.exp) && ['admin', 'manager', 'system'].includes(role)) { req.user = session; return next() }
      }
    }
  } catch { /* fall through */ }
  if (config.authToken && token === config.authToken) { req.user = { username: 'token-admin', role: 'admin' }; return next() }
  return res.status(401).json({ error: 'Unauthorized' })
}

function inferredAreaType(name) {
  const value = clean(name).toLowerCase()
  if (!value || value === 'unassigned') return 'unassigned'
  if (value === 'fa' || value === 'fa metal removal') return 'labor_share'
  if (['shipping', 'eos pull racks', 'projects', 'learning', '1:1'].includes(value)) return 'support'
  return 'production'
}

function normalizeAreas(scope, boardId) {
  if (!scope || typeof scope !== 'object') return
  const areas = (Array.isArray(scope.areaDefs) ? scope.areaDefs : []).filter((area) => area && clean(area.name)).map((area) => ({
    ...area, name: clean(area.name), areaType: AREA_TYPES.has(area.areaType) ? area.areaType : inferredAreaType(area.name), capacity: area.capacity ?? '', note: clean(area.note),
  }))
  if (boardId.startsWith('speed_')) {
    const names = new Set(areas.map((area) => area.name.toLowerCase()))
    if (!names.has('fa')) areas.push({ name: 'FA', areaType: 'labor_share', capacity: '', note: 'Labor share outside SPEED production' })
    if (!names.has('fa metal removal')) areas.push({ name: 'FA Metal Removal', areaType: 'labor_share', capacity: '', note: 'Labor share outside SPEED production' })
  }
  scope.areaDefs = areas
}

export function validateAndRepairState(req, res) {
  const state = req.body?.state
  if (!state || typeof state !== 'object' || Array.isArray(state)) { res.status(400).json({ error: 'Shared state payload is missing or invalid.', invalidState: true }); return false }
  const boardId = clean(state.currentBoardId)
  const rule = BOARD_RULES[boardId]
  if (!rule) { res.status(400).json({ error: 'Unknown active board ID. Refresh before saving.', invalidState: true }); return false }
  state.boardShift = rule[0]
  state.boardTitle = rule[1]
  normalizeAreas(state, boardId)
  state.weeklyBoards = state.weeklyBoards && typeof state.weeklyBoards === 'object' ? state.weeklyBoards : {}
  state.boardStore = state.boardStore && typeof state.boardStore === 'object' ? state.boardStore : {}
  if (!state.weekStartDate || !state.weeklyData || typeof state.weeklyData !== 'object') { res.status(400).json({ error: 'Active week data is invalid.', invalidState: true }); return false }
  for (const [id, stored] of Object.entries(state.boardStore)) {
    const storedRule = BOARD_RULES[id]
    if (!storedRule || !stored || typeof stored !== 'object') continue
    stored.boardShift = storedRule[0]
    stored.boardTitle = storedRule[1]
    stored.weeklyBoards = stored.weeklyBoards && typeof stored.weeklyBoards === 'object' ? stored.weeklyBoards : {}
    stored.dayTemplates = Array.isArray(stored.dayTemplates) ? stored.dayTemplates : []
    stored.auditLog = Array.isArray(stored.auditLog) ? stored.auditLog : []
    normalizeAreas(stored, id)
  }
  if (Array.isArray(state.builderPool)) state.builderPool = state.builderPool.map((builder) => ({ ...builder, countsAsProductionLabor: !!builder.countsAsProductionLabor }))
  state.recoveryRevision = Number(state.recoveryRevision || 0)
  state.recoveryNotifications = Array.isArray(state.recoveryNotifications) ? state.recoveryNotifications : []
  state.recoveryRequests = Array.isArray(state.recoveryRequests) ? state.recoveryRequests : []
  state.stateRevision = Math.max(Number(state.stateRevision || 0), Number(runtime.currentStateRevision || 0))
  try {
    assertValidState(state)
  } catch (error) {
    res.status(400).json({ error: error.message || 'Shared state validation failed.', invalidState: true, details: error.details || {} })
    return false
  }
  return true
}
