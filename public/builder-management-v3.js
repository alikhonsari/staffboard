(() => {
  const STATE_KEY = 'staffing_board_redo_complete_v2_weekly'
  let currentView = 'today'
  let lastSignature = ''

  function state() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch { return {} }
  }

  function label(button) {
    return String(button?.dataset?.sidebarNavLabel || button?.textContent || '').replace(/\s+/g, ' ').trim()
  }

  function buildersNav() {
    return Array.from(document.querySelectorAll('[data-sidebar-nav-label]')).find((button) => label(button).toLowerCase().includes('builders'))
  }

  function selectedDayCount(snapshot) {
    const day = snapshot.selectedDay || 'Monday'
    return Object.keys(snapshot.weeklyData?.[day]?.assignments || {}).length
  }

  function openBuilders(view = 'today', command = '') {
    const nav = buildersNav()
    nav?.click()
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('staffboard:builder-view', { detail: { view } }))
      if (command) window.dispatchEvent(new CustomEvent('staffboard:builder-command', { detail: { command, view } }))
    }, 70)
  }

  function syncShortcuts() {
    const nav = buildersNav()
    if (!nav) return
    const snapshot = state()
    const count = selectedDayCount(snapshot)
    let badge = nav.querySelector('.builder-nav-count')
    if (!badge) {
      badge = document.createElement('span')
      badge.className = 'builder-nav-count'
      badge.setAttribute('aria-label', 'Builders on selected day')
      nav.appendChild(badge)
    }
    badge.textContent = String(count)
    nav.title = `Builders · ${count} on ${snapshot.selectedDay || 'selected day'} · ${currentView}`

    const sidebarNav = nav.parentElement
    if (!sidebarNav) return
    let shortcuts = sidebarNav.querySelector('.builder-sidebar-shortcuts')
    if (!shortcuts) {
      shortcuts = document.createElement('div')
      shortcuts.className = 'builder-sidebar-shortcuts'
      shortcuts.setAttribute('aria-label', 'Builder workspace shortcuts')
      ;[
        ['today', 'Today'],
        ['master', 'Master'],
        ['lists', 'Lists'],
        ['groups', 'Groups'],
        ['archived', 'Archived'],
      ].forEach(([view, text]) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.dataset.builderShortcut = view
        button.textContent = text
        button.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          openBuilders(view)
          if (window.matchMedia('(max-width: 900px)').matches) {
            document.querySelector('[data-sidebar-mobile-close]')?.click()
          }
        })
        shortcuts.appendChild(button)
      })
      nav.insertAdjacentElement('afterend', shortcuts)
    }
    shortcuts.querySelectorAll('[data-builder-shortcut]').forEach((button) => button.classList.toggle('active', button.dataset.builderShortcut === currentView))
  }

  function syncSearchResults() {
    const input = document.querySelector('[data-sidebar-search]')
    const wrap = input?.closest('.sidebar-v3-search-wrap')
    if (!input || !wrap) return
    const query = String(input.value || '').trim().toLowerCase()
    let results = wrap.parentElement?.querySelector('.builder-command-results')
    const profiles = (state().builderPool || []).filter((profile) => !profile.isArchived)
    const matches = query.length >= 2 ? profiles.filter((profile) => {
      const skills = [profile.trainedTdr && 'tdr', profile.trainedForklift && 'forklift', profile.trainedCenterRider && 'center rider', profile.trainedClampTruck && 'clamp truck', profile.trainedRackMover && 'rack mover', profile.trainedReachTruck && 'reach truck', profile.isLineLead && 'line lead', profile.isTrainer && 'trainer', profile.isSafetyMember && 'safety'].filter(Boolean)
      return [profile.name, profile.employeeId, profile.badgeType, profile.defaultShift, ...skills].join(' ').toLowerCase().includes(query)
    }).slice(0, 5) : []

    const signature = `${query}|${matches.map((profile) => profile.id).join(',')}`
    if (signature === lastSignature) return
    lastSignature = signature
    if (!matches.length) {
      results?.remove()
      return
    }
    if (!results) {
      results = document.createElement('div')
      results.className = 'builder-command-results'
      wrap.insertAdjacentElement('afterend', results)
    }
    results.innerHTML = ''
    const heading = document.createElement('div')
    heading.className = 'builder-command-heading'
    heading.textContent = 'Builder results'
    results.appendChild(heading)
    matches.forEach((profile) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.innerHTML = `<strong></strong><small></small>`
      button.querySelector('strong').textContent = profile.name
      button.querySelector('small').textContent = [profile.employeeId, profile.badgeType, profile.defaultShift].filter(Boolean).join(' · ') || 'Active builder'
      button.addEventListener('click', () => {
        openBuilders('master')
        setTimeout(() => window.dispatchEvent(new CustomEvent('staffboard:builder-command', { detail: { command: 'search', query: profile.name, builderId: profile.id } })), 100)
      })
      results.appendChild(button)
    })
  }

  function sync() {
    syncShortcuts()
    syncSearchResults()
  }

  document.addEventListener('click', (event) => {
    const quickAdd = event.target.closest('[data-quick-action="add-builder"]')
    if (quickAdd) {
      event.preventDefault()
      event.stopImmediatePropagation()
      openBuilders('master', 'add')
    }
  }, true)

  document.addEventListener('input', (event) => {
    if (event.target.matches('[data-sidebar-search]')) setTimeout(syncSearchResults, 0)
  })

  window.addEventListener('staffboard:builder-view-changed', (event) => {
    currentView = event?.detail?.view || 'today'
    syncShortcuts()
  })
  window.addEventListener('storage', sync)
  document.addEventListener('DOMContentLoaded', sync)
  setInterval(sync, 1500)
  sync()
})()
