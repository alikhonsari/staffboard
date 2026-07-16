import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import path from 'path'
import { loadAdmins } from './admin-env.js'
import { installPostgresRestoreRoutes } from './postgres-restore.js'
import {
  getJsonDocument, postgresHealth, postgresStoreConfig, putJsonDocument, updateJsonDocument,
} from './postgres-json-store.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = Number(process.env.PORT || 8787)
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.AUTH_TOKEN || process.env.PGPASSWORD || 'staffboard-dev-secret'
const KEY = process.env.STAFFBOARD_STATE_KEY || process.env.SPACES_OBJECT_KEY || 'weekly/staffboard-2/staffboard-state.json'
const HISTORY_KEY = process.env.STAFFBOARD_HISTORY_KEY || process.env.SPACES_HISTORY_KEY || KEY.replace(/\.json$/i, '-history.json')
const BASE_PREFIX = KEY.includes('/') ? KEY.slice(0, KEY.lastIndexOf('/') + 1) : ''
const VERSION_HISTORY_KEY = process.env.STAFFBOARD_VERSION_HISTORY_KEY || process.env.SPACES_VERSION_HISTORY_KEY || `${BASE_PREFIX}version-history.json`
const STATE_JSON_LIMIT = String(process.env.STAFFBOARD_STATE_JSON_LIMIT || '64mb').trim() || '64mb'
const PRESENCE_TTL_MS = 45_000
const BOARD_SCOPED_KEYS = ['boardTitle', 'boardShift', 'selectedDay', 'areaDefs', 'weeklyData', 'weeklyBoards', 'weeklyHistory', 'lockedWeeks', 'commentsBoard']

const presenceSessions = new Map()
const app = express()
app.use(cors())
installPostgresRestoreRoutes(app, {
  requireAuth,
  keys: { state: KEY, history: HISTORY_KEY, versions: VERSION_HISTORY_KEY },
})
app.use(express.json({ limit: STATE_JSON_LIMIT }))

const clean = (value) => String(value || '').trim()
const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)
const cloneJson = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
const hasObjectKeys = (value) => isPlainObject(value) && Object.keys(value).length > 0
function hasMeaningfulValue(value) { if (Array.isArray(value)) return value.length > 0; if (isPlainObject(value)) return Object.values(value).some(hasMeaningfulValue); return String(value ?? '').trim() !== '' }
function hasDayData(day = {}) { return isPlainObject(day) && (hasObjectKeys(day.assignments) || (Array.isArray(day.movementLog) && day.movementLog.length) || (Array.isArray(day.attendanceLog) && day.attendanceLog.length) || hasMeaningfulValue(day.opsMetrics || {}) || hasMeaningfulValue(day.rackLists || {}) || hasMeaningfulValue(day.snapshots || {})) }
const hasWeekData = (weeklyData = {}) => isPlainObject(weeklyData) && Object.values(weeklyData).some(hasDayData)
function hasBoardData(board = {}) { return isPlainObject(board) && (hasWeekData(board.weeklyData) || hasMeaningfulValue(board.weeklyBoards || {}) || hasMeaningfulValue(board.weeklyHistory || {}) || hasMeaningfulValue(board.commentsBoard || {})) }
function takeBoardScopedState(state = {}) { const snapshot = {}; BOARD_SCOPED_KEYS.forEach((key) => { if (state[key] !== undefined) snapshot[key] = cloneJson(state[key]) }); return snapshot }
function mergeBoardScoped(existingBoard = {}, incomingBoard = {}) { const existing = isPlainObject(existingBoard) ? existingBoard : {}; const incoming = isPlainObject(incomingBoard) ? incomingBoard : {}; if (hasBoardData(existing) && !hasBoardData(incoming)) return existing; return { ...existing, ...incoming, weeklyBoards: { ...(existing.weeklyBoards || {}), ...(incoming.weeklyBoards || {}) }, weeklyHistory: { ...(existing.weeklyHistory || {}), ...(incoming.weeklyHistory || {}) }, lockedWeeks: { ...(existing.lockedWeeks || {}), ...(incoming.lockedWeeks || {}) } } }
function mergeIncomingState(existingState = {}, incomingState = {}) { const existing = isPlainObject(existingState) ? existingState : {}; const incoming = isPlainObject(incomingState) ? incomingState : {}; const boardId = clean(incoming.currentBoardId || existing.currentBoardId || 'speed_day') || 'speed_day'; const existingStore = isPlainObject(existing.boardStore) ? existing.boardStore : {}; const incomingStore = isPlainObject(incoming.boardStore) ? incoming.boardStore : {}; const mergedStore = { ...existingStore }; Object.entries(incomingStore).forEach(([id, board]) => { mergedStore[id] = mergeBoardScoped(existingStore[id], board) }); mergedStore[boardId] = mergeBoardScoped(mergedStore[boardId], takeBoardScopedState(incoming)); const merged = { ...existing, ...incoming, currentBoardId: boardId, boardStore: mergedStore, storageConfig: { mode: 'postgres', backend: 'postgres' } }; const activeBoard = mergedStore[boardId]; if (activeBoard) BOARD_SCOPED_KEYS.forEach((key) => { if (activeBoard[key] !== undefined) merged[key] = cloneJson(activeBoard[key]) }); return merged }

