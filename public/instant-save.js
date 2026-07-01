(() => {
  const STATE_KEY = 'staffing_board_redo_complete_v2_weekly'
  const TOKEN_KEYS = ['staffboard2_token', 'staffboard_shared_auth_token']
  let lastSent = ''
  let timer = null
  let saving = false
  let queued = false

  function token() {
    for (const key of TOKEN_KEYS) {
      const value = localStorage.getItem(key)
      if (value) return value
    }
    return ''
  }

  function readRawState() {
    return localStorage.getItem(STATE_KEY) || ''
  }

  function parseState(raw) {
    try { return JSON.parse(raw) } catch { return null }
  }

  function headers() {
    const t = token()
    return t ? { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` } : { 'Content-Type': 'application/json' }
  }

  async function saveNow() {
    const raw = readRawState()
    const t = token()
    if (!raw || !t || raw === lastSent) return
    const state = parseState(raw)
    if (!state) return

    if (saving) {
      queued = true
      return
    }

    saving = true
    lastSent = raw
    try {
      const res = await fetch('/api/state', {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ state }),
      })
      if (!res.ok) throw new Error(`Save failed ${res.status}`)
      window.dispatchEvent(new CustomEvent('staffboard:instant-save-ok'))
    } catch (err) {
      lastSent = ''
      console.warn('Instant StaffBoard save failed:', err?.message || err)
    } finally {
      saving = false
      if (queued) {
        queued = false
        schedule(150)
      }
    }
  }

  function schedule(delay = 350) {
    clearTimeout(timer)
    timer = setTimeout(saveNow, delay)
  }

  function saveBeforeUnload() {
    const raw = readRawState()
    const t = token()
    if (!raw || !t || raw === lastSent) return
    const state = parseState(raw)
    if (!state) return
    try {
      fetch('/api/state', {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ state }),
        keepalive: true,
      })
    } catch {}
  }

  // Do not push stale local storage on initial page load. Only push after user activity.
  setTimeout(() => { lastSent = readRawState() }, 1500)
  document.addEventListener('input', () => schedule(350), true)
  document.addEventListener('change', () => schedule(350), true)
  document.addEventListener('click', (event) => {
    if (event.target?.closest?.('button,select,input,textarea')) schedule(600)
  }, true)
  window.addEventListener('beforeunload', saveBeforeUnload)
})()
