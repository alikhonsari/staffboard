(() => {
  const STATE_KEY = 'staffing_board_redo_complete_v2_weekly'
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const STAFFED = new Set(['Present', 'Training', 'Indirect'])

  function state() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch { return {} }
  }

  function dayName(s) {
    return DAYS.includes(s.selectedDay) ? s.selectedDay : 'Monday'
  }

  function dayData(s) {
    return s.weeklyData?.[dayName(s)] || { assignments: {}, opsMetrics: {} }
  }

  function num(value) {
    const n = Number(value || 0)
    return Number.isFinite(n) ? n : 0
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
    const processed = num(d.opsMetrics?.racksProcessed)
    const prepped = num(d.opsMetrics?.racksPrepped)
    const media = num(d.opsMetrics?.mediaProcessed)
    const totalMedia = num(d.opsMetrics?.totalMediaCount)
    return { processed, prepped, media, totalMedia, total: processed + prepped + media }
  }

  function managerMetrics(s) {
    const d = dayData(s)
    const goal = num(d.opsMetrics?.goalTph || s.goalTph || 7)
    const elapsed = num(d.opsMetrics?.elapsedHours || d.opsMetrics?.hoursElapsed || s.elapsedHours || 0)
    const shift = num(d.opsMetrics?.shiftHours || s.shiftHours || 7.5)
    const remaining = Math.max(0, shift - elapsed)
    const hc = activeHeadcount(s, d)
    const w = workload(d)
    const currentTph = elapsed > 0 && hc > 0 ? w.total / elapsed / hc : 0
    const goalTotal = goal * shift * Math.max(hc, 1)
    const remainingUnits = Math.max(0, goalTotal - w.total)
    const requiredTph = remaining > 0 && hc > 0 ? remainingUnits / remaining / hc : 0
    const projected = currentTph * shift * Math.max(hc, 1)
    const gap = projected - goalTotal
    const pacePct = goalTotal ? Math.round((w.total / goalTotal) * 100) : 0
    const status = currentTph >= goal ? 'On Track' : currentTph >= goal * 0.85 ? 'Watch' : 'Behind'
    const tone = status === 'On Track' ? 'good' : status === 'Watch' ? 'warn' : 'bad'
    const plain = status === 'On Track'
      ? 'Current pace is meeting the goal.'
      : status === 'Watch'
        ? 'Close to goal. Watch staffing, barriers, and next quarter output.'
        : 'Below goal. Need either more output, more staffing, or barrier removal.'
    return { goal, elapsed, shift, remaining, hc, ...w, currentTph, requiredTph, projected, goalTotal, gap, pacePct, status, tone, plain }
  }

  function fmt(value, digits = 1) {
    return Number(value || 0).toFixed(digits)
  }

  function whole(value) {
    return Math.round(Number(value || 0)).toLocaleString()
  }

  function cardHtml(s) {
    const m = managerMetrics(s)
    return `<div class="manager-tph-simple manager-tph-${m.tone}" data-manager-tph="true">
      <div class="manager-tph-top">
        <div>
          <div class="manager-tph-kicker">Manager TPH Summary</div>
          <div class="manager-tph-title">${m.status}</div>
          <div class="manager-tph-note">${m.plain}</div>
        </div>
        <div class="manager-tph-score"><span>Current</span><strong>${fmt(m.currentTph)}</strong><small>TPH / HC</small></div>
      </div>
      <div class="manager-tph-grid">
        <div><span>Goal</span><strong>${fmt(m.goal)}</strong><small>TPH / HC</small></div>
        <div><span>Need Now</span><strong>${fmt(m.requiredTph)}</strong><small>TPH / HC remaining</small></div>
        <div><span>Headcount</span><strong>${whole(m.hc)}</strong><small>active / manual</small></div>
        <div><span>Pace</span><strong>${m.pacePct}%</strong><small>of full-day goal</small></div>
        <div><span>Projected</span><strong>${whole(m.projected)}</strong><small>units by EOS</small></div>
        <div><span>Gap</span><strong>${m.gap >= 0 ? '+' : ''}${whole(m.gap)}</strong><small>vs goal</small></div>
      </div>
      <div class="manager-tph-line"><span style="width:${Math.max(0, Math.min(100, m.pacePct))}%"></span></div>
      <div class="manager-tph-breakdown">Recovery ${whole(m.processed)} · Prep ${whole(m.prepped)} · Media ${whole(m.media)} · Total ${whole(m.total)} · ${fmt(m.elapsed)}h elapsed / ${fmt(m.remaining)}h left</div>
    </div>`
  }

  function addStyle() {
    if (document.getElementById('manager-tph-style')) return
    const style = document.createElement('style')
    style.id = 'manager-tph-style'
    style.textContent = `
      .manager-tph-simple{margin:0 0 14px;padding:16px;border-radius:20px;border:1px solid #d8e1ec;background:linear-gradient(180deg,#fff,#f8fbff);box-shadow:0 10px 26px rgba(15,23,42,.06)}.manager-tph-top{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:12px}.manager-tph-kicker{text-transform:uppercase;letter-spacing:.06em;font-size:.74rem;font-weight:950;color:#64748b}.manager-tph-title{font-size:1.6rem;font-weight:950;color:#172033;line-height:1.05;margin-top:3px}.manager-tph-note{font-size:.9rem;color:#64748b;font-weight:750;margin-top:5px}.manager-tph-score{min-width:118px;text-align:center;border:1px solid #d8e1ec;background:#fff;border-radius:16px;padding:10px}.manager-tph-score span,.manager-tph-grid span{display:block;font-size:.7rem;text-transform:uppercase;letter-spacing:.055em;font-weight:950;color:#64748b}.manager-tph-score strong{display:block;font-size:2rem;line-height:1;color:#172033}.manager-tph-score small,.manager-tph-grid small{display:block;font-size:.72rem;color:#64748b;font-weight:800;margin-top:4px}.manager-tph-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px}.manager-tph-grid div{border:1px solid #e5edf6;background:#fff;border-radius:14px;padding:10px}.manager-tph-grid strong{display:block;font-size:1.35rem;line-height:1.05;color:#172033;margin-top:4px}.manager-tph-line{height:10px;border-radius:999px;background:#e8eef7;overflow:hidden;margin:12px 0 8px}.manager-tph-line span{display:block;height:100%;border-radius:999px;background:#2563eb}.manager-tph-breakdown{font-size:.82rem;color:#64748b;font-weight:800}.manager-tph-good{border-color:#bbf7d0;background:linear-gradient(180deg,#f0fdf4,#fff)}.manager-tph-good .manager-tph-title{color:#166534}.manager-tph-good .manager-tph-line span{background:#16a34a}.manager-tph-warn{border-color:#fed7aa;background:linear-gradient(180deg,#fff7ed,#fff)}.manager-tph-warn .manager-tph-title{color:#9a3412}.manager-tph-warn .manager-tph-line span{background:#f59e0b}.manager-tph-bad{border-color:#fecaca;background:linear-gradient(180deg,#fff1f2,#fff)}.manager-tph-bad .manager-tph-title{color:#991b1b}.manager-tph-bad .manager-tph-line span{background:#ef4444}body[data-theme="dark"] .manager-tph-simple,body[data-theme="dark"] .manager-tph-score,body[data-theme="dark"] .manager-tph-grid div{background:#263852;color:#fff;border-color:#536986}body[data-theme="dark"] .manager-tph-title,body[data-theme="dark"] .manager-tph-score strong,body[data-theme="dark"] .manager-tph-grid strong{color:#fff}body[data-theme="dark"] .manager-tph-kicker,body[data-theme="dark"] .manager-tph-note,body[data-theme="dark"] .manager-tph-breakdown,body[data-theme="dark"] .manager-tph-score span,body[data-theme="dark"] .manager-tph-grid span,body[data-theme="dark"] .manager-tph-score small,body[data-theme="dark"] .manager-tph-grid small{color:#c8d6eb}@media(max-width:1000px){.manager-tph-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:640px){.manager-tph-top{display:block}.manager-tph-score{margin-top:10px}.manager-tph-grid{grid-template-columns:repeat(2,1fr)}}
    `
    document.head.appendChild(style)
  }

  function inject() {
    addStyle()
    document.querySelectorAll('[data-manager-tph]').forEach((x) => x.remove())
    const headings = Array.from(document.querySelectorAll('.table-kicker, h2, .title'))
    const target = headings.find((el) => /TPH Reporting|TPH/i.test(el.textContent || ''))
    const card = target?.closest('.card, .ops, .summary-card-block, .dashboard-card, .board-shell')
    if (card) card.insertAdjacentHTML('beforebegin', cardHtml(state()))
  }

  document.addEventListener('DOMContentLoaded', inject)
  window.addEventListener('staffboard-builder-enhancements-updated', () => setTimeout(inject, 0))
  setInterval(inject, 2500)
  inject()
})()
