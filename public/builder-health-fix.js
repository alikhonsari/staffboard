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

  function matchesCurrentShift(builder, state) {
    const badge = String(builder?.badgeType || 'day').toLowerCase()
    if (badge === 'green') return true
    return isNightShift(state) ? badge === 'night' : badge !== 'night'
  }

  function assignmentFor(state, id) {
    return state.weeklyData?.[selectedDay(state)]?.assignments?.[id] || null
  }

  function currentBuilders(state) {
    return (state.builderPool || [])
      .filter((builder) => !builder.isArchived && !state.archivedBuilders?.[builder.id])
      .filter((builder) => matchesCurrentShift(builder, state))
  }

  function stats(state) {
    const builders = currentBuilders(state)
    const assignedToday = builders.filter((builder) => assignmentFor(state, builder.id)).length
    const activeToday = builders.filter((builder) => STAFFED.has(assignmentFor(state, builder.id)?.status || '')).length
    return {
      shift: isNightShift(state) ? 'Night Shift' : 'Day Shift',
      dayName: selectedDay(state),
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
      blueDay: builders.filter((b) => (b.badgeType || 'day') === 'day').length,
      blueNight: builders.filter((b) => b.badgeType === 'night').length,
      green: builders.filter((b) => b.badgeType === 'green').length,
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
    const badgeLabel = st.shift === 'Night Shift' ? 'Blue Night' : 'Blue Day'
    const badgeValue = st.shift === 'Night Shift' ? st.blueNight : st.blueDay
    return `<div class="builder-health-title">Builder Roster Health · ${esc(st.shift)} · ${esc(st.dayName)} only</div><div class="builder-health-kpis">${[
      ['Total', st.total], ['Assigned Today', st.assignedToday], ['Active Today', st.activeToday], ['Trainers', st.trainers], ['Safety', st.safety], ['Line Leads', st.lineLeads],
      ['TDR', st.tdr], ['Forklift', st.forklift], ['Center Rider', st.center], ['Clamp', st.clamp], [badgeLabel, badgeValue], ['Green', st.green],
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
