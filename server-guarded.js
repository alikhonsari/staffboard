import express from 'express'
import crypto from 'crypto'
import dotenv from 'dotenv'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import {
  DEFAULT_SITE_TIME_ZONE,
  applyImmediateTransition,
  applyManualAssignmentOverride,
  cancelScheduledTransition,
  createScheduledTransition,
  getNextPendingTransitionAt,
  processDueScheduledTransitions,
  reconcileIncomingManualChanges,
} from './scheduled-transitions-core.js'

dotenv.config()

let currentStateVersion = null
let saveQueue = Promise.resolve()
let scheduleTimer = null
let fallbackTimer = null
let scheduleRoutesInstalled = false

const PORT = Number(process.env.PORT || 8787)
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.AUTH_TOKEN || process.env.SPACES_SECRET || 'staffboard-dev-secret'
const BUCKET = process.env.SPACES_BUCKET || ''
const KEY = process.env.SPACES_OBJECT_KEY || 'weekly/staffboard-2/staffboard-state.json'
const HISTORY_KEY = process.env.SPACES_HISTORY_KEY || KEY.replace(/\.json$/i, '-history.json')
const ENDPOINT = process.env.SPACES_ENDPOINT || ''
const REGION = process.env.SPACES_REGION || 'us-east-1'
const ACCESS_KEY = process.env.SPACES_KEY || ''
const SECRET_KEY = process.env.SPACES_SECRET || ''
const SITE_TIME_ZONE = process.env.STAFFBOARD_TIME_ZONE || DEFAULT_SITE_TIME_ZONE
const spacesConfigured = Boolean(BUCKET && ENDPOINT && ACCESS_KEY && SECRET_KEY)
const s3 = spacesConfigured ? new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
}) : null

const BOARD_RULES = {
  speed_day: { shift: 'Day Shift', title: 'SPEED Staffing Board' },
  speed_night: { shift: 'Night Shift', title: 'SPEED Staffing Board' },
  fa_day: { shift: 'Day Shift', title: 'FA Lab Staffing Board' },
  fa_night: { shift: 'Night Shift', title: 'FA Lab Staffing Board' },
  bodega_day: { shift: 'Day Shift', title: 'Bodega Staffing Board' },
  bodega_night: { shift: 'Night Shift', title: 'Bodega Staffing Board' },
}
const AREA_TYPES = new Set(['production', 'support', 'labor_share', 'unassigned'])

const originalGet = express.application.get
const originalPut = express.application.put
const originalPost = express.application.post
const originalListen = express.application.listen

function clean(value) {
  return String(value || '').trim()
}

function versionFrom(payload) {
  return String(payload?.updatedAt || '')
}

function conflict(res, message) {
  return res.status(409).json({
    error: message,
    conflict: true,
    currentUpdatedAt: currentStateVersion,
  })
}

function invalidState(res, message) {
  return res.status(400).json({
    error: message,
    invalidState: true,
  })
}

function inferredAreaType(name) {
  const normalized = String(name || '').trim().toLowerCase()
  if (!normalized || normalized === 'unassigned') return 'unassigned'
  if (normalized === 'fa' || normalized === 'fa metal removal') return 'labor_share'
  if (['shipping', 'eos pull racks', 'projects', 'learning', '1:1'].includes(normalized)) return 'support'
  return 'production'
}

