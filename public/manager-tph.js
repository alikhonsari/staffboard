(() => {
  const STATE_KEY = 'staffing_board_redo_complete_v2_weekly'
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const STAFFED = new Set(['Present', 'Training', 'Indirect'])
  const SHIFT_HOURS = 8
  const SHIFT_END_MINUTE = 30

  function state() { try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch { return {} } }
  function dayName(s) { return DAYS.includes(s.selectedDay) ? s.selectedDay : 'Monday' }
  function dayData(s) { return s.weeklyData?.[dayName(s)] || { assignments: {}, opsMetrics: {} } }
  function num(value) { const n = Number(value || 0); return Number.isFinite(n) ? n : 0 }
  function isNight(label) { return String(label || '').toLowerCase().includes('night') }
  function boardDate(s) {
    const d = new Date(`${s.weekStartDate || new Date().toISOString().slice(0, 10)}T00:00:00`)
    const idx = Math.max(0, DAYS.indexOf(dayName(s)))
    d.setDate(d.getDate() + idx)
    return d
  }
  function shiftInfo(s) {
    const now = new Date()
    const start = boardDate(s)
    const end = boardDate(s)
    const breakStart = boardDate(s)
    if (isNight(s.boardShift)) {
      start.setHours(20, 0, 0, 0)
      end.setDate(end.getDate() + 1)
      end.setHours(4, SHIFT_END_MINUTE, 0, 0)
      breakStart.setDate(breakStart.getDate() + 1)
      breakStart.setHours(0, 0, 0, 0)
    } else {
      start.setHours(8, 0, 0, 0)
      end.setHours(16, SHIFT_END_MINUTE, 0, 0)
      breakStart.setHours(12, 0, 0, 0)
    }
    const breakEnd = new Date(breakStart)
    breakEnd.setMinutes(breakEnd.getMinutes() + 30)
    let elapsed = 0
    let remaining = 0
    if (now <= start) remaining = SHIFT_HOURS
    else if (now >= end) elapsed = SHIFT_HOURS
    else {
      const minutesSinceStart = (now - start) / 60000
      const minutesToEnd = (end - now) / 60000
      let unpaidBreakElapsed = 0
      if (now >= breakEnd) unpaidBreakElapsed = 30
      else if (now > breakStart && now < breakEnd) unpaidBreakElapsed = (now - breakStart) / 60000
      let unpaidBreakRemaining = 0
      if (now < breakStart) unpaidBreakRemaining = 30
      else if (now >= breakStart && now < breakEnd) unpaidBreakRemaining = (breakEnd - now) / 60000
      elapsed = Math.max(0, (minutesSinceStart - unpaidBreakElapsed) / 60)
      remaining = Math.max(0, (minutesToEnd - unpaidBreakRemaining) / 60)
    }
    elapsed = Math.max(0, Math.min(SHIFT_HOURS, elapsed))
    remaining = Math.max(0, Math.min(SHIFT_HOURS, remaining))
    return {
      elapsed,
      remaining,
      shift: SHIFT_HOURS,
      start: start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      end: end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    }
  }
  function activeHeadcount(s, d) {
    const builderMap = new Map((s.builderPool || []).map((b) => [b.id, b]))
    const manual = num(d.opsMetrics?.manualHeadCount)
    if (manual) return manual
    return Object.entries(d.assignments || {}).filter(([id, a]) => {
      const builder = builderMap.get(id)
      return STAFFED.has(a.status || 'Present') && !builder?.isLineLead
    }).length
  }
  function workload(d) {
    const recovery = num(d.opsMetrics?.racksProcessed)
    const prep = num(d.opsMetrics?.racksPrepped)
    const media = num(d.opsMetrics?.mediaProcessed)
    return { recovery, prep, media, total: recovery + prep + media }
  }
  function managerMetrics(s) {
    const d = dayData(s)
    const goal = num(d.opsMetrics?.goalTph || s.goalTph || 7)
    const shift = shiftInfo(s)
    const elapsed = shift.elapsed
    const remaining = shift.remaining
    const hc = activeHeadcount(s, d)
    const w = workload(d)
    const currentTph = elapsed > 0 && hc > 0 ? w.total / elapsed / hc : 0
    const goalTotal = goal * shift.shift * Math.max(hc, 1)
    const remainingUnits = Math.max(0, goalTotal - w.total)
    const requiredTph = remaining > 0 && hc > 0 ? remainingUnits / remaining / hc : 0
    const projected = currentTph * shift.shift * Math.max(hc, 1)
    const gap = projected - goalTotal
    const pacePct = goalTotal ? Math.round((w.total / goalTotal) * 100) : 0
    const status = currentTph >= goal ? 'On Track' : currentTph >= goal * 0.85 ? 'Watch' : 'Behind'
    const tone = status === 'On Track' ? 'good' : status === 'Watch' ? 'warn' : 'bad'
    const summary = status === 'On Track' ? 'Current pace is meeting or beating the target.' : status === 'Watch' ? 'Close to target. Watch next quarter output and barriers.' : 'Below target. Remove barriers, increase output, or adjust staffing.'
    const ask = status === 'On Track' ? 'Keep staffing stable and monitor for new blockers.' : status === 'Watch' ? 'Check misses, balance labor, and confirm next-hour output plan.' : 'Escalate blockers, rebalance staffing, and confirm recovery plan.'
    return { goal, elapsed, shift: shift.shift, remaining, shiftStart: shift.start, shiftEnd: shift.end, hc, ...w, currentTph, requiredTph, projected, goalTotal, gap, pacePct, status, tone, summary, ask }
  }
  function fmt(value, digits = 1) { return Number(value || 0).toFixed(digits) }
  function whole(value) { return Math.round(Number(value || 0)).toLocaleString() }
  function statusClass(tone) { return `manager-report-${tone}` }
  function reportHtml(s) {
    const m = managerMetrics(s)
    return `<div class="manager-report ${statusClass(m.tone)}">
      <div class="manager-report-hero"><div><div class="manager-report-kicker">Manager Report</div><h2>${m.status}</h2><p>${m.summary}</p></div><div class="manager-report-current"><span>Current</span><strong>${fmt(m.currentTph)}</strong><small>TPH / HC</small></div></div>
      <div class="manager-report-grid main">
        <div><span>Goal</span><strong>${fmt(m.goal)}</strong><small>TPH / HC</small></div>
        <div><span>Need Now</span><strong>${fmt(m.requiredTph)}</strong><small>TPH / HC rest of shift</small></div>
        <div><span>Pace</span><strong>${m.pacePct}%</strong><small>of full-day goal</small></div>
        <div><span>Projected Gap</span><strong>${m.gap >= 0 ? '+' : ''}${whole(m.gap)}</strong><small>units vs goal</small></div>
        <div><span>Headcount</span><strong>${whole(m.hc)}</strong><small>active / manual</small></div>
        <div><span>Hours Left</span><strong>${fmt(m.remaining)}</strong><small>${fmt(m.elapsed)}h elapsed · ${m.shiftStart}-${m.shiftEnd}</small></div>
      </div>
      <div class="manager-report-bar"><span style="width:${Math.max(0, Math.min(100, m.pacePct))}%"></span></div>
      <div class="manager-report-grid small"><div><span>Recovery</span><strong>${whole(m.recovery)}</strong></div><div><span>Prep</span><strong>${whole(m.prep)}</strong></div><div><span>Media</span><strong>${whole(m.media)}</strong></div><div><span>Total Work</span><strong>${whole(m.total)}</strong></div><div><span>Projected EOS</span><strong>${whole(m.projected)}</strong></div><div><span>Goal Units</span><strong>${whole(m.goalTotal)}</strong></div></div>
      <div class="manager-report-action"><span>Recommended action</span><strong>${m.ask}</strong></div>
    </div>`
  }
  function addStyle() {
    if (document.getElementById('manager-report-style')) return
    const style = document.createElement('style')
    style.id = 'manager-report-style'
    style.textContent = `.manager-report-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99983;display:flex;align-items:center;justify-content:center;padding:24px}.manager-report-modal{width:min(1120px,96vw);max-height:90vh;overflow:auto;background:#fff;border:1px solid #d8e1ec;border-radius:24px;box-shadow:0 28px 80px rgba(15,23,42,.35)}.manager-report-head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;gap:14px;align-items:center;padding:18px 20px;background:rgba(255,255,255,.96);border-bottom:1px solid #e5edf6;backdrop-filter:blur(12px)}.manager-report-head h2{margin:0;font-size:24px}.manager-report-muted{color:#64748b;font-size:13px;font-weight:750}.manager-report-close{border:0;background:#e8eef7;color:#172033;border-radius:12px;padding:10px 14px;font-weight:900;cursor:pointer}.manager-report-body{padding:18px 20px;background:linear-gradient(180deg,#f8fafc,#fff)}.manager-report{border:1px solid #d8e1ec;border-radius:24px;background:#fff;padding:18px;box-shadow:0 10px 26px rgba(15,23,42,.06)}.manager-report-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:16px}.manager-report-kicker{text-transform:uppercase;letter-spacing:.07em;font-size:.78rem;font-weight:950;color:#64748b}.manager-report h2{margin:4px 0 4px;font-size:42px;line-height:1;letter-spacing:-.04em}.manager-report p{margin:0;color:#64748b;font-weight:750}.manager-report-current{min-width:160px;text-align:center;border:1px solid #e5edf6;background:#f8fafc;border-radius:20px;padding:14px}.manager-report-current span,.manager-report-grid span,.manager-report-action span{display:block;text-transform:uppercase;letter-spacing:.055em;font-size:.72rem;color:#64748b;font-weight:950}.manager-report-current strong{display:block;font-size:44px;line-height:1;margin-top:4px}.manager-report-current small,.manager-report-grid small{display:block;color:#64748b;font-size:.75rem;font-weight:800;margin-top:4px}.manager-report-grid{display:grid;gap:10px}.manager-report-grid.main{grid-template-columns:repeat(3,minmax(0,1fr))}.manager-report-grid.small{grid-template-columns:repeat(6,minmax(0,1fr));margin-top:12px}.manager-report-grid div{background:#f8fafc;border:1px solid #e5edf6;border-radius:16px;padding:12px}.manager-report-grid strong{display:block;font-size:27px;line-height:1.05;margin-top:5px;color:#172033}.manager-report-bar{height:13px;border-radius:999px;background:#e8eef7;overflow:hidden;margin:14px 0}.manager-report-bar span{display:block;height:100%;border-radius:999px;background:#2563eb}.manager-report-action{margin-top:14px;border:1px solid #d8e1ec;background:#f8fafc;border-radius:18px;padding:14px}.manager-report-action strong{display:block;margin-top:6px;font-size:18px}.manager-report-good{border-color:#bbf7d0;background:linear-gradient(180deg,#f0fdf4,#fff)}.manager-report-good h2{color:#166534}.manager-report-good .manager-report-bar span{background:#16a34a}.manager-report-warn{border-color:#fed7aa;background:linear-gradient(180deg,#fff7ed,#fff)}.manager-report-warn h2{color:#9a3412}.manager-report-warn .manager-report-bar span{background:#f59e0b}.manager-report-bad{border-color:#fecaca;background:linear-gradient(180deg,#fff1f2,#fff)}.manager-report-bad h2{color:#991b1b}.manager-report-bad .manager-report-bar span{background:#ef4444}body[data-theme="dark"] .manager-report-modal,body[data-theme="dark"] .manager-report-head,body[data-theme="dark"] .manager-report,body[data-theme="dark"] .manager-report-current,body[data-theme="dark"] .manager-report-grid div,body[data-theme="dark"] .manager-report-action{background:#263852;color:#fff;border-color:#536986}body[data-theme="dark"] .manager-report-body{background:#22344e}body[data-theme="dark"] .manager-report h2,body[data-theme="dark"] .manager-report-current strong,body[data-theme="dark"] .manager-report-grid strong,body[data-theme="dark"] .manager-report-action strong{color:#fff}body[data-theme="dark"] .manager-report-muted,body[data-theme="dark"] .manager-report p,body[data-theme="dark"] .manager-report-current span,body[data-theme="dark"] .manager-report-grid span,body[data-theme="dark"] .manager-report-action span,body[data-theme="dark"] .manager-report-current small,body[data-theme="dark"] .manager-report-grid small{color:#c8d6eb}@media(max-width:900px){.manager-report-hero{display:block}.manager-report-current{margin-top:12px}.manager-report-grid.main{grid-template-columns:repeat(2,1fr)}.manager-report-grid.small{grid-template-columns:repeat(2,1fr)}}`
    document.head.appendChild(style)
  }
  function openReport() {
    addStyle()
    document.querySelectorAll('[data-manager-report-modal]').forEach((x) => x.remove())
    const s = state()
    const modal = document.createElement('div')
    modal.className = 'manager-report-backdrop'
    modal.dataset.managerReportModal = 'true'
    modal.innerHTML = `<div class="manager-report-modal"><div class="manager-report-head"><div><h2>Manager Report</h2><div class="manager-report-muted">${s.boardTitle || 'Board'} · ${dayName(s)} · Week ${s.weekStartDate || ''}</div></div><button class="manager-report-close" type="button">Close</button></div><div class="manager-report-body">${reportHtml(s)}</div></div>`
    document.body.appendChild(modal)
    modal.querySelector('.manager-report-close').onclick = () => modal.remove()
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove() })
  }
  function ensureButton() {
    addStyle()
    const navs = document.querySelectorAll('.view-tab-grid, .app-nav-tabs, .sidebar-tabs')
    navs.forEach((nav) => {
      if (nav.querySelector('[data-manager-report-button]')) return
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.dataset.managerReportButton = 'true'
      btn.className = nav.classList.contains('view-tab-grid') ? 'secondary sidebar-tab' : 'secondary nav-tab'
      btn.textContent = 'Manager Report'
      btn.addEventListener('click', openReport)
      nav.appendChild(btn)
    })
  }
  addStyle()
  document.addEventListener('DOMContentLoaded', ensureButton)
  setInterval(ensureButton, 1500)
  ensureButton()
})()
