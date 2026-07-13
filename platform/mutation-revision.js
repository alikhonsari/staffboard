const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key)

export function evaluateMutationRevision(body = {}, payload = {}) {
  const hasRevision = hasOwn(body, 'baseStateRevision')
  const hasTimestamp = hasOwn(body, 'baseUpdatedAt')
  const currentRevision = Number(payload.stateRevision || payload.state?.stateRevision || 0)
  const currentUpdatedAt = String(payload.updatedAt || payload.state?.updatedAt || '')
  const baseRevision = Number(body.baseStateRevision || 0)
  const baseUpdatedAt = String(body.baseUpdatedAt || '')

  if (!hasRevision && !hasTimestamp) {
    return {
      ok: false,
      reason: 'missing',
      message: 'This browser session is outdated. Reload the latest board before changing operational-day status.',
      currentRevision,
      currentUpdatedAt,
    }
  }

  if (hasRevision && baseRevision !== currentRevision) {
    return {
      ok: false,
      reason: 'revision',
      message: 'The board changed in another session. The latest board must be loaded before changing operational-day status.',
      currentRevision,
      currentUpdatedAt,
    }
  }

  if (!hasRevision && hasTimestamp && baseUpdatedAt !== currentUpdatedAt) {
    return {
      ok: false,
      reason: 'timestamp',
      message: 'The board changed in another session. The latest board must be loaded before changing operational-day status.',
      currentRevision,
      currentUpdatedAt,
    }
  }

  return {
    ok: true,
    reason: '',
    message: '',
    currentRevision,
    currentUpdatedAt,
  }
}
