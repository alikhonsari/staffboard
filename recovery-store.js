import crypto from 'crypto'
import { buildVersionRecords, detectBackupReason } from './recovery-core.js'
import { config, deleteObjectJson, getObjectJson, putObjectJson, registerAfterPersistObserver, registerBeforePersistObserver } from './guarded-server-runtime.js'

const MAX_VERSIONS = Number(process.env.STAFFBOARD_VERSION_LIMIT || 500)
const MAX_BACKUPS = Number(process.env.STAFFBOARD_BACKUP_LIMIT || 120)
const basePrefix = config.key.includes('/') ? config.key.slice(0, config.key.lastIndexOf('/') + 1) : ''
export const recoveryKeys = {
  versions: process.env.SPACES_VERSION_HISTORY_KEY || `${basePrefix}version-history.json`,
  backupIndex: process.env.SPACES_BACKUP_INDEX_KEY || `${basePrefix}backups/index.json`,
  backupPrefix: process.env.SPACES_BACKUP_PREFIX || `${basePrefix}backups/`,
}

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value))
const clean = (value) => String(value || '').trim()

function id(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`
}

function mondayKey(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12))
  const day = utc.getUTCDay()
  utc.setUTCDate(utc.getUTCDate() + (day === 0 ? -6 : 1 - day))
  return utc.toISOString().slice(0, 10)
}

export async function appendVersionRecords(records = []) {
  if (!records.length) return []
  const payload = await getObjectJson(recoveryKeys.versions, { versions: [] })
  const existing = Array.isArray(payload.versions) ? payload.versions : []
  const ids = new Set(records.map((record) => record.id))
  const versions = [...records, ...existing.filter((record) => !ids.has(record.id))].slice(0, MAX_VERSIONS)
  await putObjectJson(recoveryKeys.versions, { versions, updatedAt: new Date().toISOString(), limit: MAX_VERSIONS })
  return records
}

export async function recordStateVersions(beforeState, afterState, context = {}) {
  const records = buildVersionRecords(beforeState, afterState, context)
  await appendVersionRecords(records)
  return records
}

export async function loadVersion(versionId) {
  const payload = await getObjectJson(recoveryKeys.versions, { versions: [] })
  return (Array.isArray(payload.versions) ? payload.versions : []).find((record) => record.id === versionId) || null
}

export async function listVersions(filters = {}) {
  const payload = await getObjectJson(recoveryKeys.versions, { versions: [] })
  let rows = Array.isArray(payload.versions) ? payload.versions : []
  const equals = (field, value) => !clean(value) || clean(field).toLowerCase() === clean(value).toLowerCase()
  rows = rows.filter((row) => (
    equals(row.admin, filters.admin) && equals(row.boardId, filters.boardId) && equals(row.week, filters.week) &&
    equals(row.day, filters.day) && equals(row.entityType, filters.entityType) &&
    (!clean(filters.builderId) || (row.entityType === 'builder_assignment' && row.entityId === filters.builderId)) &&
    (!clean(filters.action) || clean(row.actionType).toLowerCase().includes(clean(filters.action).toLowerCase()))
  ))
  const limit = Math.max(1, Math.min(200, Number(filters.limit || 100)))
  return rows.slice(0, limit).map(({ previousValue, newValue, ...summary }) => ({
    ...summary,
    previousSummary: summarize(previousValue),
    newSummary: summarize(newValue),
  }))
}

function summarize(value) {
  if (value == null) return 'Empty'
  if (Array.isArray(value)) return `${value.length} item(s)`
  if (typeof value === 'object') return `${Object.keys(value).length} field(s)`
  const text = String(value)
  return text.length > 100 ? `${text.slice(0, 97)}...` : text
}

async function writeBackupIndex(index) {
  await putObjectJson(recoveryKeys.backupIndex, { backups: index, updatedAt: new Date().toISOString(), limit: MAX_BACKUPS })
}

async function pruneBackups(index) {
  const keep = index.slice(0, MAX_BACKUPS)
  const remove = index.slice(MAX_BACKUPS)
  for (const backup of remove) {
    try { await deleteObjectJson(backup.key) } catch (error) { console.warn('Failed to prune StaffBoard backup:', error.message) }
  }
  return keep
}

export async function createStateBackup(state, metadata = {}) {
  const createdAt = metadata.createdAt || new Date().toISOString()
  const backupId = id('backup')
  const safeKind = clean(metadata.kind || 'manual').toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'manual'
  const key = `${recoveryKeys.backupPrefix}${createdAt.slice(0, 10)}/${backupId}-${safeKind}.json`
  const record = {
    id: backupId,
    key,
    kind: safeKind,
    reason: metadata.reason || metadata.kind || 'Manual backup',
    actor: metadata.actor || 'System',
    createdAt,
    boardId: metadata.boardId || state.currentBoardId || '',
    shift: metadata.shift || state.boardShift || '',
    week: metadata.week || state.weekStartDate || '',
    day: metadata.day || state.selectedDay || '',
    stateRevision: metadata.stateRevision || state.updatedAt || '',
    sizeHint: JSON.stringify(state).length,
  }
  await putObjectJson(key, { metadata: record, state: clone(state) })
  const payload = await getObjectJson(recoveryKeys.backupIndex, { backups: [] })
  const existing = (Array.isArray(payload.backups) ? payload.backups : []).filter((item) => item.id !== backupId)
  const index = await pruneBackups([record, ...existing])
  await writeBackupIndex(index)
  return record
}

export async function ensureCalendarBackups(state, metadata = {}) {
  const payload = await getObjectJson(recoveryKeys.backupIndex, { backups: [] })
  const index = Array.isArray(payload.backups) ? payload.backups : []
  const now = metadata.now instanceof Date ? metadata.now : new Date(metadata.now || Date.now())
  const dateKey = now.toISOString().slice(0, 10)
  const weekKey = mondayKey(now)
  const created = []
  if (!index.some((item) => item.kind === 'daily' && item.createdAt?.slice(0, 10) === dateKey)) {
    created.push(await createStateBackup(state, { ...metadata, kind: 'daily', reason: 'Automatic daily snapshot', createdAt: now.toISOString() }))
  }
  const refreshed = (await getObjectJson(recoveryKeys.backupIndex, { backups: [] })).backups || []
  if (!refreshed.some((item) => item.kind === 'weekly' && item.weekBackupKey === weekKey)) {
    const weekly = await createStateBackup(state, { ...metadata, kind: 'weekly', reason: `Automatic weekly snapshot ${weekKey}`, createdAt: now.toISOString() })
    const latestPayload = await getObjectJson(recoveryKeys.backupIndex, { backups: [] })
    const rows = Array.isArray(latestPayload.backups) ? latestPayload.backups : []
    const updated = rows.map((row) => row.id === weekly.id ? { ...row, weekBackupKey: weekKey } : row)
    await writeBackupIndex(updated)
    created.push({ ...weekly, weekBackupKey: weekKey })
  }
  return created
}

export async function listBackups(limit = 50) {
  const payload = await getObjectJson(recoveryKeys.backupIndex, { backups: [] })
  return (Array.isArray(payload.backups) ? payload.backups : []).slice(0, Math.max(1, Math.min(200, Number(limit || 50))))
}

export async function loadBackup(backupId) {
  const backups = await listBackups(MAX_BACKUPS)
  const record = backups.find((item) => item.id === backupId)
  if (!record) return null
  return getObjectJson(record.key, null)
}

let observersInstalled = false

export function installRecoveryObservers() {
  if (observersInstalled) return
  observersInstalled = true
  registerBeforePersistObserver(async ({ previousState, nextState, actor, source, previousUpdatedAt }) => {
    const detected = detectBackupReason(previousState, nextState)
    const sourceNeedsBackup = /closure|restore|recovery|finalize|template|reset|clear/i.test(String(source || ''))
    if (detected || sourceNeedsBackup) {
      await createStateBackup(previousState, {
        kind: 'pre-action',
        reason: detected || `Before ${source || 'server action'}`,
        actor,
        stateRevision: previousUpdatedAt,
        boardId: previousState.currentBoardId,
        shift: previousState.boardShift,
        week: previousState.weekStartDate,
        day: previousState.selectedDay,
      })
    }
  })
  registerAfterPersistObserver(async ({ previousState, nextState, actor, source, stateRevision }) => {
    await recordStateVersions(previousState, nextState, { actor, source, stateRevision })
    await ensureCalendarBackups(nextState, { actor, stateRevision })
  })
}
