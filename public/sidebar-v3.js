(() => {
  const STATE_KEY = 'staffing_board_redo_complete_v2_weekly'
  const MOBILE_QUERY = window.matchMedia('(max-width: 900px)')
  const DEFAULT_SECTIONS = { context: true, navigation: true, staffing: true, reports: false, administration: false }
  const ICONS = {
    board: '▦', analysis: '⌁', builders: '♙', manager: '◫', audit: '≡', tools: '⚙',
    suggestions: '✦', planner: '⌗', comments: '✎', default: '•',
  }

  let mobileOpen = false
  let activeUser = ''
  let prefs = { collapsed: false, sections: { ...DEFAULT_SECTIONS } }
  let syncTimer = null
  let syncing = false

  function safeState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch { return {} }
  }

  function username() {
    const value = document.querySelector('.sidebar-v3 .auth-section strong')?.textContent?.trim()
    return value || safeState().adminName || 'local-user'
  }

  function prefKey(user = username()) {
    return `staffboard.sidebar.v3.${String(user || 'local-user').toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`
  }

  function loadPrefs(user = username()) {
    try {
      const saved = JSON.parse(localStorage.getItem(prefKey(user)) || '{}')
      return {
        collapsed: !!saved.collapsed,
        sections: { ...DEFAULT_SECTIONS, ...(saved.sections || {}) },
      }
    } catch {
      return { collapsed: false, sections: { ...DEFAULT_SECTIONS } }
    }
  }

  function savePrefs() {
    try { localStorage.setItem(prefKey(activeUser || username()), JSON.stringify(prefs)) } catch {}
  }

  function isoWeek(dateValue) {
    const date = new Date(`${dateValue || new Date().toISOString().slice(0, 10)}T00:00:00`)
    if (Number.isNaN(date.getTime())) return '—'
    const target = new Date(date.valueOf())
    const day = (date.getDay() + 6) % 7
    target.setDate(target.getDate() - day + 3)
    const firstThursday = new Date(target.getFullYear(), 0, 4)
    const firstDay = (firstThursday.getDay() + 6) % 7
    firstThursday.setDate(firstThursday.getDate() - firstDay + 3)
    return String(1 + Math.round((target - firstThursday) / 604800000)).padStart(2, '0')
  }

  function boardName(boardId) {
    if (String(boardId || '').startsWith('speed_')) return 'SPEED'
    if (String(boardId || '').startsWith('fa_')) return 'FA Lab'
    if (String(boardId || '').startsWith('bodega_')) return 'Bodega'
    return 'StaffBoard'
  }

  function iconFor(label) {
    const value = String(label || '').toLowerCase()
    if (value.includes('analysis')) return ICONS.analysis
    if (value.includes('builder')) return ICONS.builders
    if (value.includes('manager')) return ICONS.manager
    if (value.includes('audit')) return ICONS.audit
    if (value.includes('tool')) return ICONS.tools
    if (value.includes('suggest')) return ICONS.suggestions
    if (value.includes('planner')) return ICONS.planner
    if (value.includes('comment')) return ICONS.comments
    if (value.includes('board')) return ICONS.board
    return ICONS.default
  }

  function normalizeLabel(value) {
    return String(value || '').replace(/\s+/g, ' ').trim()
  }

  function shell() { return document.querySelector('[data-staffboard-shell]') }
  function sidebar() { return document.querySelector('[data-sidebar-v3]') }
  function root() { return document.querySelector('[data-sidebar-enhancement-root]') }

  function buildRoot() {
    const mount = root()
    if (!mount || mount.dataset.sidebarBuilt === 'true') return
    mount.dataset.sidebarBuilt = 'true'
    mount.innerHTML = `
      <div class="sidebar-v3-context-shell">
        <div class="sidebar-v3-brand-row">
          <div class="sidebar-v3-brand-mark" aria-hidden="true">SB</div>
          <div class="sidebar-v3-brand-copy"><strong>StaffBoard</strong><span>Operations workspace</span></div>
          <button type="button" class="sidebar-v3-mobile-close" data-sidebar-mobile-close aria-label="Close navigation" title="Close navigation">×</button>
        </div>
        <div class="sidebar-v3-context-card" data-sidebar-context-card>
          <div><span class="sidebar-v3-context-label">Board</span><strong data-sidebar-board>—</strong></div>
          <div><span class="sidebar-v3-context-label">Shift</span><strong data-sidebar-shift>—</strong></div>
          <div><span class="sidebar-v3-context-label">Schedule</span><strong data-sidebar-week-day>—</strong></div>
          <div><span class="sidebar-v3-context-label">Admin</span><strong data-sidebar-admin>—</strong></div>
          <div class="sidebar-v3-status-row"><span data-sidebar-network-dot></span><span data-sidebar-network>—</span><span data-sidebar-sync>—</span></div>
        </div>
      </div>

      <div class="sidebar-v3-search-wrap">
        <label class="sr-only" for="sidebar-menu-search">Filter navigation and menu tools</label>
        <span aria-hidden="true">⌕</span>
        <input id="sidebar-menu-search" data-sidebar-search type="search" placeholder="Find a menu action…" autocomplete="off" />
        <button type="button" data-sidebar-clear-search aria-label="Clear menu search" title="Clear search">×</button>
      </div>

      <nav class="sidebar-v3-nav" aria-label="Primary StaffBoard navigation" data-sidebar-nav></nav>

      <div class="sidebar-v3-quick-actions" aria-label="Quick actions">
        <button type="button" data-quick-action="add-builder" title="Add Builder"><span aria-hidden="true">＋</span><span>Add Builder</span></button>
        <button type="button" data-quick-action="share-png" title="Share Staffing PNG"><span aria-hidden="true">▧</span><span>Share PNG</span></button>
        <button type="button" data-quick-action="slack" title="Copy Slack Summary"><span aria-hidden="true">#</span><span>Slack</span></button>
        <button type="button" data-quick-action="today" title="Go to Today"><span aria-hidden="true">◷</span><span>Today</span></button>
      </div>

      <section class="sidebar-v3-group" data-v3-group="reports">
        <button type="button" class="sidebar-v3-group-toggle" data-v3-group-toggle="reports" aria-expanded="false"><span><span aria-hidden="true">⇩</span> Reports & Exports</span><span class="sidebar-v3-chevron" aria-hidden="true">⌄</span></button>
        <div class="sidebar-v3-group-body">
          <button type="button" data-proxy-action="daily-pdf">Daily PDF</button>
          <button type="button" data-proxy-action="weekly-pdf">Weekly PDF</button>
          <button type="button" data-proxy-action="daily-excel">Daily Excel</button>
          <button type="button" data-proxy-action="weekly-excel">Weekly Excel</button>
          <button type="button" data-proxy-action="share-png">Share Staffing PNG</button>
          <button type="button" data-proxy-action="slack">Copy Slack Summary</button>
        </div>
      </section>

      <section class="sidebar-v3-group sidebar-v3-admin-group" data-v3-group="administration">
        <button type="button" class="sidebar-v3-group-toggle" data-v3-group-toggle="administration" aria-expanded="false"><span><span aria-hidden="true">⚙</span> Administration</span><span class="sidebar-v3-chevron" aria-hidden="true">⌄</span></button>
        <div class="sidebar-v3-group-body">
          <button type="button" data-proxy-action="clear-day">Clear Day</button>
          <button type="button" data-proxy-action="reset-week" class="sidebar-v3-danger">Reset Week</button>
          <button type="button" data-proxy-action="logout">Logout</button>
        </div>
      </section>
    `

    mount.querySelector('[data-sidebar-mobile-close]')?.addEventListener('click', closeMobile)
    mount.querySelector('[data-sidebar-search]')?.addEventListener('input', applySearch)
    mount.querySelector('[data-sidebar-clear-search]')?.addEventListener('click', () => {
      const input = mount.querySelector('[data-sidebar-search]')
      if (input) input.value = ''
      applySearch()
      input?.focus()
    })

    mount.querySelectorAll('[data-v3-group-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const group = button.dataset.v3GroupToggle
        prefs.sections[group] = !prefs.sections[group]
        savePrefs()
        syncCustomGroups()
      })
    })

    mount.querySelectorAll('[data-quick-action]').forEach((button) => button.addEventListener('click', () => runAction(button.dataset.quickAction)))
    mount.querySelectorAll('[data-proxy-action]').forEach((button) => button.addEventListener('click', () => runAction(button.dataset.proxyAction)))
  }

  function findOriginalButton(labels) {
    const wanted = labels.map((label) => label.toLowerCase())
    return Array.from(document.querySelectorAll('button')).find((button) => {
      if (button.closest('[data-sidebar-enhancement-root]') || button.matches('[data-sidebar-toggle]')) return false
      const text = normalizeLabel(button.textContent).toLowerCase()
      return wanted.some((label) => text === label || text.includes(label))
    })
  }

  function clickOriginal(labels) {
    const button = findOriginalButton(labels)
    if (!button) return false
    button.click()
    return true
  }

  function openSectionFor(element) {
    const section = element?.closest('.section')
    if (!section) return
    const key = section.dataset.sidebarSectionKey
    if (key) {
      prefs.sections[key] = true
      savePrefs()
      section.dataset.sidebarCollapsed = 'false'
      section.querySelector('h2')?.setAttribute('aria-expanded', 'true')
    }
  }

  function runAction(action) {
    if (action === 'add-builder') {
      const input = document.getElementById('newBuilderName')
      if (input) {
        openSectionFor(input)
        input.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => input.focus(), 200)
      } else {
        clickOriginal(['add builder'])
      }
    } else if (action === 'share-png') {
      if (window.StaffBoardSharePNG?.open) window.StaffBoardSharePNG.open()
      else clickOriginal(['share png', 'board png'])
    } else if (action === 'slack') {
      if (!clickOriginal(['copy daily summary', 'copy slack', 'slack summary'])) clickOriginal(['tools'])
    } else if (action === 'today') {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const current = days[new Date().getDay()]
      const target = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(current) ? current : 'Monday'
      clickOriginal([target])
    } else if (action === 'daily-pdf') clickOriginal(['daily pdf'])
    else if (action === 'weekly-pdf') clickOriginal(['weekly pdf'])
    else if (action === 'daily-excel') clickOriginal(['individual day excel', 'daily excel'])
    else if (action === 'weekly-excel') clickOriginal(['weekly excel'])
    else if (action === 'clear-day') clickOriginal(['clear day'])
    else if (action === 'reset-week') clickOriginal(['reset week'])
    else if (action === 'logout') clickOriginal(['logout'])

    if (MOBILE_QUERY.matches) closeMobile()
  }

  function syncContext() {
    const mount = root()
    if (!mount) return
    const state = safeState()
    const board = boardName(state.currentBoardId)
    const shift = state.boardShift || (String(state.currentBoardId || '').endsWith('_night') ? 'Night Shift' : 'Day Shift')
    const selectedDay = state.selectedDay || 'Monday'
    const week = isoWeek(state.weekStartDate)
    const admin = username()
    mount.querySelector('[data-sidebar-board]').textContent = board
    mount.querySelector('[data-sidebar-shift]').textContent = shift
    mount.querySelector('[data-sidebar-week-day]').textContent = `Week ${week} · ${selectedDay}`
    mount.querySelector('[data-sidebar-admin]').textContent = admin
    mount.querySelector('[data-sidebar-network]').textContent = navigator.onLine ? 'Online' : 'Offline'
    mount.querySelector('[data-sidebar-network-dot]')?.classList.toggle('offline', !navigator.onLine)
    mount.querySelector('[data-sidebar-sync]').textContent = state.updatedAt ? 'Saved' : 'Ready'
  }

  function originalNavButtons() {
    return Array.from(document.querySelectorAll('.main-top-tabs .nav-tab')).filter((button) => normalizeLabel(button.textContent))
  }

  function syncNavigation() {
    const nav = root()?.querySelector('[data-sidebar-nav]')
    if (!nav) return
    const originals = originalNavButtons()
    const labels = originals.map((button) => normalizeLabel(button.textContent))
    const signature = labels.join('|')
    if (nav.dataset.signature !== signature) {
      nav.dataset.signature = signature
      nav.innerHTML = ''
      labels.forEach((label) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'sidebar-v3-nav-item'
        button.dataset.sidebarNavLabel = label
        button.title = label
        button.innerHTML = `<span class="sidebar-v3-nav-icon" aria-hidden="true">${iconFor(label)}</span><span class="sidebar-v3-nav-label"></span><span class="sidebar-v3-active-dot" aria-hidden="true"></span>`
        button.querySelector('.sidebar-v3-nav-label').textContent = label
        button.addEventListener('click', () => {
          const original = originalNavButtons().find((item) => normalizeLabel(item.textContent) === label)
          original?.click()
          if (MOBILE_QUERY.matches) closeMobile()
          setTimeout(syncNavigation, 50)
        })
        nav.appendChild(button)
      })
    }

    const currentOriginals = originalNavButtons()
    nav.querySelectorAll('[data-sidebar-nav-label]').forEach((button) => {
      const original = currentOriginals.find((item) => normalizeLabel(item.textContent) === button.dataset.sidebarNavLabel)
      const active = !!original?.classList.contains('active')
      button.classList.toggle('active', active)
      if (active) button.setAttribute('aria-current', 'page')
      else button.removeAttribute('aria-current')
    })
  }

  function sectionGroup(title) {
    const text = title.toLowerCase()
    if (/export|report|snapshot/.test(text)) return 'reports'
    if (/storage|admin|reset|danger/.test(text)) return 'administration'
    if (/board header|week|day|goal|tph/.test(text)) return 'context'
    return 'staffing'
  }

  function sectionKey(title) {
    return `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
  }

  function syncSections() {
    const side = sidebar()
    if (!side) return
    side.querySelectorAll(':scope > .section').forEach((section) => {
      const heading = section.querySelector(':scope > h2')
      if (!heading) return
      const title = normalizeLabel(heading.textContent)
      const key = sectionKey(title)
      const group = sectionGroup(title)
      section.dataset.sidebarSectionKey = key
      section.dataset.sidebarSectionGroup = group
      heading.classList.add('sidebar-v3-section-heading')
      heading.setAttribute('role', 'button')
      heading.setAttribute('tabindex', '0')
      if (typeof prefs.sections[key] !== 'boolean') prefs.sections[key] = group === 'reports' || group === 'administration' ? false : true
      const open = !!prefs.sections[key]
      section.dataset.sidebarCollapsed = String(!open)
      heading.setAttribute('aria-expanded', String(open))
      heading.title = `${open ? 'Collapse' : 'Expand'} ${title}`
      if (heading.dataset.sidebarBound !== 'true') {
        heading.dataset.sidebarBound = 'true'
        const toggle = () => {
          const sectionId = section.dataset.sidebarSectionKey
          prefs.sections[sectionId] = !prefs.sections[sectionId]
          savePrefs()
          syncSections()
        }
        heading.addEventListener('click', toggle)
        heading.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            toggle()
          }
        })
      }
    })
  }

  function syncCustomGroups() {
    root()?.querySelectorAll('[data-v3-group]').forEach((group) => {
      const key = group.dataset.v3Group
      const open = !!prefs.sections[key]
      group.dataset.open = String(open)
      group.querySelector('[data-v3-group-toggle]')?.setAttribute('aria-expanded', String(open))
    })
  }

  function applySearch() {
    const mount = root()
    const side = sidebar()
    if (!mount || !side) return
    const query = normalizeLabel(mount.querySelector('[data-sidebar-search]')?.value).toLowerCase()
    mount.querySelectorAll('[data-sidebar-nav-label]').forEach((button) => {
      button.hidden = !!query && !button.dataset.sidebarNavLabel.toLowerCase().includes(query)
    })
    mount.querySelectorAll('[data-quick-action], [data-proxy-action]').forEach((button) => {
      button.hidden = !!query && !normalizeLabel(button.textContent).toLowerCase().includes(query)
    })
    side.querySelectorAll(':scope > .section').forEach((section) => {
      const heading = normalizeLabel(section.querySelector(':scope > h2')?.textContent).toLowerCase()
      section.hidden = !!query && !heading.includes(query)
    })
  }

  function closeMobile() {
    mobileOpen = false
    applyLayout()
  }

  function toggleSidebar() {
    if (MOBILE_QUERY.matches) mobileOpen = !mobileOpen
    else {
      prefs.collapsed = !prefs.collapsed
      savePrefs()
    }
    applyLayout()
  }

  function applyLayout() {
    const app = shell()
    const toggle = document.querySelector('[data-sidebar-toggle]')
    const backdrop = document.querySelector('[data-sidebar-backdrop]')
    if (!app || !toggle) return
    const mobile = MOBILE_QUERY.matches
    app.classList.toggle('sidebar-collapsed', !mobile && prefs.collapsed)
    app.classList.toggle('sidebar-expanded', !mobile && !prefs.collapsed)
    app.classList.toggle('sidebar-mobile-open', mobile && mobileOpen)
    document.body.classList.toggle('sidebar-drawer-open', mobile && mobileOpen)
    toggle.setAttribute('aria-expanded', String(mobile ? mobileOpen : !prefs.collapsed))
    toggle.setAttribute('aria-label', mobile ? (mobileOpen ? 'Close navigation' : 'Open navigation') : (prefs.collapsed ? 'Expand sidebar' : 'Collapse sidebar'))
    toggle.title = toggle.getAttribute('aria-label')
    const icon = toggle.querySelector('.sidebar-toggle-icon')
    if (icon) icon.textContent = mobile ? (mobileOpen ? '×' : '☰') : (prefs.collapsed ? '›' : '‹')
    backdrop?.setAttribute('aria-hidden', String(!(mobile && mobileOpen)))
  }

  function bindShellControls() {
    const toggle = document.querySelector('[data-sidebar-toggle]')
    if (toggle && toggle.dataset.sidebarBound !== 'true') {
      toggle.dataset.sidebarBound = 'true'
      toggle.addEventListener('click', toggleSidebar)
    }
    const backdrop = document.querySelector('[data-sidebar-backdrop]')
    if (backdrop && backdrop.dataset.sidebarBound !== 'true') {
      backdrop.dataset.sidebarBound = 'true'
      backdrop.addEventListener('click', closeMobile)
    }
  }

  function sync() {
    if (syncing) return
    syncing = true
    try {
      if (!shell() || !sidebar() || !root()) return
      const nextUser = username()
      if (activeUser !== nextUser) {
        activeUser = nextUser
        prefs = loadPrefs(nextUser)
      }
      buildRoot()
      bindShellControls()
      syncContext()
      syncNavigation()
      syncSections()
      syncCustomGroups()
      applyLayout()
      applySearch()
      document.body.classList.add('sidebar-v3-ready')
    } finally {
      syncing = false
    }
  }

  function scheduleSync() {
    clearTimeout(syncTimer)
    syncTimer = setTimeout(sync, 80)
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mobileOpen) closeMobile()
  })
  window.addEventListener('online', syncContext)
  window.addEventListener('offline', syncContext)
  MOBILE_QUERY.addEventListener?.('change', () => { mobileOpen = false; applyLayout() })
  document.addEventListener('DOMContentLoaded', scheduleSync)
  new MutationObserver(scheduleSync).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
  setInterval(sync, 1500)
  scheduleSync()
})()
