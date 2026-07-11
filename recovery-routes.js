import crypto from 'crypto'
import { reconcileIncomingManualChanges } from './scheduled-transitions-core.js'
import { preserveServerManagedClosures } from './day-closures-core.js'
import { applyVersionRestore, buildEmergencyExport, previewVersionRestore } from './recovery-core.js'
import {
  appendHistory, config, enqueue, persistState, reconcilePersistedState, requireAdminAuth, runtime,
} from './guarded-server-runtime.js'
import {
  createStateBackup, installRecoveryObservers, listBackups, listVersions, loadBackup, loadVersion,
} from './recovery-store.js'

let installed = false
const clean = (value) => String(value || '').trim()
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value))

function conflict(res, message) {
  return res.status(409).json({ error: message, conflict: true, currentUpdatedAt: runtime.currentStateVersion })
}

function requireFreshRevision(body, res) {
  if (!Object.prototype.hasOwnProperty.call(body || {}, 'baseUpdatedAt')) {
    conflict(res, 'This browser session is outdated. Refresh before using recovery tools.')
    return false
  }
  if (String(body.baseUpdatedAt || '') !== String(runtime.currentStateVersion || '')) {
    conflict(res, 'The board changed in another session. Reload before restoring or undoing data.')
    return false
  }
  return true
}

function requestAlreadyApplied(state, requestId) {
  return clean(requestId) && (state.recoveryRequests || []).some((row) => row.id === requestId)
}

function markRequest(state, requestId, actor, action) {
  if (!clean(requestId)) return
  state.recoveryRequests = [{ id: requestId, actor, action, at: new Date().toISOString() }, ...(state.recoveryRequests || [])].slice(0, 100)
}

