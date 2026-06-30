(() => {
  const KEY = 'staffing_board_redo_complete_v2_weekly'
  const SHIFT_HOURS = 8
  const RACK_WEIGHT = 6.4
  const STAFFED = ['Present', 'Training', 'Indirect']
  const OFF = ['PTO', 'LOA', 'VTO', 'Absent']

  function text(el) {
    return String(el?.textContent || '').trim()
  }

  function readState() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
  }

  function activeShiftText() {
    const parts = []
    document.querySelectorAll('.board-header .pill, .png-header-card .small, .auth-section strong').forEach((el) => {
      const value = text(el)
      if (value) parts.push(value)
    })
    return parts.join(' ').toLowerCase()
  }

  function isNightShift() {
    const state = readState()
    const active = `${state.boardShift || ''} ${state.currentBoardId || ''} ${activeShiftText()}`.toLowerCase()
    return active.includes('night shift') || active.includes('· night') || active.includes('night')
  }

  function atToday(hour, minute = 0) {
    const d = new Date()
    d.setHours(hour, minute, 0, 0)
    return d
  }

  function shiftWindow() {
    if (isNightShift()) {
      const start = atToday(17, 0)
      const end = atToday(1, 30)
      const breakStart = atToday(21, 0)
      if (new Date().getHours() < 12) {
        start.setDate(start.getDate() - 1)
      } else {
        end.setDate(end.getDate() + 1)
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
    const { start, end, breakStart, breakEnd } = shiftWindow()
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

  function dayState(state) {
    return state.weeklyData?.[state.selectedDay || 'Monday'] || { assignments: {}, opsMetrics: {} }
  }

  function num(value) {
    const n = Number(value || 0)
    return Number.isFinite(n) ? n : 0
  }

  function headcount(state, day) {
    const manual = num(day.opsMetrics?.manualHeadCount)
    if (manual > 0) return manual
    return Object.values(day.assignments || {}).filter((a) => !OFF.includes(a.status || 'Present')).length
  }

  function activeHeadcount(state, day) {
    const builders = new Map((state.builderPool || []).map((b) => [b.id, b]))
    return Object.entries(day.assignments || {}).filter(([id, a]) => {
      const area = a.area || 'Unassigned'
      const builder = builders.get(id)
      return STAFFED.includes(a.status || 'Present') && area !== 'Unassigned' && !builder?.isLineLead
    }).length
  }

  function tphMetrics() {
    const state = readState()
    const day = dayState(state)
    const ops = day.opsMetrics || {}
    const hours = calcHours()
    const hc = headcount(state, day)
    const activeHc = activeHeadcount(state, day)
    const recoveryGoal = num(ops.targetRackMediaRecovery)
    const recoveryDone = num(ops.racksProcessed)
    const prepGoal = num(ops.targetRackPrep)
    const prepDone = num(ops.racksPrepped) + num(ops.recoveredRackPrep)
    const mediaGoal = num(ops.totalMediaCount)
    const mediaDone = num(ops.mediaProcessed)
    const goal = ((recoveryGoal + prepGoal) * RACK_WEIGHT) + mediaGoal
    const done = ((recoveryDone + prepDone) * RACK_WEIGHT) + mediaDone
    const remainingWork = Math.max(0, goal - done)
    const live = hours.worked > 0 && hc > 0 ? done / (hc * hours.worked) : 0
    const required = hours.remaining > 0 && hc > 0 ? remainingWork / (hc * hours.remaining) : 0
    const outputHr = hours.worked > 0 ? done / hours.worked : 0
    const activeLive = hours.worked > 0 && activeHc > 0 ? done / (activeHc * hours.worked) : 0
    const goalHr = SHIFT_HOURS > 0 ? goal / SHIFT_HOURS : 0
    const goalHc = hc > 0 ? goal / (hc * SHIFT_HOURS) : 0
    const goalActive = activeHc > 0 ? goal / (activeHc * SHIFT_HOURS) : 0
    const gapRequired = live - required
    const gapGoal = live - goalHc
    const label = live <= 0 && done <= 0 ? 'Not started' : gapRequired >= 0.25 ? 'Ahead' : gapRequired >= -0.25 ? 'On Target' : 'Needs Recovery'
    return { hours, hc, live, required, outputHr, activeLive, goalHr, goalHc, goalActive, gapRequired, gapGoal, label, done, goal }
  }

  function findOpsCard(label) {
    return Array.from(document.querySelectorAll('.ops')).find((card) => {
      return text(card.querySelector('.ops-label')).toLowerCase() === label.toLowerCase()
    })
  }

  function setOps(label, value) {
    Array.from(document.querySelectorAll('.ops,.kpi')).forEach((card) => {
      const l = card.querySelector('.ops-label,.kpi-label')
      const v = card.querySelector('.ops-value,.kpi-value')
      if (l && v && text(l).toLowerCase() === label.toLowerCase()) v.textContent = value
    })
  }

  function patchHours() {
    const card = findOpsCard('Hours Worked / Remaining')
    const value = card?.querySelector('.ops-value')
    if (!value) return
    const { worked, remaining } = calcHours()
    value.textContent = `${worked.toFixed(1)}h / ${remaining.toFixed(1)}h`
  }

  function patchTph() {
    const root = Array.from(document.querySelectorAll('.card')).find((card) => /TPH Reporting/i.test(card.textContent || ''))
    if (!root) return
    const m = tphMetrics()
    const status = root.querySelector('.manager-tph-card')
    const value = status?.querySelector('.ops-value')
    const sub = status?.querySelector('.ops-sub')
    if (value) value.textContent = m.label === 'Not started' ? '0.0' : m.live.toFixed(1)
    if (sub) sub.textContent = `Required ${m.required.toFixed(1)} · Live ${m.live.toFixed(1)} · ${m.label}${m.label !== 'Not started' ? ` ${m.gapRequired >= 0 ? '+' : ''}${m.gapRequired.toFixed(1)}` : ''}`
    setOps('Weighted Output / Hr', m.outputHr.toFixed(1))
    setOps('Weighted TPH / Total HC', m.live.toFixed(1))
    setOps('Weighted TPH / Active HC', m.activeLive.toFixed(1))
    setOps('Goal Output / Hr', m.goalHr.toFixed(1))
    setOps('Goal TPH / Total HC', m.goalHc.toFixed(1))
    setOps('Goal TPH / Active HC', m.goalActive.toFixed(1))
    setOps('TPH Gap vs Goal', `${m.gapGoal >= 0 ? '+' : ''}${m.gapGoal.toFixed(1)}`)
    setOps('Weighted Completed', m.done.toFixed(1))
    setOps('Weighted Goal', m.goal.toFixed(1))
    setOps('Total Head Count', String(m.hc))
  }

  function patch() {
    patchHours()
    patchTph()
  }

  document.addEventListener('DOMContentLoaded', patch)
  setInterval(patch, 1000)
  setTimeout(patch, 0)
  setTimeout(patch, 1000)
  setTimeout(patch, 3000)
  patch()
})()