function normalizeAreaDefinitions(scope, boardId, repairs) {
  if (!scope || typeof scope !== 'object') return
  const input = Array.isArray(scope.areaDefs) ? scope.areaDefs : []
  const normalized = input
    .filter((area) => area && typeof area === 'object' && String(area.name || '').trim())
    .map((area) => {
      const expectedType = AREA_TYPES.has(area.areaType) ? area.areaType : inferredAreaType(area.name)
      if (area.areaType !== expectedType) repairs.push(`${boardId} ${area.name} area type -> ${expectedType}`)
      return {
        ...area,
        name: String(area.name).trim(),
        areaType: expectedType,
        capacity: area.capacity ?? '',
        note: String(area.note || ''),
      }
    })

  if (String(boardId).startsWith('speed_')) {
    const names = new Set(normalized.map((area) => area.name.toLowerCase()))
    if (!names.has('fa')) {
      normalized.push({ name: 'FA', areaType: 'labor_share', capacity: '', note: 'Labor share outside SPEED production' })
      repairs.push(`${boardId} added FA labor-share area`)
    }
    if (!names.has('fa metal removal')) {
      normalized.push({ name: 'FA Metal Removal', areaType: 'labor_share', capacity: '', note: 'Labor share outside SPEED production' })
      repairs.push(`${boardId} added FA Metal Removal labor-share area`)
    }
  }
  scope.areaDefs = normalized
}

function validateAndRepairScope(req, res) {
  const state = req.body?.state
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    invalidState(res, 'Shared state payload is missing or invalid.')
    return false
  }

  const boardId = String(state.currentBoardId || '')
  const activeRule = BOARD_RULES[boardId]
  if (!activeRule) {
    invalidState(res, 'Unknown active board ID. Refresh before saving.')
    return false
  }

  const repairs = []
  if (state.boardShift !== activeRule.shift) {
    state.boardShift = activeRule.shift
    repairs.push(`active shift -> ${activeRule.shift}`)
  }
  if (state.boardTitle !== activeRule.title) {
    state.boardTitle = activeRule.title
    repairs.push(`active title -> ${activeRule.title}`)
  }
  normalizeAreaDefinitions(state, boardId, repairs)

  if (!state.weekStartDate || typeof state.weekStartDate !== 'string') {
    invalidState(res, 'Active week is missing. Refresh before saving.')
    return false
  }
  if (!state.weeklyData || typeof state.weeklyData !== 'object' || Array.isArray(state.weeklyData)) {
    invalidState(res, 'Active weekly data is invalid. Refresh before saving.')
    return false
  }
  if (!state.weeklyBoards || typeof state.weeklyBoards !== 'object' || Array.isArray(state.weeklyBoards)) {
    state.weeklyBoards = {}
    repairs.push('initialized weeklyBoards')
  }
  if (!state.boardStore || typeof state.boardStore !== 'object' || Array.isArray(state.boardStore)) {
    state.boardStore = {}
    repairs.push('initialized boardStore')
  }

  Object.entries(state.boardStore).forEach(([storedId, stored]) => {
    const rule = BOARD_RULES[storedId]
    if (!rule || !stored || typeof stored !== 'object' || Array.isArray(stored)) return
    if (stored.boardShift !== rule.shift) {
      stored.boardShift = rule.shift
      repairs.push(`${storedId} shift -> ${rule.shift}`)
    }
    if (stored.boardTitle !== rule.title) {
      stored.boardTitle = rule.title
      repairs.push(`${storedId} title -> ${rule.title}`)
    }
    normalizeAreaDefinitions(stored, storedId, repairs)
    if (!stored.weeklyBoards || typeof stored.weeklyBoards !== 'object' || Array.isArray(stored.weeklyBoards)) {
      stored.weeklyBoards = {}
      repairs.push(`${storedId} initialized weeklyBoards`)
    }
    if (!Array.isArray(stored.dayTemplates)) stored.dayTemplates = []
    if (!Array.isArray(stored.auditLog)) stored.auditLog = []
  })

  if (Array.isArray(state.builderPool)) {
    state.builderPool = state.builderPool.map((builder) => ({
      ...builder,
      countsAsProductionLabor: !!builder.countsAsProductionLabor,
    }))
  }

  if (repairs.length) console.warn('[StaffBoard scope validation] Safe repairs applied:', repairs.join('; '))
  return true
}

async function streamToString(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf-8')
}

