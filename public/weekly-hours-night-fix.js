(() => {
  const KEY = 'staffing_board_redo_complete_v2_weekly'
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const STAFFED = ['Present', 'Training', 'Indirect']

  function readState() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
  }

  function isNight(state) {
    return String(state.boardShift || state.currentBoardId || '').toLowerCase().includes('night')
  }

  function parseTimeToHours(value, night) {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return null
    const parts = value.split(':').map(Number)
    let h = parts[0] + parts[1] / 60
    if (night && h < 12) h += 24
    return h
  }

  function isoToBoardHours(value, night) {
    if (!value) return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    let h = d.getHours() + d.getMinutes() / 60
    if (night && h < 12) h += 24
    return h
  }

  function defaults(night) {
    return night ? { start: 17, end: 25.5 } : { start: 8, end: 16.5 }
  }

  function assignmentHours(assignment, night) {
    const rows = {}
    const def = defaults(night)
    const hist = Array.isArray(assignment.areaHistory) ? assignment.areaHistory : []

    hist.forEach((session) => {
      const area = session && session.area
      if (!area || area === 'Unassigned') return
      const start = isoToBoardHours(session.startIso, night)
      const end = session.endIso ? isoToBoardHours(session.endIso, night) : def.end
      if (start == null || end == null) return
      const hours = Math.max(0, end - start)
      rows[area] = (rows[area] || 0) + hours
    })

    if (!hist.length) {
      const area = assignment.area || ''
      const status = assignment.status || 'Present'
      if (area && area !== 'Unassigned' && STAFFED.includes(status)) {
        const start = parseTimeToHours(assignment.clockInTime, night) ?? def.start
        let end = parseTimeToHours(assignment.leaveTime, night) ?? def.end
        if (night && end < start) end += 24
        rows[area] = Math.max(0, end - start)
      }
    }

    return rows
  }

  function weeklyRows(state) {
    const night = isNight(state)
    const rows = []
    ;(state.builderPool || []).forEach((builder) => {
      const byArea = {}
      DAYS.forEach((day) => {
        const assignment = state.weeklyData?.[day]?.assignments?.[builder.id]
        if (!assignment) return
        const totals = assignmentHours(assignment, night)
        Object.entries(totals).forEach(([area, hours]) => {
          byArea[area] = (byArea[area] || 0) + hours
        })
      })
      Object.entries(byArea).forEach(([area, hours]) => {
        rows.push({ builder: builder.name, area, hours: Number(hours.toFixed(2)) })
      })
    })
    return rows
  }

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] || '&#039;'))
  }

  function findCard() {
    const title = Array.from(document.querySelectorAll('.table-kicker')).find((el) => /Weekly Hours Summary/i.test(el.textContent || ''))
    return title?.closest('.summary-card-block,.card') || null
  }

  function patch() {
    const card = findCard()
    if (!card) return
    const state = readState()
    const rows = weeklyRows(state)
    const note = card.querySelector('.small')
    if (note) note.textContent = isNight(state)
      ? 'Total staffed hours by builder and area for Monday to Friday. Night Shift uses 5:00 PM to 1:30 AM board-day time.'
      : 'Total staffed hours by builder and area for Monday to Friday. Day Shift uses 8:00 AM to 4:30 PM board-day time.'
    const tbody = card.querySelector('tbody')
    if (!tbody) return
    tbody.innerHTML = rows.length
      ? rows.map((r) => `<tr><td>${esc(r.builder)}</td><td>${esc(r.area)}</td><td>${Number(r.hours).toFixed(2)}</td></tr>`).join('')
      : '<tr><td colspan="3" class="small">No weekly hours captured yet.</td></tr>'
  }

  document.addEventListener('DOMContentLoaded', patch)
  setInterval(patch, 1000)
  setTimeout(patch, 500)
  setTimeout(patch, 2000)
})()
