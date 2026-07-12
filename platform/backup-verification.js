import crypto from 'crypto'
import { validateBackupEnvelope } from './validation.js'

export function checksumBackup(envelope) {
  return crypto.createHash('sha256').update(JSON.stringify(envelope)).digest('hex')
}

export function verifyBackupEnvelope(envelope, context = {}) {
  const validation = validateBackupEnvelope(envelope)
  const sizeBytes = Buffer.byteLength(JSON.stringify(envelope || {}))
  const checksum = checksumBackup(envelope || {})
  const metadata = envelope?.metadata || {}
  const state = envelope?.state || {}
  const warnings = []

  if (!metadata.stateRevision && !state.stateRevision && !state.updatedAt) warnings.push('Backup does not contain a numeric or timestamp state revision.')
  if (!Array.isArray(state.builderPool)) warnings.push('Backup does not contain a Builder Master List array.')
  if (!state.weeklyData || typeof state.weeklyData !== 'object') warnings.push('Backup does not contain active weekly data.')

  return {
    valid: validation.ok,
    status: validation.ok ? (warnings.length ? 'valid_with_warnings' : 'valid') : 'invalid',
    backupId: metadata.id || context.backupId || '',
    checksum,
    sizeBytes,
    stateRevision: Number(state.stateRevision || 0),
    legacyRevision: metadata.stateRevision || state.updatedAt || '',
    createdAt: metadata.createdAt || '',
    verifiedAt: new Date().toISOString(),
    verifiedBy: context.actor || 'System',
    issues: validation.issues,
    warnings,
  }
}

export function assertBackupVerified(result) {
  if (!result?.valid) {
    const error = new Error('Backup failed schema verification.')
    error.code = 'BACKUP_VERIFICATION_FAILED'
    error.details = { issues: result?.issues || [] }
    throw error
  }
  return result
}
