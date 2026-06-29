(() => {
  const KEY = 'staffing_board_redo_complete_v2_weekly'
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const SHIFT_HOURS = 8

  function readState() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
  }
  function dayName(s) {
    return DAYS.includes(s.selectedDay) ? s.selectedDay : 'Monday'
  }
  function isNight(s) {
    return String(s.boardShift || '').toLowerCase().includes('night')
  }
  function dayDate(s) {
    const d = new Date(`${s.weekStartDate || new Date().toISOString().slice(0, 10)}T00:00:00`)
    d.setDate(d.getDate() + Math.max(0, DAYS.indexOf(dayName(s))))
    return d
  }
  function shiftInfo() {
    const s = readState()
    const now = new Date()
    const start = dayDate(s)
    const end = dayDate(s)
    const breakStart = dayDate(s)

    if (isNight(s)) {
      start.setHours(17, 0, 0, 0)
      end.setDate(end.getDate() + 1)
      end.setHours(1, 30, 0, 0)
      breakStart.setHours(21, 0, 0, 0)
    } else {
      start.setHours(8, 0, 0, 0)
      end.setHours(16, 30, 0, 0)
      breakStart.setHours(12, 0, 0, 0)
    }

    const breakEnd = new Date(breakStart)
    breakEnd.setMinutes(breakEnd.getMinutes() + 30)

    let worked = 0
    let remaining = 0
    if (now <= start) {
      remaining = SHIFT_HOURS
    } else if (now >= end) {
      worked = SHIFT_HOURS
    } else {
      const minutesSinceStart = (now - start) / 60000
      const minutesToEnd = (end - now) / 60000
      let unpaidBreakElapsed = 0
      if (now >= breakEnd) unpaidBreakElapsed = 30
      else if (now > breakStart && now < breakEnd) unpaidBreakElapsed = (now - breakStart) / 60000
      let unpaidBreakRemaining = 0
      if (now < breakStart) unpaidBreakRemaining = 30
      else if (now >= breakStart && now < breakEnd) unpaidBreakRemaining = (breakEnd - now) / 60000
      worked = Math.max(0, (minutesSinceStart - unpaidBreakElapsed) / 60)
      remaining = Math.max(0, (minutesToEnd - unpaidBreakRemaining) / 60)
    }

    worked = Math.max(0, Math.min(SHIFT_HOURS, worked))
    remaining = Math.max(0, Math.min(SHIFT_HOURS, remaining))
    return {
      worked,
      remaining,
      startLabel: start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      endLabel: end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    }
  }
  function one(v) { return Number(v || 0).toFixed(1) }

  function patchTphHours() {
    const info = shiftInfo()
    const all = Array.from(document.querySelectorAll('.kpi,.ops,.progress-card,.summary-card,.dashboard-card,.png-meta-pill,.card div'))
    all.forEach((el) => {
      const text = (el.textContent || '').toLowerCase()
      if (text.includes('hours worked') && text.includes('remaining')) {
        const strong = el.querySelector('strong,.kpi-value,.ops-value,.summary-value')
        if (strong) strong.textContent = `${one(info.worked)}h / ${one(info.remaining)}h`
        else if (!el.querySelector('input,textarea,select,button')) el.innerHTML = el.innerHTML.replace(/\d+(?:\.\d+)?h\s*\/\s*\d+(?:\.\d+)?h/i, `${one(info.worked)}h / ${one(info.remaining)}h`)
        el.dataset.shiftTimeFixed = 'true'
        el.title = `Shift ${info.startLabel} - ${info.endLabel}`
      }
      if (text.includes('hours left')) {
        const strong = el.querySelector('strong')
        if (strong) strong.textContent = one(info.remaining)
      }
    })
  }

  function patchManagerModal() {
    const info = shiftInfo()
    document.querySelectorAll('.manager-report-grid div').forEach((el) => {
      const text = (el.textContent || '').toLowerCase()
      if (text.includes('hours left')) {
        const strong = el.querySelector('strong')
        const small = el.querySelector('small')
        if (strong) strong.textContent = one(info.remaining)
        if (small) small.textContent = `${one(info.worked)}h elapsed · ${info.startLabel}-${info.endLabel}`
      }
    })
  }

  function run() {
    patchTphHours()
    patchManagerModal()
  }
  document.addEventListener('DOMContentLoaded', run)
  new MutationObserver(run).observe(document.body, { childList: true, subtree: true })
  setInterval(run, 1000)
  run()
})()
