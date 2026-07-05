(() => {
  const ID = 'staffboard-app-guard'
  const STYLE_ID = 'staffboard-app-guard-style'
  const TOKEN_KEYS = ['staffboard2_token', 'staffboard_shared_auth_token']
  let latestHealth = null

  function token() {
    for (const key of TOKEN_KEYS) {
      const value = localStorage.getItem(key)
      if (value) return value
    }
    return ''
  }

  function loadScriptOnce(src, marker) {
    if (document.querySelector(`[${marker}]`)) return
    const script = document.createElement('script')
    script.src = src
    script.setAttribute(marker, 'true')
    document.body.appendChild(script)
  }

  function addEnhancementFiles() {
    if (!document.querySelector('[data-layout-v2-file]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = '/app-layout-v2.css'
      link.dataset.layoutV2File = 'true'
      document.head.appendChild(link)
    }
    loadScriptOnce('/clock-status-auto.js?v=1', 'data-clock-status-auto-file')
  }

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      .app-guard{position:fixed;right:14px;bottom:14px;z-index:99980;display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:999px;background:rgba(255,255,255,.92);border:1px solid #d8e1ec;box-shadow:0 12px 30px rgba(15,23,42,.16);font:700 12px Inter,Arial,sans-serif;color:#172033;backdrop-filter:blur(10px)}
      .app-guard-dot{width:9px;height:9px;border-radius:999px;background:#f59e0b}.app-guard.ok .app-guard-dot{background:#10b981}.app-guard.warn .app-guard-dot{background:#f59e0b}.app-guard.bad .app-guard-dot{background:#ef4444}.app-guard button{width:auto;border:0;background:#eef4fa;border-radius:999px;padding:4px 8px;font-weight:900;cursor:pointer;color:#172033}
      .app-toast{position:fixed;right:14px;bottom:62px;z-index:99981;max-width:420px;padding:12px 14px;border-radius:14px;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;box-shadow:0 12px 30px rgba(15,23,42,.18);font:700 13px Inter,Arial,sans-serif}
      body[data-theme="dark"] .app-guard{background:rgba(35,52,78,.92);border-color:#536986;color:#f4f8ff}body[data-theme="dark"] .app-guard button{background:#344963;color:#f4f8ff}body[data-theme="dark"] .app-toast{background:#59272d;color:#ffd8d5;border-color:#9a4650}
      @media(max-width:720px){.app-guard{left:10px;right:10px;justify-content:center}.app-toast{left:10px;right:10px;max-width:none}}
    `
    document.head.appendChild(style)
  }

  function render(status = 'warn', text = 'Checking app…') {
    addStyle()
    let el = document.getElementById(ID)
    if (!el) {
      el = document.createElement('div')
      el.id = ID
      document.body.appendChild(el)
    }
    el.className = `app-guard ${status}`
    el.innerHTML = `<span class="app-guard-dot"></span><span>${text}</span><button type="button" data-health>Check</button>`
    el.querySelector('[data-health]').onclick = check
  }

  function toast(message) {
    addStyle()
    document.querySelectorAll('.app-toast').forEach((x) => x.remove())
    const el = document.createElement('div')
    el.className = 'app-toast'
    el.textContent = message
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 7000)
  }

  async function check() {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' })
      latestHealth = await res.json()
      const authOk = !!latestHealth.authConfigured
      const spacesOk = !!latestHealth.spacesConfigured
      if (authOk && spacesOk && token()) return render('ok', 'Shared save ready')
      if (authOk && spacesOk) return render('warn', 'Login needed for shared save')
      return render('bad', 'Server env missing')
    } catch {
      render('bad', 'Health check failed')
    }
  }

  window.addEventListener('error', (event) => {
    toast(`App error: ${event.message || 'Unknown error'}`)
  })

  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message || String(event.reason || 'Unknown promise error')
    if (/Failed to load history/i.test(msg)) return
    toast(`App warning: ${msg}`)
  })

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check()
  })

  addEnhancementFiles()
  setInterval(check, 60000)
  check()
})()
