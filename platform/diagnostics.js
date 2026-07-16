import { platformConfig, safeConfigSummary } from './config.js'

const startedAt = Date.now()

export const diagnostics = {
  lastStateReadAt: '',
  lastStateWriteAt: '',
  lastReconciliationAt: '',
  lastSuccessfulReadAt: '',
  lastSuccessfulWriteAt: '',
  lastErrorAt: '',
  lastError: null,
  lastReadDurationMs: null,
  lastWriteDurationMs: null,
  lastStateBytes: 0,
  currentStateRevision: 0,
  degradedReasons: [],
}

function timestamp() {
  return new Date().toISOString()
}

export function recordStateRead({ durationMs = 0, bytes = 0, success = true, error = null } = {}) {
  diagnostics.lastStateReadAt = timestamp()
  diagnostics.lastReadDurationMs = Number(durationMs || 0)
  diagnostics.lastStateBytes = Math.max(diagnostics.lastStateBytes, Number(bytes || 0))
  if (success) diagnostics.lastSuccessfulReadAt = diagnostics.lastStateReadAt
  else recordError(error || new Error('State read failed'))
}

export function recordStateWrite({ durationMs = 0, bytes = 0, success = true, revision = 0, error = null } = {}) {
  diagnostics.lastStateWriteAt = timestamp()
  diagnostics.lastWriteDurationMs = Number(durationMs || 0)
  diagnostics.lastStateBytes = Number(bytes || diagnostics.lastStateBytes || 0)
  diagnostics.currentStateRevision = Number(revision || diagnostics.currentStateRevision || 0)
  if (success) diagnostics.lastSuccessfulWriteAt = diagnostics.lastStateWriteAt
  else recordError(error || new Error('State write failed'))
}

export function recordReconciliation({ revision = 0 } = {}) {
  diagnostics.lastReconciliationAt = timestamp()
  diagnostics.currentStateRevision = Number(revision || diagnostics.currentStateRevision || 0)
}

export function recordError(error) {
  diagnostics.lastErrorAt = timestamp()
  diagnostics.lastError = {
    name: error?.name || 'Error',
    message: error?.message || 'Unknown error',
    code: error?.code || '',
  }
}

export function calculateStateMetrics(state = {}) {
  const pendingSchedules = Array.isArray(state.scheduledTransitions)
    ? state.scheduledTransitions.filter((item) => item?.status === 'pending').length
    : 0
  return {
    stateBytes: Buffer.byteLength(JSON.stringify(state || {})),
    builderCount: Array.isArray(state.builderPool) ? state.builderPool.length : 0,
    auditCount: Array.isArray(state.auditLog) ? state.auditLog.length : 0,
    pendingScheduleCount: pendingSchedules,
    recoveryRevision: Number(state.recoveryRevision || 0),
    closureRevision: Number(state.closureRevision || 0),
    scheduleRevision: Number(state.scheduleRevision || 0),
    stateRevision: Number(state.stateRevision || diagnostics.currentStateRevision || 0),
  }
}

export function diagnosticWarnings(state = {}) {
  const metrics = calculateStateMetrics(state)
  const warnings = []
  if (metrics.stateBytes >= platformConfig.stateWarningBytes) warnings.push('State object exceeds the configured recommended size.')
  if (Number(diagnostics.lastWriteDurationMs || 0) >= platformConfig.saveLatencyWarningMs) warnings.push('Last save latency exceeded the configured warning threshold.')
  return warnings
}

export function diagnosticsSnapshot(baseConfig = {}, state = {}, extras = {}) {
  const metrics = calculateStateMetrics(state)
  const warnings = diagnosticWarnings(state)
  const storageReady = Boolean(baseConfig.postgresConfigured)
  return {
    ok: warnings.length === 0 && storageReady,
    degraded: warnings.length > 0 || !storageReady,
    warnings,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    ...safeConfigSummary(baseConfig),
    runtime: { ...diagnostics },
    metrics,
    ...extras,
  }
}

export function sanitizedDiagnosticsText(snapshot) {
  return JSON.stringify(snapshot, null, 2)
}
