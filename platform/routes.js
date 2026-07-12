import { platformConfig, safeConfigSummary, validateEnvironment } from './config.js'
import { diagnosticsSnapshot, recordError, recordStateRead } from './diagnostics.js'
import { sendPlatformError, errors } from './errors.js'
import { logEvent, requestContextMiddleware } from './logger.js'
import { requirePermission } from './permissions.js'
import { verifyBackupEnvelope } from './backup-verification.js'

let installed = false

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Readiness check timed out.')), timeoutMs)),
  ])
}

function countBackups(payload) {
  return Array.isArray(payload?.backups) ? payload.backups.length : 0
}

export function installPlatformRoutes(app, methods, dependencies) {
  if (installed) return
  installed = true
  const { get, post, use } = methods
  const {
    config, runtime, getObjectJson, putObjectJson, requireAdminAuth,
    recoveryKeys, loadBackup,
  } = dependencies

  use.call(app, requestContextMiddleware)

  get.call(app, '/api/health/live', (req, res) => {
    res.json({ ok: true, status: 'live', uptimeSeconds: Math.floor(process.uptime()) })
  })

  get.call(app, '/api/health/ready', async (req, res) => {
    const environment = validateEnvironment(config)
    if (!environment.ok || !config.spacesConfigured) {
      return res.status(503).json({ ok: false, status: 'not_ready', errors: environment.errors, warnings: environment.warnings, requestId: req.requestId })
    }
    const started = Date.now()
    try {
      const payload = await withTimeout(getObjectJson(config.key, { state: {}, updatedAt: '', stateRevision: 0 }), platformConfig.readinessTimeoutMs)
      recordStateRead({ durationMs: Date.now() - started, bytes: Buffer.byteLength(JSON.stringify(payload || {})), success: true })
      return res.json({ ok: true, status: 'ready', stateRevision: Number(payload?.stateRevision || payload?.state?.stateRevision || 0), updatedAt: payload?.updatedAt || '', requestId: req.requestId })
    } catch (error) {
      recordStateRead({ durationMs: Date.now() - started, success: false, error })
      logEvent('error', 'readiness_failed', { requestId: req.requestId, error: error.message })
      return res.status(503).json({ ok: false, status: 'not_ready', error: 'Storage readiness check failed.', requestId: req.requestId })
    }
  })

  get.call(app, '/api/health', async (req, res) => {
    let state = {}
    let backupCount = 0
    try {
      const [payload, backupIndex] = await Promise.all([
        config.spacesConfigured ? getObjectJson(config.key, { state: {} }) : Promise.resolve({ state: {} }),
        config.spacesConfigured ? getObjectJson(recoveryKeys.backupIndex, { backups: [] }) : Promise.resolve({ backups: [] }),
      ])
      state = payload?.state || {}
      backupCount = countBackups(backupIndex)
    } catch (error) {
      recordError(error)
    }
    const snapshot = diagnosticsSnapshot(config, state, {
      backupCount,
      queueActive: Boolean(runtime.queue),
      scheduleTimerActive: Boolean(runtime.scheduleTimer),
      fallbackTimerActive: Boolean(runtime.fallbackTimer),
    })
    res.status(snapshot.degraded ? 200 : 200).json(snapshot)
  })

  get.call(app, '/api/platform/diagnostics', requireAdminAuth, requirePermission('diagnostics:view'), async (req, res) => {
    try {
      const [payload, versionPayload, backupIndex] = await Promise.all([
        getObjectJson(config.key, { state: {}, updatedAt: '', stateRevision: 0 }),
        getObjectJson(recoveryKeys.versions, { versions: [] }),
        getObjectJson(recoveryKeys.backupIndex, { backups: [] }),
      ])
      const snapshot = diagnosticsSnapshot(config, payload.state || {}, {
        updatedAt: payload.updatedAt || '',
        updatedBy: payload.updatedBy || '',
        versionCount: Array.isArray(versionPayload.versions) ? versionPayload.versions.length : 0,
        backupCount: countBackups(backupIndex),
        queueActive: Boolean(runtime.queue),
        scheduleTimerActive: Boolean(runtime.scheduleTimer),
        fallbackTimerActive: Boolean(runtime.fallbackTimer),
        requestId: req.requestId,
      })
      return res.json(snapshot)
    } catch (error) {
      recordError(error)
      return sendPlatformError(res, errors.storage('Unable to load platform diagnostics.'), req.requestId)
    }
  })

  post.call(app, '/api/platform/backups/verify', requireAdminAuth, requirePermission('backup:create'), async (req, res) => {
    try {
      const backupId = String(req.body?.backupId || '').trim()
      if (!backupId) throw errors.invalid('Choose a backup to verify.', { path: 'backupId' })
      const envelope = await loadBackup(backupId)
      if (!envelope) throw errors.invalid('Backup was not found.', { backupId })
      const result = verifyBackupEnvelope(envelope, { backupId, actor: req.user?.username || 'System' })

      const indexPayload = await getObjectJson(recoveryKeys.backupIndex, { backups: [] })
      const backups = (Array.isArray(indexPayload.backups) ? indexPayload.backups : []).map((item) => item.id === backupId ? { ...item, verification: result } : item)
      await putObjectJson(recoveryKeys.backupIndex, { ...indexPayload, backups, updatedAt: new Date().toISOString() })

      logEvent(result.valid ? 'info' : 'warn', 'backup_verified', {
        requestId: req.requestId,
        actor: req.user?.username || '',
        backupId,
        valid: result.valid,
        checksum: result.checksum,
        sizeBytes: result.sizeBytes,
      })
      return res.status(result.valid ? 200 : 422).json({ result, requestId: req.requestId })
    } catch (error) {
      recordError(error)
      return sendPlatformError(res, error, req.requestId)
    }
  })

  get.call(app, '/api/platform/config', requireAdminAuth, requirePermission('diagnostics:view'), (req, res) => {
    res.json({ ...safeConfigSummary(config), environmentValidation: validateEnvironment(config), requestId: req.requestId })
  })
}
