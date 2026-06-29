(() => {
  const STYLE_ID = 'live-hours-fix-style'

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return
    const s = document.createElement('style')
    s.id = STYLE_ID
    s.textContent = `
      .live-hours-fixed-note{font-size:11px!important;color:#64748b!important;font-weight:800!important;margin-top:3px!important}
      body[data-theme="dark"] .live-hours-fixed-note{color:#c8d6eb!important}
    `
    document.head.appendChild(s)
  }

  function text(el) { return String(el?.textContent || '').trim() }
  function numFromCard(label) {
    const card = Array.from(document.querySelectorAll('.ops,.kpi,.png-meta-pill')).find((el) => text(el.querySelector('.ops-label,.kpi-label,span')).toLowerCase() === label.toLowerCase())
    const raw = text(card?.querySelector('.ops-value,.kpi-value,strong')).replace(/[^0-9.-]/g, '')
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  }
  function findOpsCard(label) {
    return Array.from(document.querySelectorAll('.ops')).find((el) => text(el.querySelector('.ops-label')).toLowerCase() === label.toLowerCase())
  }
  function isNightShift() {
    const pills = Array.from(document.querySelectorAll('.pill')).map(text).join(' ').toLowerCase()
    const page = text(document.querySelector('.board-header')).toLowerCase()
    return pills.includes('night') || page.includes('night shift')
  }
  function makeTodayAt(h, m = 0) {
    const d = new Date()
    d.setHours(h, m, 0, 0)
    return d
  }
  function shiftWindow(now) {
    const night = isNightShift()
    let start, end, breakStart
    if (night) {
      if (now.getHours() < 12) {
        start = makeTodayAt(20, 0)
        start.setDate(start.getDate() - 1)
        end = makeTodayAt(4, 30)
        breakStart = makeTodayAt(0, 0)
      } else {
        start = makeTodayAt(20, 0)
        end = makeTodayAt(4, 30)
        end.setDate(end.getDate() + 1)
        breakStart = makeTodayAt(0, 0)
        breakStart.setDate(breakStart.getDate() + 1)
      }
    } else {
      start = makeTodayAt(8, 0)
      end = makeTodayAt(16, 30)
      breakStart = makeTodayAt(12, 0)
    }
    const breakEnd = new Date(breakStart)
    breakEnd.setMinutes(breakEnd.getMinutes() + 30)
    return { start, end, breakStart, breakEnd }
  }
  function liveHours() {
    const now = new Date()
    const { start, end, breakStart, breakEnd } = shiftWindow(now)
    const shiftHours = 8
    let worked = 0
    let remaining = shiftHours
    if (now <= start) {
      worked = 0
      remaining = shiftHours
    } else if (now >= end) {
      worked = shiftHours
      remaining = 0
    } else {
      const minutesSinceStart = (now - start) / 60000
      const minutesToEnd = (end - now) / 60000
      let unpaidBreakElapsed = 0
      if (now >= breakEnd) unpaidBreakElapsed = 30
      else if (now > breakStart) unpaidBreakElapsed = (now - breakStart) / 60000
      let unpaidBreakRemaining = 0
      if (now < breakStart) unpaidBreakRemaining = 30
      else if (now < breakEnd) unpaidBreakRemaining = (breakEnd - now) / 60000
      worked = Math.max(0, Math.min(shiftHours, (minutesSinceStart - unpaidBreakElapsed) / 60))
      remaining = Math.max(0, Math.min(shiftHours, (minutesToEnd - unpaidBreakRemaining) / 60))
    }
    return { worked, remaining, now }
  }
  function patch() {
    addStyle()
    const h = liveHours()
    const hoursCard = findOpsCard('Hours Worked / Remaining')
    if (hoursCard) {
      const value = hoursCard.querySelector('.ops-value')
      if (value) value.textContent = `${h.worked.toFixed(1)}h / ${h.remaining.toFixed(1)}h`
      let note = hoursCard.querySelector('.live-hours-fixed-note')
      if (!note) {
        note = document.createElement('div')
        note.className = 'live-hours-fixed-note'
        hoursCard.appendChild(note)
      }
      note.textContent = `Live clock · ${h.now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    }

    const weightedGoal = numFromCard('Weighted Goal')
    const weightedDone = numFromCard('Weighted Completed')
    const totalHc = numFromCard('Total Head Count')
    const remainingWork = Math.max(0, weightedGoal - weightedDone)
    const required = totalHc > 0 && h.remaining > 0 ? remainingWork / (totalHc * h.remaining) : 0
    const statusCard = findOpsCard('Shift TPH Status')
    const sub = statusCard?.querySelector('.ops-sub')
    if (sub) {
      sub.textContent = sub.textContent.replace(/Required\s+[0-9.]+/i, `Required ${required.toFixed(1)}`)
    }
  }
  document.addEventListener('DOMContentLoaded', patch)
  setInterval(patch, 1000)
  patch()
})()
