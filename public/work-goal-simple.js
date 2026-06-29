(() => {
  const KEY = 'staffing_board_redo_complete_v2_weekly'
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const STAFFED = new Set(['Present', 'Training', 'Indirect'])

  function s() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } }
  function n(v) { const x = Number(v || 0); return Number.isFinite(x) ? x : 0 }
  function day(st) { return DAYS.includes(st.selectedDay) ? st.selectedDay : 'Monday' }
  function data(st) { return st.weeklyData?.[day(st)] || { assignments: {}, opsMetrics: {} } }
  function hc(st, d) {
    const manual = n(d.opsMetrics?.manualHeadCount)
    if (manual) return manual
    const builders = new Map((st.builderPool || []).map((b) => [b.id, b]))
    return Object.entries(d.assignments || {}).filter(([id, a]) => STAFFED.has(a.status || 'Present') && !builders.get(id)?.isLineLead).length
  }
  function calc() {
    const st = s(), d = data(st), m = d.opsMetrics || {}
    const recovery = n(m.racksProcessed)
    const prep = n(m.racksPrepped)
    const media = n(m.mediaProcessed)
    const work = recovery + prep + media
    const headcount = hc(st, d)
    const goalTph = n(m.goalTph || st.goalTph || 7)
    const shiftHours = n(m.shiftHours || st.shiftHours || 7.5)
    const elapsedHours = n(m.elapsedHours || m.hoursElapsed || st.elapsedHours || 0)
    const remainingHours = Math.max(0, shiftHours - elapsedHours)
    const goalNow = goalTph * Math.max(headcount, 1) * elapsedHours
    const fullGoal = goalTph * Math.max(headcount, 1) * shiftHours
    const gapNow = work - goalNow
    const gapEos = work - fullGoal
    const currentTph = elapsedHours > 0 && headcount > 0 ? work / elapsedHours / headcount : 0
    const needWork = Math.max(0, fullGoal - work)
    const needTph = remainingHours > 0 && headcount > 0 ? needWork / remainingHours / headcount : 0
    const pace = fullGoal ? Math.round(work / fullGoal * 100) : 0
    const status = currentTph >= goalTph ? 'On Track' : currentTph >= goalTph * 0.85 ? 'Watch' : 'Behind'
    return { recovery, prep, media, work, headcount, goalTph, shiftHours, elapsedHours, remainingHours, goalNow, fullGoal, gapNow, gapEos, currentTph, needWork, needTph, pace, status }
  }
  function whole(v) { return Math.round(Number(v || 0)).toLocaleString() }
  function one(v) { return Number(v || 0).toFixed(1) }
  function html(c) {
    return `<div class="workgoal-card" data-workgoal-card="true">
      <div class="workgoal-head">
        <div><div class="workgoal-kicker">Simple Work / Goal</div><h2>${c.status}</h2><p>Work = Recovery racks + Prep racks + Media. Nothing weighted.</p></div>
        <div class="workgoal-big"><span>Work Done</span><strong>${whole(c.work)}</strong><small>${whole(c.recovery)} recovery + ${whole(c.prep)} prep + ${whole(c.media)} media</small></div>
      </div>
      <div class="workgoal-grid">
        <div><span>Full Shift Goal</span><strong>${whole(c.fullGoal)}</strong><small>${one(c.goalTph)} goal TPH × ${whole(c.headcount)} HC × ${one(c.shiftHours)}h</small></div>
        <div><span>Goal by Now</span><strong>${whole(c.goalNow)}</strong><small>${one(c.elapsedHours)}h elapsed</small></div>
        <div><span>Gap Right Now</span><strong>${c.gapNow >= 0 ? '+' : ''}${whole(c.gapNow)}</strong><small>work done vs goal by now</small></div>
        <div><span>Need Rest of Shift</span><strong>${whole(c.needWork)}</strong><small>${one(c.needTph)} TPH / HC needed</small></div>
        <div><span>Current TPH / HC</span><strong>${one(c.currentTph)}</strong><small>based on simple work</small></div>
        <div><span>Pace</span><strong>${c.pace}%</strong><small>toward full shift goal</small></div>
      </div>
    </div>`
  }
  function style() {
    if (document.getElementById('workgoal-style')) return
    const el = document.createElement('style')
    el.id = 'workgoal-style'
    el.textContent = `.workgoal-card{margin:0 0 14px;padding:16px;border:1px solid #d8e1ec;border-radius:22px;background:linear-gradient(180deg,#fff,#f8fbff);box-shadow:0 10px 26px rgba(15,23,42,.06)}.workgoal-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:14px}.workgoal-kicker{text-transform:uppercase;letter-spacing:.06em;color:#64748b;font-size:.76rem;font-weight:950}.workgoal-card h2{margin:3px 0;font-size:30px;line-height:1;color:#172033}.workgoal-card p{margin:0;color:#64748b;font-weight:750}.workgoal-big{min-width:250px;text-align:center;background:#eff6ff;border:1px solid #bfdbfe;border-radius:18px;padding:12px}.workgoal-big span,.workgoal-grid span{display:block;text-transform:uppercase;letter-spacing:.055em;color:#64748b;font-size:.72rem;font-weight:950}.workgoal-big strong{display:block;font-size:42px;line-height:1;color:#1d4ed8}.workgoal-big small,.workgoal-grid small{display:block;color:#64748b;font-size:.74rem;font-weight:800;margin-top:4px}.workgoal-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.workgoal-grid div{background:#fff;border:1px solid #e5edf6;border-radius:15px;padding:11px}.workgoal-grid strong{display:block;font-size:25px;line-height:1.05;margin-top:5px;color:#172033}.hide-weighted-detail{display:none!important}body[data-theme="dark"] .workgoal-card,body[data-theme="dark"] .workgoal-grid div,body[data-theme="dark"] .workgoal-big{background:#263852;color:#fff;border-color:#536986}body[data-theme="dark"] .workgoal-card h2,body[data-theme="dark"] .workgoal-grid strong{color:#fff}body[data-theme="dark"] .workgoal-big strong{color:#7dd3fc}body[data-theme="dark"] .workgoal-kicker,body[data-theme="dark"] .workgoal-card p,body[data-theme="dark"] .workgoal-big span,body[data-theme="dark"] .workgoal-grid span,body[data-theme="dark"] .workgoal-big small,body[data-theme="dark"] .workgoal-grid small{color:#c8d6eb}@media(max-width:900px){.workgoal-head{display:block}.workgoal-big{margin-top:12px;min-width:0}.workgoal-grid{grid-template-columns:repeat(2,1fr)}}`
    document.head.appendChild(el)
  }
  function hideWeighted() {
    Array.from(document.querySelectorAll('.kpi,.ops,.summary-card,.progress-card,.dashboard-card')).forEach((el) => {
      const t = (el.textContent || '').toLowerCase()
      if (t.includes('weighted') || t.includes('tph gap vs goal') || t.includes('projected @ 7.5')) el.classList.add('hide-weighted-detail')
    })
  }
  function inject() {
    style()
    hideWeighted()
    document.querySelectorAll('[data-workgoal-card]').forEach((x) => x.remove())
    const target = Array.from(document.querySelectorAll('.table-kicker,h2,.title')).find((el) => /TPH Reporting|Shift Visual Overview/i.test(el.textContent || ''))
    const card = target?.closest('.card,.ops,.summary-card-block,.dashboard-card,.board-shell')
    if (card) card.insertAdjacentHTML('beforebegin', html(calc()))
  }
  document.addEventListener('DOMContentLoaded', inject)
  setInterval(inject, 1800)
  inject()
})()
