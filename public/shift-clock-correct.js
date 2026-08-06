(() => {
  const KEY = 'staffing_board_redo_complete_v2_weekly'
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const SHIFT_HOURS = 8

  function readState() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
  }

  function visibleShiftText() {
    return Array.from(document.querySelectorAll('.board-header .pill, .png-header-card .small, .title'))
      .map((el) => String(el.textContent || '').trim().toLowerCase())
      .join(' ')
  }

  function isNight(state) {
    const visible = visibleShiftText()
    if (visible.includes('day shift') || visible.includes('· day')) return false
    if (visible.includes('night shift') || visible.includes('· night')) return true
    return String(`${state.currentBoardId || ''} ${state.boardShift || ''}`).toLowerCase().includes('night')
  }

  function dayName(state) {
    const visible = visibleShiftText()
    const found = DAYS.find((day) => visible.includes(day.toLowerCase()))
    if (found) return found
    return DAYS.includes(state.selectedDay) ? state.selectedDay : 'Monday'
  }

  function dayDate(state) {
    const base = /^\d{4}-\d{2}-\d{2}$/.test(String(state.weekStartDate || ''))
      ? state.weekStartDate
      : new Date().toISOString().slice(0, 10)
    const date = new Date(`${base}T00:00:00`)
    date.setDate(date.getDate() + Math.max(0, DAYS.indexOf(dayName(state))))
    return date
  }

  function fixedEndLabel(night) {
    return night ? '1:30 AM' : '4:30 PM'
  }

  function shiftWindow(state) {
    const night = isNight(state)
    const start = dayDate(state)
    const end = dayDate(state)
    const breakStart = dayDate(state)

    if (night) {
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
    return { start, end, breakStart, breakEnd, night }
  }

  function shiftClock(state) {
    const now = new Date()
    const window = shiftWindow(state)
    if (now <= window.start) return { worked: 0, remaining: SHIFT_HOURS, endLabel: fixedEndLabel(window.night) }
    if (now >= window.end) return { worked: SHIFT_HOURS, remaining: 0, endLabel: fixedEndLabel(window.night) }

    const minutesSinceStart = (now - window.start) / 60000
    const minutesToEnd = (window.end - now) / 60000
    let breakElapsed = 0
    if (now >= window.breakEnd) breakElapsed = 30
    else if (now > window.breakStart) breakElapsed = (now - window.breakStart) / 60000

    let breakRemaining = 0
    if (now < window.breakStart) breakRemaining = 30
    else if (now < window.breakEnd) breakRemaining = (window.breakEnd - now) / 60000

    return {
      worked: Math.max(0, Math.min(SHIFT_HOURS, (minutesSinceStart - breakElapsed) / 60)),
      remaining: Math.max(0, Math.min(SHIFT_HOURS, (minutesToEnd - breakRemaining) / 60)),
      endLabel: fixedEndLabel(window.night),
    }
  }

  function findOpsCard(label) {
    return Array.from(document.querySelectorAll('.ops')).find((card) => {
      return String(card.querySelector('.ops-label')?.textContent || '').trim().toLowerCase() === label.toLowerCase()
    })
  }

  function patchChip(labelText, valueText) {
    Array.from(document.querySelectorAll('.chip')).forEach((chip) => {
      const label = String(chip.querySelector('span')?.textContent || '').trim().toLowerCase()
      if (label !== labelText.toLowerCase()) return
      const value = chip.querySelector('.numchip')
      if (value) value.textContent = valueText
    })
  }

  function patch() {
    const clock = shiftClock(readState())
    patchChip('Shift ends', clock.endLabel)
    const hoursValue = findOpsCard('Hours Worked / Remaining')?.querySelector('.ops-value')
    if (hoursValue) hoursValue.textContent = `${clock.worked.toFixed(1)}h / ${clock.remaining.toFixed(1)}h`
  }

  document.addEventListener('DOMContentLoaded', patch)
  setInterval(patch, 1000)
  setTimeout(patch, 250)
  setTimeout(patch, 1500)
  patch()
})()