async function getObjectJson(key, fallback) {
  try {
    if (!s3) throw new Error('Spaces is not configured')
    const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
    const text = await streamToString(out.Body)
    return text ? JSON.parse(text) : fallback
  } catch (error) {
    const name = String(error?.name || error?.Code || '')
    if (name.includes('NoSuchKey') || error?.$metadata?.httpStatusCode === 404) return fallback
    throw error
  }
}

async function putObjectJson(key, payload) {
  if (!s3) throw new Error('Spaces is not configured')
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: JSON.stringify(payload, null, 2),
    ContentType: 'application/json',
  }))
}

async function appendHistory(entry) {
  try {
    const history = await getObjectJson(HISTORY_KEY, { events: [] })
    const events = Array.isArray(history.events) ? history.events : []
    const withoutDuplicate = entry.id ? events.filter((item) => item.id !== entry.id) : events
    withoutDuplicate.unshift(entry)
    await putObjectJson(HISTORY_KEY, { events: withoutDuplicate.slice(0, 500), updatedAt: new Date().toISOString() })
  } catch (error) {
    console.warn('Failed to write scheduling history:', error.message)
  }
}

function enqueueStateJob(task) {
  const job = saveQueue.catch(() => {}).then(task)
  saveQueue = job.catch(() => {})
  return job
}

function scheduleHistoryEntry(event, state, source) {
  const notification = (state.scheduleNotifications || []).find((item) => item.id === event.id)
  return {
    id: `schedule-${event.id}`,
    at: event.processedAt || event.canceledAt || event.createdAt || new Date().toISOString(),
    user: event.processedBy || event.canceledBy || event.createdBy || 'System',
    action: notification?.message || `${event.type || 'Scheduled transition'} ${event.status || ''}`.trim(),
    boardTitle: state.boardTitle || '',
    boardId: event.boardId || '',
    weekStartDate: event.weekStartDate || '',
    selectedDay: event.day || '',
    builderId: event.builderId || '',
    transitionId: event.id,
    effectiveAt: event.effectiveAt || event.scheduledAt || '',
    processedAt: event.processedAt || '',
    delayed: !!event.delayed,
    source,
  }
}

async function persistState(state, actor, source, events = []) {
  const savedAt = new Date().toISOString()
  const payload = { state: { ...state, updatedAt: savedAt }, updatedAt: savedAt, updatedBy: actor || 'System' }
  await putObjectJson(KEY, payload)
  currentStateVersion = savedAt
  for (const event of events) await appendHistory(scheduleHistoryEntry(event, payload.state, source))
  scheduleNextReconciliation(payload.state)
  return payload
}

async function reconcilePersistedStateLocked(source = 'reconciliation') {
  if (!s3) return { changed: false, payload: { state: {}, updatedAt: '' }, events: [] }
  const payload = await getObjectJson(KEY, { state: {}, updatedAt: '' })
  currentStateVersion = String(payload.updatedAt || '')
  const result = processDueScheduledTransitions(payload.state || {}, new Date(), { timeZone: SITE_TIME_ZONE, actor: 'System' })
  if (!result.changed) {
    scheduleNextReconciliation(payload.state || {})
    return { ...result, payload }
  }
  const saved = await persistState(result.state, 'System', source, result.events)
  return { ...result, payload: saved }
}

function scheduleNextReconciliation(state) {
  if (scheduleTimer) clearTimeout(scheduleTimer)
  const nextDueAt = getNextPendingTransitionAt(state || {})
  if (!nextDueAt) {
    scheduleTimer = null
    return
  }
  const dueMs = new Date(nextDueAt).getTime()
  const delay = Math.max(0, dueMs - Date.now()) + 10
  scheduleTimer = setTimeout(() => {
    enqueueStateJob(() => reconcilePersistedStateLocked('scheduled-timer')).catch((error) => console.error('Scheduled transition timer failed:', error))
  }, Math.min(delay, 2_147_000_000))
  scheduleTimer.unref?.()
}