function recoveryAudit(state, details) {
  const row = {
    id: `recovery-audit-${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    admin: details.actor || 'System',
    board: details.boardId || state.currentBoardId || '',
    boardId: details.boardId || state.currentBoardId || '',
    shift: details.shift || state.boardShift || '',
    week: details.week || state.weekStartDate || '',
    day: details.day || state.selectedDay || '',
    action: details.action,
    oldValue: details.oldValue || '',
    newValue: details.newValue || '',
    reason: details.reason || '',
    source: 'Data Recovery',
    revision: details.revision || '',
    relatedRecordId: details.relatedRecordId || '',
  }
  state.auditLog = [row, ...(Array.isArray(state.auditLog) ? state.auditLog : [])].slice(0, 500)
  state.recoveryRevision = Number(state.recoveryRevision || 0) + 1
  state.recoveryNotifications = [{
    id: row.id, at: row.timestamp, message: `${details.action} completed by ${row.admin}.`, action: details.action,
  }, ...(state.recoveryNotifications || [])].slice(0, 40)
  return row
}

async function versionsHandler(req, res) {
  try {
    const versions = await listVersions(req.query || {})
    return res.json({ versions, count: versions.length, currentUpdatedAt: runtime.currentStateVersion || '' })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load version history.' })
  }
}

async function backupsHandler(req, res) {
  try {
    const backups = await listBackups(req.query?.limit || 50)
    return res.json({ backups, count: backups.length, currentUpdatedAt: runtime.currentStateVersion || '' })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load backups.' })
  }
}

async function previewHandler(req, res) {
  try {
    const body = req.body || {}
    if (!clean(body.versionId)) return res.status(400).json({ error: 'Choose a version to preview.' })
    const result = await enqueue(async () => {
      const reconciled = await reconcilePersistedState('recovery-preview')
      const version = await loadVersion(body.versionId)
      if (!version) throw new Error('The selected version no longer exists.')
      const preview = previewVersionRestore(reconciled.payload.state || {}, version, { direction: body.direction })
      if (clean(body.compareVersionId)) {
        const compare = await loadVersion(body.compareVersionId)
        if (!compare) throw new Error('The comparison version no longer exists.')
        preview.comparison = previewVersionRestore(reconciled.payload.state || {}, compare, { direction: body.direction })
        preview.sameRestoreValue = JSON.stringify(preview.restoreValue) === JSON.stringify(preview.comparison.restoreValue)
      }
      return preview
    })
    return res.json({ preview: result })
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Failed to preview restore.' })
  }
}

function assertBackupRestoreAllowed(state, confirmLocked) {
  const activeLocked = Object.values(state.lockedWeeks || {}).some(Boolean)
  const storedLocked = Object.values(state.boardStore || {}).some((board) => Object.values(board?.lockedWeeks || {}).some(Boolean))
  if ((activeLocked || storedLocked) && !confirmLocked) {
    throw new Error('One or more weeks are locked. Unlock them or explicitly confirm the locked-week backup restore.')
  }
}

async function actionHandler(req, res) {
  try {
    if (!config.spacesConfigured) return res.status(500).json({ error: 'Spaces is not configured' })
    const body = req.body || {}
    const actor = req.user?.username || 'System'
    const action = clean(body.action)
    const response = await enqueue(async () => {
      const reconciled = await reconcilePersistedState('pre-recovery-action')
      const current = reconciled.payload.state || {}

      if (action === 'create_backup') {
        const backup = await createStateBackup(current, {
          kind: body.kind || 'manual', reason: body.reason || 'Manual administrative backup', actor,
          stateRevision: reconciled.payload.updatedAt || '', boardId: current.currentBoardId,
          shift: current.boardShift, week: current.weekStartDate, day: current.selectedDay,
        })
        await appendHistory({ id: `recovery-backup-${backup.id}`, at: backup.createdAt, user: actor, action: 'Created administrative backup', actionType: 'BACKUP_CREATED', boardId: backup.boardId, weekStartDate: backup.week, selectedDay: backup.day, backupId: backup.id, source: 'Data Recovery' })
        return { payload: reconciled.payload, backup, changed: false, message: 'Administrative backup created.' }
      }

      if (!requireFreshRevision(body, res)) return null
      if (requestAlreadyApplied(current, body.requestId)) {
        return { payload: reconciled.payload, changed: false, duplicate: true, message: 'This recovery request was already applied.' }
      }

      let nextState
      let relatedRecordId = ''
      let message = ''
      let actionLabel = ''
      let restoredEntity = ''

      if (action === 'undo_last' || action === 'restore_version') {
        let versionId = clean(body.versionId)
        if (action === 'undo_last') {
          const summaries = await listVersions({ boardId: body.boardId || current.currentBoardId, week: body.weekStartDate || current.weekStartDate, limit: 100 })
          const selected = summaries.find((row) => row.reversible && !String(row.source || '').includes('recovery-preview'))
          versionId = selected?.id || ''
          if (!versionId) throw new Error('No reversible version is available for this scope.')
        }
        const version = await loadVersion(versionId)
        if (!version) throw new Error('The selected version no longer exists.')
        await createStateBackup(current, { kind: 'pre-restore', reason: `Before restoring ${version.id}`, actor, stateRevision: reconciled.payload.updatedAt || '', boardId: version.boardId, shift: version.shift, week: version.week, day: version.day })
        const restored = applyVersionRestore(current, version, { actor, reason: body.reason || '', direction: body.direction, now: new Date() })
        nextState = restored.state
        relatedRecordId = version.id
        restoredEntity = restored.entityType
        actionLabel = action === 'undo_last' ? 'Undo Last Change' : 'Restore Version'
        message = `${actionLabel} completed for ${restored.entityType}.`
      } else if (action === 'restore_backup') {
        if (!clean(body.backupId)) throw new Error('Choose a backup to restore.')
        assertBackupRestoreAllowed(current, body.confirmLocked === true)
        const backup = await loadBackup(body.backupId)
        if (!backup?.state) throw new Error('The selected backup could not be loaded.')
        await createStateBackup(current, { kind: 'pre-restore', reason: `Before restoring backup ${body.backupId}`, actor, stateRevision: reconciled.payload.updatedAt || '' })
        const scheduled = reconcileIncomingManualChanges(current, clone(backup.state), { actor, timeZone: config.timeZone, now: new Date() })
        nextState = preserveServerManagedClosures(current, scheduled.state)
        nextState.auditLog = Array.isArray(current.auditLog) ? clone(current.auditLog) : []
        relatedRecordId = body.backupId
        restoredEntity = 'full_state_backup'
        actionLabel = 'Restore Backup'
        message = 'The selected backup was restored while preserving current closure and scheduled-transition controls.'
      } else {
        throw new Error('Unknown recovery action.')
      }

      markRequest(nextState, body.requestId, actor, action)
      recoveryAudit(nextState, {
        actor, action: actionLabel, reason: body.reason || '', relatedRecordId,
        boardId: body.boardId || current.currentBoardId, shift: current.boardShift,
        week: body.weekStartDate || current.weekStartDate, day: body.day || current.selectedDay,
        revision: reconciled.payload.updatedAt || '', newValue: restoredEntity,
      })
      const payload = await persistState(nextState, actor, `recovery-${action}`, [])
      await appendHistory({
        id: `recovery-history-${body.requestId || relatedRecordId}-${payload.updatedAt}`, at: payload.updatedAt, user: actor,
        action: actionLabel, actionType: action.toUpperCase(), boardId: body.boardId || current.currentBoardId,
        weekStartDate: body.weekStartDate || current.weekStartDate, selectedDay: body.day || current.selectedDay,
        relatedRecordId, source: 'Data Recovery', reason: body.reason || '',
      })
      return { payload, changed: true, message, restoredEntity, relatedRecordId }
    })
    if (!response) return
    return res.json({ ...response.payload, changed: response.changed, duplicate: !!response.duplicate, backup: response.backup || null, restoredEntity: response.restoredEntity || '', relatedRecordId: response.relatedRecordId || '', message: response.message })
  } catch (error) {
    console.error('Recovery action failed:', error)
    return res.status(/locked|outdated|changed in another/i.test(error.message || '') ? 409 : 400).json({ error: error.message || 'Recovery action failed.' })
  }
}

async function exportHandler(req, res) {
  try {
    const result = await enqueue(async () => {
      const reconciled = await reconcilePersistedState('recovery-export')
      return buildEmergencyExport(reconciled.payload.state || {}, req.query?.scope || 'current', {
        boardId: req.query?.boardId, weekStartDate: req.query?.weekStartDate, day: req.query?.day,
      })
    })
    const safeScope = String(result.scope || 'current').replace(/[^a-z0-9_-]+/gi, '-')
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="staffboard-admin-backup-${safeScope}-${new Date().toISOString().slice(0, 10)}.json"`)
    return res.send(JSON.stringify(result, null, 2))
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Failed to create administrative export.' })
  }
}

export function installRecoveryRoutes(app) {
  installRecoveryObservers()
  if (installed) return
  installed = true
  app.get('/api/recovery/versions', requireAdminAuth, versionsHandler)
  app.get('/api/recovery/backups', requireAdminAuth, backupsHandler)
  app.post('/api/recovery/preview', requireAdminAuth, previewHandler)
  app.post('/api/recovery/actions', requireAdminAuth, actionHandler)
  app.get('/api/recovery/export', requireAdminAuth, exportHandler)
}
