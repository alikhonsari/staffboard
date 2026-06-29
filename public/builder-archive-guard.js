(() => {
  const STATE_KEY = 'staffing_board_redo_complete_v2_weekly'
  const SNAPSHOT_KEY = 'staffboard_builder_archive_previous_state_v1'
  const TOKEN_KEYS = ['staffboard2_token', 'staffboard_shared_auth_token']
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const STAFFED = new Set(['Present', 'Training', 'Indirect'])
  let saving = false
  let saveTimer = null

  function readState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch { return {} }
  }

  function readSnapshot() {
    try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '{}') } catch { return {} }
  }

  function token() {
    for (const key of TOKEN_KEYS) {
      const value = localStorage.getItem(key)
      if (value) return value
    }
    return ''
  }

  function writeState(state, remote = true) {
    state.updatedAt = new Date().toLocaleString()
    localStorage.setItem(STATE_KEY, JSON.stringify(state))
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(state))
    window.dispatchEvent(new Event('staffboard-builder-archive-updated'))
    window.dispatchEvent(new Event('staffboard-builder-enhancements-updated'))
    if (remote) scheduleRemoteSave(state)
  }

  function scheduleRemoteSave(state) {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      const auth = token()
      if (!auth) return
      try {
        await fetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
          body: JSON.stringify({ state }),
        })
      } catch (err) {
        console.warn('Archived builder save failed', err)
      }
    }, 700)
  }

  function normalizeBuilders(state) {
    if (!Array.isArray(state.builderPool)) state.builderPool = []
    if (!state.archivedBuilders || typeof state.archivedBuilders !== 'object') state.archivedBuilders = {}
    return state
  }

  function activeBuilders(state) {
    return (state.builderPool || []).filter((b) => !b.isArchived)
  }

  function archivedProfiles(state) {
    const fromPool = (state.builderPool || []).filter((b) => b.isArchived)
    const fromMap = Object.values(state.archivedBuilders || {})
    const byId = new Map()
    ;[...fromMap, ...fromPool].forEach((b) => {
      if (b?.id) byId.set(b.id, { ...b, isArchived: true })
    })
    return Array.from(byId.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  }

  function preserveAssignments(prev, next, builderId) {
    if (!prev || !next) return
    if (!next.weeklyData) next.weeklyData = {}
    DAYS.forEach((day) => {
      const prevDay = prev.weeklyData?.[day]
      if (!prevDay?.assignments?.[builderId]) return
      if (!next.weeklyData[day]) next.weeklyData[day] = { ...prevDay, assignments: {} }
      next.weeklyData[day] = {
        ...next.weeklyData[day],
        assignments: {
          ...(next.weeklyData[day].assignments || {}),
          [builderId]: (next.weeklyData[day].assignments || {})[builderId] || prevDay.assignments[builderId],
        },
      }
    })

    if (!next.weeklyBoards) next.weeklyBoards = {}
    Object.entries(prev.weeklyBoards || {}).forEach(([week, weekData]) => {
      if (!next.weeklyBoards[week]) next.weeklyBoards[week] = weekData
      DAYS.forEach((day) => {
        const oldAssignment = weekData?.[day]?.assignments?.[builderId]
        if (!oldAssignment) return
        if (!next.weeklyBoards[week][day]) next.weeklyBoards[week][day] = { ...weekData[day], assignments: {} }
        next.weeklyBoards[week][day] = {
          ...next.weeklyBoards[week][day],
          assignments: {
            ...(next.weeklyBoards[week][day].assignments || {}),
            [builderId]: (next.weeklyBoards[week][day].assignments || {})[builderId] || oldAssignment,
          },
        }
      })
    })
  }

  function removeFromActiveGroups(state, builderId) {
    state.builderGroups = (state.builderGroups || []).map((group) => ({
      ...group,
      builderIds: (group.builderIds || []).filter((id) => id !== builderId),
    }))
  }

  function archiveBuilder(state, builderId, profile, prevState) {
    normalizeBuilders(state)
    const archived = {
      ...profile,
      id: builderId,
      isArchived: true,
      active: false,
      archivedAt: profile.archivedAt || new Date().toISOString(),
    }
    state.archivedBuilders[builderId] = archived
    if (!state.builderPool.some((b) => b.id === builderId)) state.builderPool.push(archived)
    state.builderPool = state.builderPool.map((b) => b.id === builderId ? { ...b, ...archived } : b)
    removeFromActiveGroups(state, builderId)
    preserveAssignments(prevState || readSnapshot(), state, builderId)
  }

  function reactivateBuilder(builderId) {
    const state = normalizeBuilders(readState())
    const profile = state.archivedBuilders[builderId] || state.builderPool.find((b) => b.id === builderId)
    if (!profile) return
    delete state.archivedBuilders[builderId]
    state.builderPool = state.builderPool.map((b) => b.id === builderId ? { ...b, isArchived: false, active: true, reactivatedAt: new Date().toISOString() } : b)
    writeState(state)
    tick()
  }

  function detectRemovedBuilders() {
    if (saving) return
    const previous = normalizeBuilders(readSnapshot())
    const current = normalizeBuilders(readState())
    const previousPool = previous.builderPool || []
    const currentIds = new Set((current.builderPool || []).map((b) => b.id))
    const removed = previousPool.filter((b) => b?.id && !b.isArchived && !currentIds.has(b.id))

    Object.values(current.archivedBuilders || {}).forEach((archived) => {
      if (archived?.id && !current.builderPool.some((b) => b.id === archived.id)) {
        current.builderPool.push({ ...archived, isArchived: true, active: false })
      }
    })

    if (removed.length) {
      removed.forEach((builder) => archiveBuilder(current, builder.id, builder, previous))
      saving = true
      writeState(current)
      setTimeout(() => { saving = false }, 500)
      return
    }

    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(current))
  }

  function archivedNames() {
    return archivedProfiles(readState()).map((b) => String(b.name || '').trim()).filter(Boolean)
  }

  function textHasName(el, names) {
    const text = (el.textContent || '').toLowerCase().replace(/\s+/g, ' ')
    return names.some((name) => name && text.includes(name.toLowerCase()))
  }

  function hideArchivedInMainRoster() {
    const names = archivedNames()
    if (!names.length) return

    document.querySelectorAll('.builders-tab-pool-list .pool-row').forEach((row) => {
      row.style.display = textHasName(row, names) ? 'none' : ''
    })

    document.querySelectorAll('.builderx-table tbody tr').forEach((row) => {
      row.style.display = textHasName(row, names) ? 'none' : ''
    })

    document.querySelectorAll('select option').forEach((option) => {
      if (names.some((name) => option.textContent.trim() === name)) {
        option.disabled = true
        option.textContent = `${option.textContent} (archived)`
      }
    })
  }

  function activeStats(state) {
    const builders = activeBuilders(state)
    const day = state.selectedDay || 'Monday'
    const assignments = state.weeklyData?.[day]?.assignments || {}
    const assignedToday = builders.filter((b) => assignments[b.id]).length
    const activeToday = builders.filter((b) => STAFFED.has(assignments[b.id]?.status || '')).length
    return {
      total: builders.length,
      assignedToday,
      activeToday,
      trainers: builders.filter((b) => b.isTrainer).length,
      safety: builders.filter((b) => b.isSafetyMember).length,
      lineLeads: builders.filter((b) => b.isLineLead).length,
      tdr: builders.filter((b) => b.trainedTdr).length,
      forklift: builders.filter((b) => b.trainedForklift).length,
      center: builders.filter((b) => b.trainedCenterRider).length,
      clamp: builders.filter((b) => b.trainedClampTruck).length,
      night: builders.filter((b) => b.badgeType === 'night').length,
      green: builders.filter((b) => b.badgeType === 'green').length,
    }
  }

  function patchBuilderKpis() {
    const state = readState()
    const stats = activeStats(state)
    const labelMap = {
      total: stats.total,
      'assigned today': stats.assignedToday,
      'active today': stats.activeToday,
      trainers: stats.trainers,
      safety: stats.safety,
      'line leads': stats.lineLeads,
      tdr: stats.tdr,
      forklift: stats.forklift,
      'center rider': stats.center,
      clamp: stats.clamp,
      'blue night': stats.night,
      green: stats.green,
    }
    document.querySelectorAll('.builderx-kpi').forEach((card) => {
      const label = (card.querySelector('span')?.textContent || '').toLowerCase().trim()
      if (Object.prototype.hasOwnProperty.call(labelMap, label)) {
        const value = card.querySelector('strong')
        if (value) value.textContent = labelMap[label]
      }
    })
  }

  function renderArchivePanel() {
    const state = readState()
    const archived = archivedProfiles(state)
    document.querySelectorAll('[data-archive-panel]').forEach((el) => el.remove())

    const target = Array.from(document.querySelectorAll('.table-kicker, h2, .title')).find((el) => /Permanent Master Roster|Master Roster|Builder/i.test(el.textContent || ''))
    const host = target?.closest('.summary-card-block, .board-shell, .card')
    if (!host || !document.querySelector('.app-nav-tabs .active')?.textContent?.includes('Builders')) return

    const panel = document.createElement('div')
    panel.className = 'summary-card-block card archive-panel'
    panel.dataset.archivePanel = 'true'
    panel.innerHTML = `
      <div class="table-title-row">
        <div>
          <div class="table-kicker">Archived Builders</div>
          <div class="small">Removed from active master roster, but preserved in previous days, assignments, exports, and records.</div>
        </div>
      </div>
      <div class="archive-list">
        ${archived.length ? archived.map((b) => `
          <div class="archive-row">
            <div><strong>${escapeHtml(b.name || b.id)}</strong><div class="small">Archived ${b.archivedAt ? new Date(b.archivedAt).toLocaleString() : '—'}</div></div>
            <button class="secondary mini-btn" data-reactivate-builder="${escapeHtml(b.id)}">Reactivate</button>
          </div>
        `).join('') : '<div class="small">No archived builders yet.</div>'}
      </div>
    `
    host.insertAdjacentElement('afterend', panel)
    panel.querySelectorAll('[data-reactivate-builder]').forEach((btn) => {
      btn.addEventListener('click', () => reactivateBuilder(btn.dataset.reactivateBuilder))
    })
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] || '&#039;'))
  }

  function addStyle() {
    if (document.getElementById('builder-archive-guard-style')) return
    const style = document.createElement('style')
    style.id = 'builder-archive-guard-style'
    style.textContent = `
      .archive-panel{border-color:#bfdbfe!important;background:linear-gradient(180deg,#eff6ff,#ffffff)!important}.archive-list{display:grid;gap:10px}.archive-row{display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid #d8e1ec;border-radius:14px;padding:10px 12px;background:#fff}body[data-theme="dark"] .archive-panel{background:linear-gradient(180deg,#344963,#293c57)!important;border-color:#647a99!important}body[data-theme="dark"] .archive-row{background:#263852!important;border-color:#536986!important;color:#f4f8ff!important}
    `
    document.head.appendChild(style)
  }

  const originalConfirm = window.confirm.bind(window)
  window.confirm = (message) => {
    const text = String(message || '')
    if (/Remove .* from the permanent master list and all weekly days/i.test(text)) {
      return originalConfirm(text.replace('from the permanent master list and all weekly days', 'from the active master roster. Previous days and records will be preserved'))
    }
    return originalConfirm(message)
  }

  function tick() {
    addStyle()
    detectRemovedBuilders()
    hideArchivedInMainRoster()
    patchBuilderKpis()
    renderArchivePanel()
  }

  addStyle()
  document.addEventListener('DOMContentLoaded', tick)
  window.addEventListener('storage', tick)
  window.addEventListener('staffboard-builder-archive-updated', tick)
  setInterval(tick, 1200)
  tick()
})()