function verifySession(token) {
  try {
    if (!token || !token.includes('.')) return null
    const [body, sig] = token.split('.')
    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url')
    if (Buffer.byteLength(sig) !== Buffer.byteLength(expected)) return null
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'))
    if (payload.exp && Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

function getBearerToken(req) {
  const auth = req.headers.authorization || ''
  const headerToken = req.headers['x-auth-token'] || ''
  return auth.startsWith('Bearer ') ? auth.slice(7) : headerToken
}

function requireScheduleAuth(req, res, next) {
  const token = getBearerToken(req)
  const session = verifySession(token)
  if (session) {
    req.user = session
    return next()
  }
  if (AUTH_TOKEN && token === AUTH_TOKEN) {
    req.user = { username: 'token-admin', role: 'admin' }
    return next()
  }
  return res.status(401).json({ error: 'Unauthorized' })
}

function validateScheduleRequest(body) {
  const required = ['boardId', 'weekStartDate', 'day', 'builderId']
  for (const key of required) if (!clean(body?.[key])) throw new Error(`Missing ${key}.`)
}

async function scheduleActionHandler(req, res) {
  try {
    if (!s3) return res.status(500).json({ error: 'Spaces is not configured' })
    const actor = req.user?.username || 'System'
    const body = req.body || {}
    validateScheduleRequest(body)
    const response = await enqueueStateJob(async () => {
      const reconciled = await reconcilePersistedStateLocked('pre-action-reconciliation')
      const baseState = reconciled.payload.state || {}
      let result
      if (body.action === 'schedule') {
        if (!['clock_in', 'clock_out'].includes(body.type)) throw new Error('Choose clock_in or clock_out.')
        if (!clean(body.time)) throw new Error('Choose a scheduled time.')
        result = createScheduledTransition(baseState, body, { actor, timeZone: SITE_TIME_ZONE, now: new Date() })
      } else if (body.action === 'cancel') {
        if (!['clock_in', 'clock_out', 'all'].includes(body.type)) throw new Error('Choose a transition to cancel.')
        result = cancelScheduledTransition(baseState, body, { actor, timeZone: SITE_TIME_ZONE, now: new Date() })
      } else if (body.action === 'immediate') {
        if (!['clock_in', 'clock_out'].includes(body.type)) throw new Error('Choose clock_in or clock_out.')
        result = applyImmediateTransition(baseState, body, { actor, timeZone: SITE_TIME_ZONE, now: new Date() })
      } else if (body.action === 'override') {
        result = applyManualAssignmentOverride(baseState, body, { actor, timeZone: SITE_TIME_ZONE, now: new Date() })
      } else {
        throw new Error('Unknown scheduled transition action.')
      }
      const payload = result.changed
        ? await persistState(result.state, actor, `schedule-${body.action}`, result.events || [])
        : reconciled.payload
      return { payload, result }
    })
    const latestNotification = response.payload.state?.scheduleNotifications?.[0] || null
    return res.json({
      ...response.payload,
      changed: !!response.result.changed,
      scheduleRevision: Number(response.payload.state?.scheduleRevision || 0),
      notification: latestNotification,
      message: latestNotification?.message || 'Scheduled transition updated.',
      timeZone: SITE_TIME_ZONE,
    })
  } catch (error) {
    console.error('Scheduled transition action failed:', error)
    return res.status(400).json({ error: error.message || 'Scheduled transition action failed.' })
  }
}

async function scheduleStatusHandler(req, res) {
  try {
    const result = await enqueueStateJob(() => reconcilePersistedStateLocked('status-poll'))
    const state = result.payload.state || {}
    return res.json({
      updatedAt: result.payload.updatedAt || '',
      updatedBy: result.payload.updatedBy || '',
      scheduleRevision: Number(state.scheduleRevision || 0),
      notifications: (state.scheduleNotifications || []).slice(0, 10),
      nextDueAt: getNextPendingTransitionAt(state),
      timeZone: SITE_TIME_ZONE,
    })
  } catch (error) {
    console.error('Scheduled transition status failed:', error)
    return res.status(500).json({ error: error.message || 'Failed to reconcile scheduled transitions.' })
  }
}

function installScheduleRoutes(app) {
  if (scheduleRoutesInstalled) return
  scheduleRoutesInstalled = true
  app.get('/api/scheduled-transitions/status', requireScheduleAuth, scheduleStatusHandler)
  app.post('/api/scheduled-transitions', requireScheduleAuth, scheduleActionHandler)
}

function invokeHandler(handler, req, res, next) {
  return new Promise((resolve, reject) => {
    const originalJson = res.json.bind(res)
    res.json = (payload) => {
      const version = versionFrom(payload)
      if (version) currentStateVersion = version
      const result = originalJson(payload)
      resolve(payload)
      return result
    }
    try {
      const result = handler(req, res, next)
      if (result && typeof result.then === 'function') result.catch(reject)
    } catch (error) {
      reject(error)
    }
  })
}

function wrapStateGet(handler) {
  return function guardedStateGet(req, res, next) {
    enqueueStateJob(async () => {
      await reconcilePersistedStateLocked('state-get')
      return invokeHandler(handler, req, res, next)
    }).catch((error) => {
      console.error('State reconciliation failed:', error)
      if (!res.headersSent) res.status(500).json({ error: 'Failed to load shared state.' })
    })
  }
}

function wrapStateSave(handler) {
  return function guardedStateSave(req, res, next) {
    const hasBaseVersion = Object.prototype.hasOwnProperty.call(req.body || {}, 'baseUpdatedAt')
    const baseVersion = String(req.body?.baseUpdatedAt || '')
    if (!hasBaseVersion) return conflict(res, 'This browser session is outdated. Refresh before editing.')

    enqueueStateJob(async () => {
      const reconciled = await reconcilePersistedStateLocked('pre-save-reconciliation')
      if (currentStateVersion !== null && baseVersion !== currentStateVersion) {
        conflict(res, 'The board changed in another session. Reload the latest version before editing.')
        return
      }
      const prepared = reconcileIncomingManualChanges(
        reconciled.payload.state || {},
        req.body?.state || {},
        { actor: req.user?.username || 'System', timeZone: SITE_TIME_ZONE, now: new Date() },
      )
      req.body.state = prepared.state
      if (!validateAndRepairScope(req, res)) return
      const payload = await invokeHandler(handler, req, res, next)
      scheduleNextReconciliation(payload?.state || req.body.state)
    }).catch((error) => {
      console.error('State save queue failed:', error)
      if (!res.headersSent) res.status(500).json({ error: 'Failed to save shared state.' })
    })
  }
}

function patchRoute(methodName, originalMethod) {
  express.application[methodName] = function patchedRoute(path, ...handlers) {
    if (!scheduleRoutesInstalled && String(path).startsWith('/api/')) installScheduleRoutes(this)
    if (path === '/api/state' && handlers.length) {
      const last = handlers.length - 1
      if (methodName === 'get') handlers[last] = wrapStateGet(handlers[last])
      else handlers[last] = wrapStateSave(handlers[last])
    }
    return originalMethod.call(this, path, ...handlers)
  }
}

patchRoute('get', originalGet)
patchRoute('put', originalPut)
patchRoute('post', originalPost)

express.application.listen = function patchedListen(...args) {
  const server = originalListen.call(this, ...args)
  enqueueStateJob(() => reconcilePersistedStateLocked('startup')).catch((error) => console.error('Startup reconciliation failed:', error))
  if (!fallbackTimer) {
    fallbackTimer = setInterval(() => {
      enqueueStateJob(() => reconcilePersistedStateLocked('fallback-sweep')).catch((error) => console.error('Fallback schedule sweep failed:', error))
    }, 30_000)
    fallbackTimer.unref?.()
  }
  console.log(`Scheduled transitions use ${SITE_TIME_ZONE} and server-authoritative reconciliation on port ${PORT}.`)
  return server
}

await import('./server.js')