let adminWarningSignature = ''
function getAdmins() {
  const result = loadAdmins(process.env, AUTH_TOKEN)
  const signature = result.warnings.join('|')
  if (signature && signature !== adminWarningSignature) {
    result.warnings.forEach((warning) => console.warn(warning))
    adminWarningSignature = signature
  }
  return result.admins
}
function signSession(user) { const payload = { username: user.username, role: user.role || 'admin', exp: Date.now() + 86400000 }; const body = Buffer.from(JSON.stringify(payload)).toString('base64url'); const sig = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url'); return `${body}.${sig}` }
function verifySession(token) { try { if (!token || !token.includes('.')) return null; const [body, sig] = token.split('.'); const expected = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url'); if (Buffer.byteLength(sig) !== Buffer.byteLength(expected)) return null; if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null; const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')); if (payload.exp && Date.now() > payload.exp) return null; return payload } catch { return null } }
function getBearerToken(req) { const auth = req.headers.authorization || ''; const headerToken = req.headers['x-auth-token'] || ''; return auth.startsWith('Bearer ') ? auth.slice(7) : headerToken }
function requireAuth(req, res, next) { const token = getBearerToken(req); const session = verifySession(token); if (session) { req.user = session; return next() } if (AUTH_TOKEN && token === AUTH_TOKEN) { req.user = { username: 'token-admin', role: 'admin' }; return next() } return res.status(401).json({ error: 'Unauthorized' }) }

function cleanPresence() { const cutoff = Date.now() - PRESENCE_TTL_MS; for (const [id, item] of presenceSessions.entries()) if (!item.lastSeenMs || item.lastSeenMs < cutoff) presenceSessions.delete(id) }
function publicPresence() { cleanPresence(); return Array.from(presenceSessions.values()).sort((a, b) => b.lastSeenMs - a.lastSeenMs).map((item) => ({ id: item.id, username: item.username, role: item.role || 'admin', page: item.page || '', boardTitle: item.boardTitle || '', selectedDay: item.selectedDay || '', lastSeen: item.lastSeen })) }

