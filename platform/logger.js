import crypto from 'crypto'

const REDACT_KEYS = /authorization|cookie|password|secret|token|access.?key|session/i

function redact(value, seen = new WeakSet()) {
  if (value == null || typeof value !== 'object') return value
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  if (Array.isArray(value)) return value.map((item) => redact(item, seen))
  const output = {}
  for (const [key, item] of Object.entries(value)) {
    output[key] = REDACT_KEYS.test(key) ? '[REDACTED]' : redact(item, seen)
  }
  return output
}

export function logEvent(level, event, fields = {}, writer = console) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...redact(fields),
  }
  const line = JSON.stringify(entry)
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'
  writer[method]?.(line)
  return entry
}

export function requestContextMiddleware(req, res, next) {
  const requestId = String(req.headers['x-request-id'] || '').trim() || crypto.randomUUID()
  const startedAt = Date.now()
  req.requestId = requestId
  res.locals.requestId = requestId
  res.setHeader('x-request-id', requestId)

  res.on('finish', () => {
    logEvent(res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info', 'http_request', {
      requestId,
      method: req.method,
      path: req.path || req.url,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      actor: req.user?.username || '',
    })
  })
  next()
}

export function sanitizedError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || 'Unknown error',
    code: error?.code || '',
  }
}

export const __test = { redact }
