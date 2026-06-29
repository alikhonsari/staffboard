(() => {
  const STATE_KEY = 'staffing_board_redo_complete_v2_weekly'
  const TOKEN_KEYS = ['staffboard2_token', 'staffboard_shared_auth_token']
  const SKILLS = [
    ['trainedTdr', 'TDR'],
    ['trainedForklift', 'Forklift'],
    ['trainedCenterRider', 'Center Rider'],
    ['trainedClampTruck', 'Clamp Truck'],
    ['isTrainer', 'Trainer'],
    ['isSafetyMember', 'Safety'],
    ['isLineLead', 'Line Lead'],
  ]
  const STAFFED = new Set(['Present', 'Training', 'Indirect'])
  let saveTimer = null

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] || '&#039;'))
  }

  function readState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch { return {} }
  }

  function writeState(state) {
    state.updatedAt = new Date().toLocaleString()
    localStorage.setItem(STATE_KEY, JSON.stringify(state))
    window.dispatchEvent(new Event('staffboard-builder-enhancements-updated'))
    scheduleSave(state)
  }

  function token() {
    for (const key of TOKEN_KEYS) {
      const value = localStorage.getItem(key)
      if (value) return value
    }
    return ''
  }

  function scheduleSave(state) {
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
        console.warn('Builder Tools V2 save failed', err)
      }
    }, 800)
  }

  function activeBuilders(state) {
    return (state.builderPool || []).filter((b) => !b.isArchived && !state.archivedBuilders?.[b.id])
  }

  function selectedDay(state) {
    return state.selectedDay || 'Monday'
  }

  function assignmentFor(state, id) {
    return state.weeklyData?.[selectedDay(state)]?.assignments?.[id] || null
  }

  function ensureDay(state) {
    const day = selectedDay(state)
    if (!state.weeklyData) state.weeklyData = {}
    if (!state.weeklyData[day]) state.weeklyData[day] = { assignments: {}, opsMetrics: {}, rackLists: {}, snapshots: {}, movementLog: [], attendanceLog: [] }
    if (!state.weeklyData[day].assignments) state.weeklyData[day].assignments = {}
    return state.weeklyData[day]
  }

  function blankAssignment() {
    const now = new Date().toLocaleString()
    return { status: 'Present', area: '', subArea: '', role: '', leaveTime: '', clockInTime: '', comment: '', builderNotes: '', createdAt: now, updatedAt: now, sessionStartIso: '', areaHistory: [] }
  }

  function flags(builder) {
    return SKILLS.filter(([key]) => builder?.[key]).map(([, label]) => label)
  }

  function badgeClass(value) {
    if (value === 'night') return 'builderx-badge-night'
    if (value === 'green') return 'builderx-badge-green'
    return 'builderx-badge-day'
  }

  function badgeText(value) {
    if (value === 'night') return 'Blue Night'
    if (value === 'green') return 'Green'
    return 'Blue Day'
  }

  function filters() {
    const modal = document.getElementById('staffboard-builder-enhancements-modal')
    return {
      search: (modal?.querySelector('[data-builder-search]')?.value || '').toLowerCase().trim(),
      badge: modal?.querySelector('[data-builder-badge-filter]')?.value || 'all',
      skill: modal?.querySelector('[data-builder-skill-filter]')?.value || 'all',
    }
  }

  function filteredBuilders(state) {
    const f = filters()
    return activeBuilders(state).filter((b) => {
      const text = `${b.name || ''} ${badgeText(b.badgeType)} ${flags(b).join(' ')}`.toLowerCase()
      const badgeOk = f.badge === 'all' || (b.badgeType || 'day') === f.badge
      const skillOk = f.skill === 'all' || !!b[f.skill]
      return badgeOk && skillOk && (!f.search || text.includes(f.search))
    }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  }

  function stats(state) {
    const builders = activeBuilders(state)
    const assigned = builders.filter((b) => assignmentFor(state, b.id)).length
    const active = builders.filter((b) => STAFFED.has(assignmentFor(state, b.id)?.status || '')).length
    return { builders, assigned, active }
  }

  function setSkill(builderId, key, value) {
    const state = readState()
    const builder = (state.builderPool || []).find((b) => b.id === builderId)
    if (!builder) return
    builder[key] = value
    writeState(state)
    renderCards()
  }

  function setBadge(builderId, value) {
    const state = readState()
    const builder = (state.builderPool || []).find((b) => b.id === builderId)
    if (!builder) return
    builder.badgeType = value
    writeState(state)
    renderCards()
  }

  function addToday(builderId) {
    const state = readState()
    const dayData = ensureDay(state)
    if (!dayData.assignments[builderId]) dayData.assignments[builderId] = blankAssignment()
    writeState(state)
    renderCards()
  }

  function removeToday(builderId) {
    const state = readState()
    const dayData = ensureDay(state)
    delete dayData.assignments[builderId]
    writeState(state)
    renderCards()
  }

  function card(builder, state) {
    const assignment = assignmentFor(state, builder.id)
    const onDay = !!assignment
    const area = assignment?.area || 'Unassigned'
    const status = assignment?.status || 'Present'
    return `<div class="builderx-person-card" data-builder-v2-card="${esc(builder.id)}">
      <div class="builderx-person-top">
        <div style="min-width:0">
          <div class="builderx-person-name">${esc(builder.name || 'Unnamed builder')}</div>
          <div class="builderx-person-sub">${onDay ? `${esc(status)} · ${esc(area)}` : 'Not on selected day'}</div>
        </div>
        <div style="display:grid;gap:6px;justify-items:end">
          <span class="builderx-badge-pill ${badgeClass(builder.badgeType)}">${esc(badgeText(builder.badgeType))}</span>
          <span class="builderx-status-pill ${onDay ? 'builderx-status-on' : 'builderx-status-off'}">${onDay ? 'On day' : 'Off day'}</span>
        </div>
      </div>
      <div class="builderx-skill-grid">
        ${SKILLS.map(([key, label]) => `<label class="builderx-skill-toggle"><input type="checkbox" data-v2-skill="${key}" data-v2-builder="${esc(builder.id)}" ${builder[key] ? 'checked' : ''}>${esc(label)}</label>`).join('')}
      </div>
      <div class="builderx-person-actions">
        <select data-v2-badge="${esc(builder.id)}">
          <option value="day" ${(builder.badgeType || 'day') === 'day' ? 'selected' : ''}>Blue Day</option>
          <option value="night" ${builder.badgeType === 'night' ? 'selected' : ''}>Blue Night</option>
          <option value="green" ${builder.badgeType === 'green' ? 'selected' : ''}>Green</option>
        </select>
        ${onDay ? `<button class="builderx-btn builderx-danger" data-v2-remove-day="${esc(builder.id)}">Remove Today</button>` : `<button class="builderx-btn" data-v2-add-day="${esc(builder.id)}">Add Today</button>`}
      </div>
    </div>`
  }

  function renderCards() {
    const modal = document.getElementById('staffboard-builder-enhancements-modal')
    if (!modal) return
    modal.classList.add('builderx-v2')

    const state = readState()
    const rows = filteredBuilders(state)
    const st = stats(state)
    const matrixCard = Array.from(modal.querySelectorAll('.builderx-card')).find((el) => /Skill Matrix/i.test(el.textContent || ''))
    if (!matrixCard) return

    const original = matrixCard.querySelector('.builderx-table-wrap')
    if (original) original.classList.add('builderx-original-hidden')

    let host = matrixCard.querySelector('[data-builderx-v2-host]')
    if (!host) {
      host = document.createElement('div')
      host.dataset.builderxV2Host = 'true'
      matrixCard.appendChild(host)
    }

    host.innerHTML = `
      <div class="builderx-v2-toolbar">
        <div>
          <div class="builderx-v2-title">Clean Builder Roster</div>
          <div class="builderx-muted">Active roster only. Skill toggles and day actions auto-save.</div>
        </div>
        <div class="builderx-v2-count">${rows.length} shown · ${st.builders.length} active · ${st.assigned} assigned</div>
      </div>
      ${rows.length ? `<div class="builderx-roster-grid">${rows.map((b) => card(b, state)).join('')}</div>` : '<div class="builderx-empty-state">No active builders match this filter.</div>'}
    `

    host.querySelectorAll('[data-v2-skill]').forEach((input) => {
      input.addEventListener('change', () => setSkill(input.dataset.v2Builder, input.dataset.v2Skill, input.checked))
    })
    host.querySelectorAll('[data-v2-badge]').forEach((select) => {
      select.addEventListener('change', () => setBadge(select.dataset.v2Badge, select.value))
    })
    host.querySelectorAll('[data-v2-add-day]').forEach((btn) => {
      btn.addEventListener('click', () => addToday(btn.dataset.v2AddDay))
    })
    host.querySelectorAll('[data-v2-remove-day]').forEach((btn) => {
      btn.addEventListener('click', () => removeToday(btn.dataset.v2RemoveDay))
    })
  }

  function watchControls() {
    const modal = document.getElementById('staffboard-builder-enhancements-modal')
    if (!modal || modal.dataset.v2ControlWatch === 'true') return
    modal.dataset.v2ControlWatch = 'true'
    modal.addEventListener('input', (e) => {
      if (e.target.matches('[data-builder-search]')) setTimeout(renderCards, 0)
    })
    modal.addEventListener('change', (e) => {
      if (e.target.matches('[data-builder-badge-filter], [data-builder-skill-filter]')) setTimeout(renderCards, 0)
    })
  }

  function tick() {
    watchControls()
    renderCards()
  }

  document.addEventListener('DOMContentLoaded', tick)
  window.addEventListener('staffboard-builder-enhancements-updated', () => setTimeout(tick, 0))
  setInterval(tick, 1200)
  tick()
})()
