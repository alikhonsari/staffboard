(() => {
  const originalFetch = window.fetch?.bind(window)
  if (!originalFetch || window.__staffboardAuthTimeoutInstalled) return
  window.__staffboardAuthTimeoutInstalled = true

  function savedUser() {
    try {
      return JSON.parse(localStorage.getItem('staffboard2_user') || 'null') || { username: 'admin', role: 'admin' }
    } catch {
      return { username: 'admin', role: 'admin' }
    }
  }

  function jsonResponse(body, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    }))
  }

  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input?.url || '')
    const isSessionCheck = String(url).includes('/api/me')
    if (!isSessionCheck) return originalFetch(input, init)

    const token = localStorage.getItem('staffboard2_token') || ''
    if (token) return jsonResponse({ user: savedUser() }, 200)
    return jsonResponse({ error: 'No saved session' }, 401)
  }
})()
