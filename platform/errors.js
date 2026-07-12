export class PlatformError extends Error {
  constructor(code, message, options = {}) {
    super(message)
    this.name = 'PlatformError'
    this.code = code || 'INTERNAL_ERROR'
    this.status = Number(options.status || 500)
    this.retryable = Boolean(options.retryable)
    this.details = options.details && typeof options.details === 'object' ? options.details : {}
    this.cause = options.cause
  }
}

export function normalizeError(error, fallback = {}) {
  if (error instanceof PlatformError) return error
  const message = error?.message || fallback.message || 'Unexpected server error.'
  return new PlatformError(fallback.code || 'INTERNAL_ERROR', message, {
    status: fallback.status || 500,
    retryable: fallback.retryable ?? false,
    details: fallback.details || {},
    cause: error,
  })
}

export function errorPayload(error, requestId = '') {
  const normalized = normalizeError(error)
  return {
    error: normalized.message,
    errorDetail: {
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
      details: normalized.details,
      requestId: requestId || null,
    },
    requestId: requestId || null,
  }
}

export function sendPlatformError(res, error, requestId = '') {
  const normalized = normalizeError(error)
  return res.status(normalized.status).json(errorPayload(normalized, requestId || res.locals?.requestId || ''))
}

export const errors = {
  unauthorized: (message = 'Unauthorized') => new PlatformError('AUTHENTICATION_REQUIRED', message, { status: 401 }),
  forbidden: (permission) => new PlatformError('PERMISSION_DENIED', 'You do not have permission to perform this action.', { status: 403, details: { permission } }),
  invalid: (message, details = {}) => new PlatformError('VALIDATION_FAILED', message, { status: 400, details }),
  conflict: (message, details = {}) => new PlatformError('STATE_REVISION_CONFLICT', message, { status: 409, retryable: true, details }),
  storage: (message = 'Storage is temporarily unavailable.') => new PlatformError('STORAGE_UNAVAILABLE', message, { status: 503, retryable: true }),
  backup: (message, details = {}) => new PlatformError('BACKUP_VERIFICATION_FAILED', message, { status: 422, details }),
}
