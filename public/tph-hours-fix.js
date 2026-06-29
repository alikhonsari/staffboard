(() => {
  const SHIFT_HOURS = 8

  function text(el) {
    return String(el?.textContent || '').trim()
  }

  function activeShiftText() {
    const parts = []
    document.querySelectorAll('.board-header .pill, .png-header-card .small').forEach((el) => {
      const value = text(el)
      if (value) parts.push(value)
    })
    return parts.join(' ').toLowerCase()
  }

  function isNightShift() {
    const active = activeShiftText()
    if (active.includes('night shift') || active.includes('· night')) return true
    if (active.includes('day shift') || active.includes('· day')) return false
    return false
  }

  function atToday(hour, minute = 0) {
    const d = new Date()
    d.setHours(hour, minute, 0, 0)
    return d
  }

  function shiftWindow(now = new Date()) {
    if (isNightShift()) {
      const start = atToday(20, 0)
      const end = atToday(4, 30)
      const breakStart = atToday(0, 0)
      if (now.getHours() < 12) {
        start.setDate(start.getDate() - 1)
      } else {
        end.setDate(end.getDate() + 1)
        breakStart.setDate(breakStart.getDate() + 1)
      }
      const breakEnd = new Date(breakStart)
      breakEnd.setMinutes(breakEnd.getMinutes() + 30)
      return { start, end, breakStart, breakEnd }
    }

    const start = atToday(8, 0)
    const end = atToday(16, 30)
    const breakStart = atToday(12, 0)
    const breakEnd = atToday(12, 30)
    return { start, end, breakStart, breakEnd }
  }

  function calcHours() {
    const now = new Date()
    const { start, end, breakStart, breakEnd } = shiftWindow(now)
    if (now <= start) return { worked: 0, remaining: SHIFT_HOURS }
    if (now >= end) return { worked: SHIFT_HOURS, remaining: 0 }

    const minutesSinceStart = (now - start) / 60000
    const minutesToEnd = (end - now) / 60000

    let breakElapsed = 0
    if (now >= breakEnd) breakElapsed = 30
    else if (now > breakStart) breakElapsed = (now - breakStart) / 60000

    let breakRemaining = 0
    if (now < breakStart) breakRemaining = 30
    else if (now < breakEnd) breakRemaining = (breakEnd - now) / 60000

    const worked = Math.max(0, Math.min(SHIFT_HOURS, (minutesSinceStart - breakElapsed) / 60))
    const remaining = Math.max(0, Math.min(SHIFT_HOURS, (minutesToEnd - breakRemaining) / 60))
    return { worked, remaining }
  }

  function findOpsCard(label) {
    return Array.from(document.querySelectorAll('.ops')).find((card) => {
      return text(card.querySelector('.ops-label')).toLowerCase() === label.toLowerCase()
    })
  }

  function patch() {
    const card = findOpsCard('Hours Worked / Remaining')
    const value = card?.querySelector('.ops-value')
    if (!value) return
    const { worked, remaining } = calcHours()
    value.textContent = `${worked.toFixed(1)}h / ${remaining.toFixed(1)}h`
  }

  document.addEventListener('DOMContentLoaded', patch)
  setInterval(patch, 1000)
  setTimeout(patch, 0)
  setTimeout(patch, 1000)
  setTimeout(patch, 3000)
  patch()
})()
