(() => {
  const KEY = 'staffing_board_redo_complete_v2_weekly'
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const STAFFED = new Set(['Present', 'Training', 'Indirect'])
  const SHIFT_HOURS = 8
  const RACK_WEIGHT = 6.4

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

  function dayData(state) {
    return state.weeklyData?.[dayName(state)] || { assignments: {}, opsMetrics: {}, rackLists: {} }
  }

  function dayDate(state) {
    const base = /^\d{4}-\d{2}-\d{2}$/.test(String(state.weekStartDate || '')) ? state.weekStartDate : new Date().toISOString().slice(0, 10)
    const d = new Date(base + 'T00:00:00')
    const idx = Math.max(0, DAYS.indexOf(dayName(state)))
    d.setDate(d.getDate() + idx)
    return d
  }

  function fixedLabel(night) {
    return night ? '1:30 AM' : '4:30 PM'
  }

  function windowForShift(state) {
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
    const w = windowForShift(state)
    if (now <= w.start) return { worked: 0, remaining: SHIFT_HOURS, endLabel: fixedLabel(w.night) }
    if (now >= w.end) return { worked: SHIFT_HOURS, remaining: 0, endLabel: fixedLabel(w.night) }
    const minutesSinceStart = (now - w.start) / 60000
    const minutesToEnd = (w.end - now) / 60000
    let breakElapsed = 0
    if (now >= w.breakEnd) breakElapsed = 30
    else if (now > w.breakStart) breakElapsed = (now - w.breakStart) / 60000
    let breakRemaining = 0
    if (now < w.breakStart) breakRemaining = 30
    else if (now < w.breakEnd) breakRemaining = (w.breakEnd - now) / 60000
    return {
      worked: Math.max(0, Math.min(SHIFT_HOURS, (minutesSinceStart - breakElapsed) / 60)),
      remaining: Math.max(0, Math.min(SHIFT_HOURS, (minutesToEnd - breakRemaining) / 60)),
      endLabel: fixedLabel(w.night),
    }
  }

  function num(value) {
    const n = Number(value || 0)
    return Number.isFinite(n) ? n : 0
  }

  function parseRackList(text) {
    return String(text || '').split(/\r?\n|,|;/).map((line) => line.trim()).filter(Boolean)
  }

  function areaType(state, areaName) {
    const name = areaName || 'Unassigned'
    const explicit = (state.areaDefs || []).find((area) => area.name === name)?.areaType
    if (explicit) return explicit
    const normalized = String(name).trim().toLowerCase()
    if (!normalized || normalized === 'unassigned') return 'unassigned'
    if (normalized === 'fa' || normalized === 'fa metal removal') return 'labor_share'
    if (['shipping', 'eos pull racks', 'projects', 'learning', '1:1'].includes(normalized)) return 'support'
    return 'production'
  }

  function tphHeadcount(state, d) {
    const builders = new Map((state.builderPool || []).map((b) => [b.id, b]))
    const isSpeed = String(state.currentBoardId || '').startsWith('speed_')
    if (!isSpeed) {
      const manual = num(d.opsMetrics?.manualHeadCount)
      if (manual > 0) return manual
      return Object.entries(d.assignments || {}).filter(([, assignment]) => STAFFED.has(assignment.status || 'Present')).length
    }
    return Object.entries(d.assignments || {}).filter(([id, assignment]) => {
      const status = assignment.status || 'Present'
      const profile = builders.get(id) || {}
      return STAFFED.has(status) && areaType(state, assignment.area || 'Unassigned') === 'production' && (!profile.isLineLead || profile.countsAsProductionLabor)
    }).length
  }

  function metrics(state) {
    const d = dayData(state)
    const clock = shiftClock(state)
    const hc = tphHeadcount(state, d)
    const recoveryGoal = num(d.opsMetrics?.targetRackMediaRecovery)
    const recoveryDone = Math.max(num(d.opsMetrics?.racksProcessed), parseRackList(d.rackLists?.processed).length)
    const prepGoal = num(d.opsMetrics?.targetRackPrep)
    const prepDone = Math.max(num(d.opsMetrics?.racksPrepped) + num(d.opsMetrics?.recoveredRackPrep), parseRackList(d.rackLists?.prepped).length)
    const mediaGoal = num(d.opsMetrics?.totalMediaCount)
    const mediaDone = num(d.opsMetrics?.mediaProcessed)
    const weightedGoal = ((recoveryGoal + prepGoal) * RACK_WEIGHT) + mediaGoal
    const weightedDone = ((recoveryDone + prepDone) * RACK_WEIGHT) + mediaDone
    const remainingWork = Math.max(0, weightedGoal - weightedDone)
    const live = hc > 0 && clock.worked > 0 ? weightedDone / (hc * clock.worked) : 0
    const required = hc > 0 && clock.remaining > 0 ? remainingWork / (hc * clock.remaining) : 0
    return { ...clock, hc, weightedGoal, weightedDone, live, required }
  }

  function findOpsCard(name) {
    return Array.from(document.querySelectorAll('.ops')).find((card) => {
      return String(card.querySelector('.ops-label')?.textContent || '').trim().toLowerCase() === name.toLowerCase()
    })
  }

  function patchChip(labelText, valueText) {
    Array.from(document.querySelectorAll('.chip')).forEach((chip) => {
      const labelEl = chip.querySelector('span')
      if (String(labelEl?.textContent || '').trim().toLowerCase() !== labelText.toLowerCase()) return
      const val = chip.querySelector('.numchip')
      if (val) val.textContent = valueText
    })
  }

  function patch() {
    const state = readState()
    const m = metrics(state)
    patchChip('Shift ends', m.endLabel)
    const hours = findOpsCard('Hours Worked / Remaining')
    const hoursValue = hours?.querySelector('.ops-value')
    if (hoursValue) hoursValue.textContent = `${m.worked.toFixed(1)}h / ${m.remaining.toFixed(1)}h`
    const status = findOpsCard('Shift TPH Status')
    const statusValue = status?.querySelector('.ops-value')
    const statusSub = status?.querySelector('.ops-sub')
    if (statusValue) statusValue.textContent = m.live.toFixed(1)
    if (statusSub) {
      const gap = m.live - m.required
      const perf = m.weightedDone <= 0 ? 'Not started' : gap >= 0.25 ? 'Ahead' : gap >= -0.25 ? 'On Target' : 'Needs Recovery'
      statusSub.textContent = `Required ${m.required.toFixed(1)} · Live ${m.live.toFixed(1)} · Production HC ${m.hc} · ${perf}${perf !== 'Not started' ? ` ${gap >= 0 ? '+' : ''}${gap.toFixed(1)}` : ''}`
    }
  }

  document.addEventListener('DOMContentLoaded', patch)
  setInterval(patch, 1000)
  setTimeout(patch, 250)
  setTimeout(patch, 1500)
  patch()
})()
