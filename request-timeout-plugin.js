const LEGACY_TIMEOUT = "const REQUEST_TIMEOUT_MS = 12000"
const LEGACY_FUNCTION = `async function requestWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}`

const UPDATED_TIMEOUTS = `const READ_REQUEST_TIMEOUT_MS = 12000
const MUTATION_REQUEST_TIMEOUT_MS = 60000`

const UPDATED_FUNCTION = `async function requestWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const method = String(options.method || 'GET').toUpperCase()
  const timeoutMs = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
    ? MUTATION_REQUEST_TIMEOUT_MS
    : READ_REQUEST_TIMEOUT_MS
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(method === 'GET'
        ? 'StaffBoard took too long to load. Retry shortly.'
        : 'StaffBoard is still saving this change. Check your connection and retry if it does not complete.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}`

export function injectMutationAwareTimeouts(code) {
  if (!code.includes(LEGACY_TIMEOUT) && code.includes(UPDATED_TIMEOUTS) && code.includes(UPDATED_FUNCTION)) return code
  if (!code.includes(LEGACY_TIMEOUT)) throw new Error('Request-timeout transform could not locate the legacy timeout constant.')
  if (!code.includes(LEGACY_FUNCTION)) throw new Error('Request-timeout transform could not locate requestWithTimeout.')

  const next = code
    .replace(LEGACY_TIMEOUT, UPDATED_TIMEOUTS)
    .replace(LEGACY_FUNCTION, UPDATED_FUNCTION)

  if (!next.includes('MUTATION_REQUEST_TIMEOUT_MS = 60000')) throw new Error('Mutation timeout was not installed.')
  if (!next.includes("['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)")) throw new Error('Mutation method detection was not installed.')
  return next
}

export function requestTimeoutPlugin() {
  return {
    name: 'staffboard-request-timeout',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/storageAdapter.js')) return null
      const next = injectMutationAwareTimeouts(code)
      return next === code ? null : { code: next, map: null }
    },
  }
}

export const __test = { injectMutationAwareTimeouts }
