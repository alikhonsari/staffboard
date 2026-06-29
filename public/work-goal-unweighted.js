(() => {
  const K = 'staffing_board_redo_complete_v2_weekly'
  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday']
  const STAFF = new Set(['Present','Training','Indirect'])
  const SHIFT_HOURS = 8
  const SHIFT_END_MINUTE = 30
  const getState = () => { try { return JSON.parse(localStorage.getItem(K) || '{}') } catch { return {} } }
  const num = (v) => { const n = Number(v || 0); return Number.isFinite(n) ? n : 0 }
  const first = (m, keys) => keys.map((k) => num(m?.[k])).find(Boolean) || 0
  const isNight = (label) => String(label || '').toLowerCase().includes('night')
  function dayName(s) { return DAYS.includes(s.selectedDay) ? s.selectedDay : 'Monday' }
  function boardDate(s) {
    const d = new Date(`${s.weekStartDate || new Date().toISOString().slice(0, 10)}T00:00:00`)
    d.setDate(d.getDate() + Math.max(0, DAYS.indexOf(dayName(s))))
    return d
  }
  function shiftInfo(s) {
    const now = new Date()
    const start = boardDate(s)
    const end = boardDate(s)
    const breakStart = boardDate(s)
    if (isNight(s.boardShift)) {
      start.setHours(20,0,0,0)
      end.setDate(end.getDate() + 1); end.setHours(4,SHIFT_END_MINUTE,0,0)
      breakStart.setDate(breakStart.getDate() + 1); breakStart.setHours(0,0,0,0)
    } else {
      start.setHours(8,0,0,0)
      end.setHours(16,SHIFT_END_MINUTE,0,0)
      breakStart.setHours(12,0,0,0)
    }
    const breakEnd = new Date(breakStart); breakEnd.setMinutes(breakEnd.getMinutes() + 30)
    let elapsed = 0, left = 0
    if (now <= start) left = SHIFT_HOURS
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
      left = Math.max(0, (minutesToEnd - unpaidBreakRemaining) / 60)
    }
    return { shift: SHIFT_HOURS, elapsed: Math.max(0, Math.min(SHIFT_HOURS, elapsed)), left: Math.max(0, Math.min(SHIFT_HOURS, left)) }
  }
  function calc() {
    const s = getState(), day = dayName(s)
    const d = s.weeklyData?.[day] || { assignments:{}, opsMetrics:{} }
    const m = d.opsMetrics || {}
    const builders = new Map((s.builderPool || []).map((b) => [b.id, b]))
    const hc = num(m.manualHeadCount) || Object.entries(d.assignments || {}).filter(([id,a]) => STAFF.has(a.status || 'Present') && !builders.get(id)?.isLineLead).length
    const recovery = first(m, ['recoveredInPrep','recoveryRacks','racksRecovered','racksProcessed','processedRacks','recovery'])
    const prep = first(m, ['racksPrepped','prepRacks','preppedRacks','prep'])
    const media = first(m, ['mediaProcessed','processedMedia','media'])
    const work = recovery + prep + media
    const goal = num(m.goalTph || s.goalTph || 7)
    const liveShift = shiftInfo(s)
    const shift = liveShift.shift
    const elapsed = liveShift.elapsed
    const left = liveShift.left
    const fullGoal = goal * Math.max(hc, 1) * shift
    const goalNow = goal * Math.max(hc, 1) * elapsed
    const current = elapsed > 0 && hc > 0 ? work / elapsed / hc : 0
    const needWork = Math.max(0, fullGoal - work)
    const needTph = left > 0 && hc > 0 ? needWork / left / hc : 0
    const status = current >= goal ? 'On Track' : current >= goal * .85 ? 'Watch' : 'Behind'
    return { recovery, prep, media, work, hc, goal, shift, elapsed, left, fullGoal, goalNow, current, needWork, needTph, status, pace: fullGoal ? Math.round(work / fullGoal * 100) : 0 }
  }
  const whole = (v) => Math.round(Number(v || 0)).toLocaleString()
  const one = (v) => Number(v || 0).toFixed(1)
  function card() {
    const c = calc()
    return `<div class="unweighted-card" data-unweighted-card="true"><div><b>Simple Work / Goal</b><h2>${c.status}</h2><p>Work = Recovery racks + Prep racks + Media. No weighted calculation.</p></div><div class="unweighted-big"><span>Work Done</span><strong>${whole(c.work)}</strong><small>${whole(c.recovery)} recovery + ${whole(c.prep)} prep + ${whole(c.media)} media</small></div><div class="unweighted-grid"><div><span>Full Goal</span><strong>${whole(c.fullGoal)}</strong></div><div><span>Goal Now</span><strong>${whole(c.goalNow)}</strong></div><div><span>Current TPH/HC</span><strong>${one(c.current)}</strong></div><div><span>Need Rest of Shift</span><strong>${whole(c.needWork)}</strong><small>${one(c.needTph)} TPH/HC</small></div><div><span>Hours Left</span><strong>${one(c.left)}</strong><small>${one(c.elapsed)} elapsed</small></div><div><span>Pace</span><strong>${c.pace}%</strong></div></div></div>`
  }
  function style() {
    if (document.getElementById('unweighted-style')) return
    const s = document.createElement('style'); s.id = 'unweighted-style'
    s.textContent = `.unweighted-card{margin:0 0 14px;padding:16px;border:1px solid #d8e1ec;border-radius:22px;background:linear-gradient(180deg,#fff,#f8fbff);box-shadow:0 10px 26px rgba(15,23,42,.06);display:grid;grid-template-columns:1fr 260px;gap:14px}.unweighted-card h2{margin:4px 0;font-size:30px}.unweighted-card p{margin:0;color:#64748b;font-weight:750}.unweighted-card b{text-transform:uppercase;letter-spacing:.06em;color:#64748b;font-size:.76rem}.unweighted-big{text-align:center;background:#eff6ff;border:1px solid #bfdbfe;border-radius:18px;padding:12px}.unweighted-big span,.unweighted-grid span{display:block;text-transform:uppercase;letter-spacing:.055em;color:#64748b;font-size:.72rem;font-weight:950}.unweighted-big strong{display:block;font-size:42px;color:#1d4ed8}.unweighted-big small,.unweighted-grid small{display:block;color:#64748b;font-weight:800;font-size:.74rem}.unweighted-grid{grid-column:1/-1;display:grid;grid-template-columns:repeat(6,1fr);gap:10px}.unweighted-grid div{background:#fff;border:1px solid #e5edf6;border-radius:15px;padding:11px}.unweighted-grid strong{display:block;font-size:24px}.hide-weighted-detail{display:none!important}body[data-theme="dark"] .unweighted-card,body[data-theme="dark"] .unweighted-grid div,body[data-theme="dark"] .unweighted-big{background:#263852;color:#fff;border-color:#536986}body[data-theme="dark"] .unweighted-card p,body[data-theme="dark"] .unweighted-card b,body[data-theme="dark"] .unweighted-big span,body[data-theme="dark"] .unweighted-grid span,body[data-theme="dark"] .unweighted-big small,body[data-theme="dark"] .unweighted-grid small{color:#c8d6eb}@media(max-width:900px){.unweighted-card{grid-template-columns:1fr}.unweighted-grid{grid-template-columns:repeat(2,1fr)}}`
    document.head.appendChild(s)
  }
  function run() {
    style()
    document.querySelectorAll('[data-workgoal-card],[data-unweighted-card]').forEach((x) => x.remove())
    document.querySelectorAll('.kpi,.ops,.summary-card,.progress-card,.dashboard-card').forEach((el) => { const t = (el.textContent || '').toLowerCase(); if (t.includes('weighted')) el.classList.add('hide-weighted-detail') })
    const anchor = Array.from(document.querySelectorAll('.table-kicker,h2,.title')).find((el) => /TPH Reporting|Shift Visual Overview/i.test(el.textContent || ''))
    const host = anchor?.closest('.card,.ops,.summary-card-block,.dashboard-card,.board-shell')
    if (host) host.insertAdjacentHTML('beforebegin', card())
  }
  document.addEventListener('DOMContentLoaded', run)
  setInterval(run, 1600)
  run()
})()
