(() => {
  const KEY = 'staffing_board_redo_complete_v2_weekly'
  const STAFFED = new Set(['Present', 'Training', 'Indirect'])

  function readState() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] || '&#039;'))
  }

  function isNightShift(state) {
    return String(`${state.currentBoardId || ''} ${state.boardShift || ''}`).toLowerCase().includes('night')
  }

  function selectedDay(state) {
    return state.selectedDay || 'Monday'
  }

  function currentBoardKind(state) {
    const id = String(state.currentBoardId || '').toLowerCase()
    const title = String(state.boardTitle || '').toLowerCase()
    if (id.includes('fa_') || title.includes('fa lab')) return 'fa'
    if (id.includes('bodega') || title.includes('bodega')) return 'bodega'
    return 'speed'
  }

  function groupShiftMatch(group, state) {
    const name = String(group?.name || '').toLowerCase()
    const night = isNightShift(state)
    if (night && !name.includes('night')) return false
    if (!night && name.includes('night')) return false
    if (!night && !(name.includes('day') || name.includes('shift'))) return false
    return true
  }

  function groupBoardMatch(group, state) {
    const name = String(group?.name || '').toLowerCase()
    const kind = currentBoardKind(state)
    if (kind === 'fa') return name.includes('fa') || name.includes('lab')
    if (kind === 'bodega') return name.includes('bodega')
    return name.includes('speed') || (!name.includes('fa') && !name.includes('lab') && !name.includes('bodega'))
  }

  function matchingGroups(state) {
    const groups = Array.isArray(state.builderGroups) ? state.builderGroups : []
    const exact = groups.filter((g) => groupShiftMatch(g, state) && groupBoardMatch(g, state))
    if (exact.length) return exact
    return groups.filter((g) => groupShiftMatch(g, state))
  }

  function assignmentFor(state, id) {
    return state.weeklyData?.[selectedDay(state)]?.assignments?.[id] || null
  }

  function activeRoster(state) {
    return (state.builderPool || []).filter((builder) => !builder.isArchived && !state.archivedBuilders?.[builder.id])
  }

  function currentBuilders(state) {
    const roster = activeRoster(state)
    const groups = matchingGroups(state)
    if (groups.length) {
      const ids = new Set(groups.flatMap((g) => Array.isArray(g.builderIds) ? g.builderIds : []))
      const grouped = roster.filter((builder) => ids.has(builder.id))
      if (grouped.length) return { builders: grouped, source: groups.map((g) => g.name).join(', ') }
    }

    const assigned = roster.filter((builder) => assignmentFor(state, builder.id))
    if (assigned.length) return { builders: assigned, source: `${selectedDay(state)} assigned` }

    return { builders: roster, source: 'Master roster' }
  }

  function badgeType(builder) {
    const raw = String(builder?.badgeType || 'day').toLowerCase()
    if (raw.includes('night')) return 'night'
    if (raw.includes('green')) return 'green'
    return 'day'
  }

  function stats(state) {
    const current = currentBuilders(state)
    const builders = current.builders
    const assignedToday = builders.filter((builder) => assignmentFor(state, builder.id)).length
    const activeToday = builders.filter((builder) => STAFFED.has(assignmentFor(state, builder.id)?.status || '')).length
    return {
      shift: isNightShift(state) ? 'Night Shift' : 'Day Shift',
      dayName: selectedDay(state),
      source: current.source,
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
      blueDay: builders.filter((b) => badgeType(b) === 'day').length,
      blueNight: builders.filter((b) => badgeType(b) === 'night').length,
      green: builders.filter((b) => badgeType(b) === 'green').length,
    }
  }

  function style() {
    if (document.getElementById('builder-health-fix-style')) return
    const s = document.createElement('style')
    s.id = 'builder-health-fix-style'
    s.textContent = `
      [data-builderx-summary="true"]{display:none!important}
      .builder-health-stable{margin:14px 0;background:white;border:1px solid #d8e1ec;border-radius:18px;padding:14px;box-shadow:0 8px 20px rgba(15,23,42,.05)}
      .builder-health-title{color:#66748a;font-size:13px;line-height:1.45;margin-bottom:10px;font-weight:850}.builder-health-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}.builder-health-kpi{background:#f8fafc;border:1px solid #d8e1ec;border-radius:14px;padding:12px}.builder-health-kpi span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#66748a;font-weight:900}.builder-health-kpi strong{display:block;font-size:24px;margin-top:4px}.builder-health-open{margin-top:10px;border:0;border-radius:11px;padding:9px 12px;font-weight:900;cursor:pointer;background:#2563eb;color:white}
      body[data-theme="dark"] .builder-health-stable{background:#22344e!important;color:#f4f8ff!important;border-color:#536986!important}body[data-theme="dark"] .builder-health-kpi{background:#263852!important;border-color:#536986!important;color:#f4f8ff!important}body[data-theme="dark"] .builder-health-title,body[data-theme="dark"] .builder-health-kpi span{color:#c8d6eb!important}
      @media(max-width:900px){.builder-health-kpis{grid-template-columns:repeat(2,1fr)}}
    `
    document.head.appendChild(s)
  }

  function kpi(label, value) {
    return `<div class="builder-health-kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`
  }

  function html(state) {
    const st = stats(state)
    return `<div class="builder-health-title">Builder Roster Health · ${esc(st.shift)} · ${esc(st.dayName)} · ${esc(st.source)}</div><div class="builder-health-kpis">${[
      ['Total', st.total], ['Assigned Today', st.assignedToday], ['Active Today', st.activeToday], ['Trainers', st.trainers], ['Safety', st.safety], ['Line Leads', st.lineLeads],
      ['TDR', st.tdr], ['Forklift', st.forklift], ['Center Rider', st.center], ['Clamp', st.clamp], ['Blue Day', st.blueDay], ['Blue Night', st.blueNight], ['Green', st.green],
    ].map(([label, value]) => kpi(label, value)).join('')}</div><button class="builder-health-open" type="button">Open Builder Tools</button>`
  }

  function findHost() {
    const headings = Array.from(document.querySelectorAll('.title, h2, .table-kicker')).filter((el) => /builder/i.test(el.textContent || ''))
    return headings[0]?.closest('.board-shell') || headings[0]?.parentElement || null
  }

  function openBuilderTools() {
    const button = document.querySelector('[data-builderx-tab]')
    if (button) button.click()
  }

  function render() {
    style()
    const host = findHost()
    if (!host) return
    let box = document.querySelector('[data-builder-health-stable]')
    if (!box) {
      box = document.createElement('div')
      box.className = 'builder-health-stable'
      box.dataset.builderHealthStable = 'true'
      host.insertBefore(box, host.firstChild)
    }
    const next = html(readState())
    if (box.dataset.lastHtml !== next) {
      box.dataset.lastHtml = next
      box.innerHTML = next
      box.querySelector('.builder-health-open')?.addEventListener('click', openBuilderTools)
    }
  }

  document.addEventListener('DOMContentLoaded', render)
  window.addEventListener('staffboard-builder-enhancements-updated', () => setTimeout(render, 0))
  setInterval(render, 1500)
  render()
})()