app.get('/api/health', async (req, res) => {
  const database = await postgresHealth()
  res.status(database.ok ? 200 : 503).json({
    ok: database.ok,
    mode: process.env.NODE_ENV === 'production' ? 'api-only' : 'development',
    storageBackend: 'postgres',
    database,
    authConfigured: getAdmins().length > 0 || Boolean(AUTH_TOKEN),
    admins: getAdmins().map((admin) => admin.username),
    presenceOnline: publicPresence().length,
    stateKey: KEY,
    historyKey: HISTORY_KEY,
    versionHistoryKey: VERSION_HISTORY_KEY,
    stateJsonLimit: STATE_JSON_LIMIT,
    restoreEnabled: Boolean(clean(process.env.STAFFBOARD_RESTORE_TOKEN)),
    importFromSpaces: postgresStoreConfig.importFromSpaces,
  })
})
app.post('/api/login', (req, res) => { const username = clean(req.body?.username); const password = clean(req.body?.password); const found = getAdmins().find((admin) => admin.username === username && admin.password === password); if (!found) return res.status(401).json({ error: 'Invalid username or password' }); const user = { username: found.username, role: found.role || 'admin' }; res.json({ token: signSession(user), user }) })
app.get('/api/me', requireAuth, (req, res) => res.json({ user: { username: req.user.username, role: req.user.role || 'admin' } }))
app.post('/api/presence', requireAuth, (req, res) => { cleanPresence(); const id = clean(req.body?.id) || crypto.randomUUID(); const now = new Date(); presenceSessions.set(id, { id, username: req.user?.username || 'unknown', role: req.user?.role || 'admin', page: clean(req.body?.page), boardTitle: clean(req.body?.boardTitle), selectedDay: clean(req.body?.selectedDay), lastSeen: now.toISOString(), lastSeenMs: now.getTime(), ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '' }); res.json({ id, online: publicPresence() }) })
app.get('/api/presence', requireAuth, (req, res) => res.json({ online: publicPresence() }))
app.get('/api/state', requireAuth, async (req, res) => { try { res.json(await getJsonDocument(KEY, { state: {}, updatedAt: '', stateRevision: 0 })) } catch (err) { console.error(err); res.status(503).json({ error: err.message || 'Failed to load state from PostgreSQL.' }) } })
async function saveState(req, res) { try { const incomingState = req.body?.state || {}; const existingPayload = await getJsonDocument(KEY, { state: {}, updatedAt: '', stateRevision: 0 }); const state = mergeIncomingState(existingPayload.state || {}, incomingState); const savedAt = new Date().toISOString(); const payload = { state, updatedAt: savedAt, updatedBy: req.user?.username || 'unknown' }; await putJsonDocument(KEY, payload); await updateJsonDocument(HISTORY_KEY, { events: [] }, (history) => { const events = Array.isArray(history?.events) ? history.events : []; events.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: savedAt, user: req.user?.username || 'unknown', action: 'Auto saved board', boardTitle: state.boardTitle || '', boardId: state.currentBoardId || state.boardId || '', weekStartDate: state.weekStartDate || '', selectedDay: state.selectedDay || '', ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '' }); return { events: events.slice(0, 500), updatedAt: savedAt } }); res.json(payload) } catch (err) { console.error(err); res.status(503).json({ error: err.message || 'Failed to save state to PostgreSQL.' }) } }
app.put('/api/state', requireAuth, saveState)
app.post('/api/state', requireAuth, saveState)
app.get('/api/history', requireAuth, async (req, res) => { try { const history = await getJsonDocument(HISTORY_KEY, { events: [] }); res.json({ events: Array.isArray(history.events) ? history.events : [] }) } catch (err) { console.error(err); res.status(503).json({ error: err.message || 'Failed to load history from PostgreSQL.' }) } })

app.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large' || error?.status === 413) {
    return res.status(413).json({
      error: `StaffBoard state exceeds the configured ${STATE_JSON_LIMIT} save limit.`,
      code: 'STATE_PAYLOAD_TOO_LARGE',
      limit: STATE_JSON_LIMIT,
    })
  }
  return next(error)
})

async function start() {
  if (process.env.NODE_ENV !== 'production' && process.env.STAFFBOARD_API_ONLY !== '1') {
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({ root: __dirname, server: { middlewareMode: true }, appType: 'spa' })
    app.use(vite.middlewares)
  }
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`StaffBoard V6 running on http://127.0.0.1:${PORT}`)
    console.log(`Runtime mode: ${process.env.NODE_ENV === 'production' || process.env.STAFFBOARD_API_ONLY === '1' ? 'API only' : 'Vite development'}`)
    console.log(`Storage backend: PostgreSQL configured=${postgresStoreConfig.configured}`)
    console.log(`State JSON save limit: ${STATE_JSON_LIMIT}`)
    console.log(`Admins configured: ${getAdmins().map((a) => a.username).join(', ') || 'none'}`)
    console.log(`Protected restore endpoint: ${clean(process.env.STAFFBOARD_RESTORE_TOKEN) ? 'enabled' : 'disabled'}`)
  })
}

start()
