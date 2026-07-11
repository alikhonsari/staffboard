(() => {
  const STATE_KEY = 'staffing_board_redo_complete_v2_weekly'
  const SYSTEM_DARK = window.matchMedia('(prefers-color-scheme: dark)')
  const validTheme = (value) => value === 'dark' || value === 'light'
  const normalizeUser = (value) => String(value || 'local-user').toLowerCase().replace(/[^a-z0-9_-]+/g, '-')

  let activeUser = ''
  let activeTheme = ''
  let syncTimer = null

  function safeState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch { return {} }
  }

  function username() {
    const authName = document.querySelector('.sidebar-v3 .auth-section strong')?.textContent?.trim()
    const contextName = document.querySelector('[data-sidebar-admin]')?.textContent?.trim()
    return authName || contextName || safeState().adminName || 'local-user'
  }

  function keyFor(user = username()) {
    return `staffboard.theme.${normalizeUser(user)}`
  }

  function savedTheme(user = username()) {
    try {
      const saved = localStorage.getItem(keyFor(user))
      return validTheme(saved) ? saved : ''
    } catch { return '' }
  }

  function resolveTheme(user = username()) {
    const saved = savedTheme(user)
    if (saved) return saved

    const migrationKey = `${keyFor(user)}.legacy-migrated`
    try {
      const legacy = safeState().darkMode
      if (legacy === true && localStorage.getItem(migrationKey) !== 'true') {
        localStorage.setItem(keyFor(user), 'dark')
        localStorage.setItem(migrationKey, 'true')
        return 'dark'
      }
      localStorage.setItem(migrationKey, 'true')
    } catch {}

    return SYSTEM_DARK.matches ? 'dark' : 'light'
  }

  function themeMeta() {
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    return meta
  }

  function updateToggle() {
    const toggle = document.querySelector('[data-theme-toggle-v3]')
    if (!toggle) return
    const dark = activeTheme === 'dark'
    toggle.setAttribute('aria-pressed', String(dark))
    toggle.setAttribute('aria-label', dark ? 'Switch to Light Mode' : 'Switch to Dark Mode')
    toggle.title = toggle.getAttribute('aria-label')
    toggle.querySelector('[data-theme-icon]').textContent = dark ? '☀' : '☾'
    const label = toggle.querySelector('[data-theme-label]')
    if (label) label.textContent = dark ? 'Light' : 'Dark'
  }

  function hideLegacyToggles() {
    const exactLabels = new Set([
      'dark mode', 'light mode', 'switch to dark mode', 'switch to light mode',
      'enable dark mode', 'disable dark mode', 'night mode',
    ])
    document.querySelectorAll('button').forEach((button) => {
      if (button.matches('[data-theme-toggle-v3]')) return
      const text = String(button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
      if (exactLabels.has(text)) {
        button.hidden = true
        button.dataset.legacyThemeToggleHidden = 'true'
        button.setAttribute('aria-hidden', 'true')
        button.tabIndex = -1
      }
    })
  }

  function applyTheme(theme, options = {}) {
    const next = validTheme(theme) ? theme : 'light'
    const user = options.user || activeUser || username()
    const changed = activeTheme !== next
    activeTheme = next

    document.documentElement.dataset.theme = next
    document.documentElement.style.colorScheme = next
    if (document.body) {
      document.body.dataset.theme = next
      document.body.classList.toggle('theme-dark-v3', next === 'dark')
    }
    document.querySelector('[data-staffboard-shell]')?.classList.toggle('dark', next === 'dark')
    themeMeta().content = next === 'dark' ? '#111c2d' : '#eef3f8'

    try {
      localStorage.setItem('staffboard.theme.last-user', user)
      localStorage.setItem('staffboard.theme.preload', next)
      if (options.persist) localStorage.setItem(keyFor(user), next)
    } catch {}

    updateToggle()
    if (changed || options.forceEvent) {
      window.dispatchEvent(new CustomEvent('staffboard:theme-change', { detail: { theme: next, user } }))
    }
  }

  function ensureToggle() {
    const brandRow = document.querySelector('.sidebar-v3-brand-row')
    if (!brandRow || brandRow.querySelector('[data-theme-toggle-v3]')) return

    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'theme-toggle-v3'
    toggle.dataset.themeToggleV3 = 'true'
    toggle.innerHTML = '<span data-theme-icon aria-hidden="true">☾</span><span data-theme-label>Dark</span>'
    toggle.addEventListener('click', () => {
      const next = activeTheme === 'dark' ? 'light' : 'dark'
      applyTheme(next, { persist: true, forceEvent: true })
    })

    const mobileClose = brandRow.querySelector('[data-sidebar-mobile-close]')
    brandRow.insertBefore(toggle, mobileClose || null)
    updateToggle()
  }

  function sync() {
    const nextUser = username()
    if (activeUser !== nextUser) {
      activeUser = nextUser
      applyTheme(resolveTheme(nextUser), { user: nextUser, forceEvent: true })
    } else if (!activeTheme) {
      applyTheme(resolveTheme(nextUser), { user: nextUser, forceEvent: true })
    }
    ensureToggle()
    hideLegacyToggles()
    updateToggle()
  }

  function scheduleSync() {
    clearTimeout(syncTimer)
    syncTimer = setTimeout(sync, 80)
  }

  SYSTEM_DARK.addEventListener?.('change', () => {
    if (!savedTheme(activeUser || username())) applyTheme(SYSTEM_DARK.matches ? 'dark' : 'light', { forceEvent: true })
  })
  document.addEventListener('DOMContentLoaded', scheduleSync)
  new MutationObserver(scheduleSync).observe(document.documentElement, { childList: true, subtree: true })
  setInterval(sync, 1500)
  scheduleSync()
})()
