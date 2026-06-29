(() => {
  const STATE_KEY = 'staffing_board_redo_complete_v2_weekly'
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const STAFFED = new Set(['Present', 'Training', 'Indirect'])
  const ABSENCE = new Set(['PTO', 'LOA', 'VTO', 'Absent'])

  function readState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch { return {} }
  }

  function safe(value, fallback = '') {
    return String(value ?? fallback).trim()
  }

  function selectedDay(state) {
    return DAYS.includes(state.selectedDay) ? state.selectedDay : 'Monday'
  }

  function dayData(state) {
    return state.weeklyData?.[selectedDay(state)] || { assignments: {} }
  }

  function builderMap(state) {
    const map = new Map()
    ;(state.builderPool || []).forEach((b) => { if (b?.id) map.set(b.id, b) })
    Object.values(state.archivedBuilders || {}).forEach((b) => { if (b?.id && !map.has(b.id)) map.set(b.id, b) })
    return map
  }

  function builderName(map, id) {
    return safe(map.get(id)?.name, id)
  }

  function profile(map, id) {
    return map.get(id) || { id, name: id }
  }

  function isLineLead(builder) {
    return !!builder?.isLineLead
  }

  function areaDefs(state) {
    const defs = Array.isArray(state.areaDefs) ? state.areaDefs.map((a) => a.name || a).filter(Boolean) : []
    return defs.length ? defs : ['Unassigned', 'Rack Prep', 'OB1', 'OB2', 'Speed Lite', 'Speed Line 1', 'Speed Line 2', 'Speed Line 3', 'Shipping', 'EOS Pull Racks', 'Projects', 'Learning', '1:1', 'Media Destruction', 'Network Rack Recovery', 'Network Rack Prep']
  }

  function rows(state) {
    const bm = builderMap(state)
    const assignments = dayData(state).assignments || {}
    return Object.entries(assignments).map(([id, a]) => {
      const p = profile(bm, id)
      return {
        id,
        name: builderName(bm, id),
        badge: safe(p.badgeType || 'day').toUpperCase(),
        isLineLead: isLineLead(p),
        status: safe(a.status || 'Present'),
        area: safe(a.area || 'Unassigned', 'Unassigned'),
        subArea: safe(a.subArea),
        role: safe(a.role),
        clockIn: safe(a.clockInTime),
        clockOut: safe(a.leaveTime),
        notes: safe(a.builderNotes || a.comment),
      }
    }).sort((a, b) => a.name.localeCompare(b.name))
  }

  function groupedRows(state) {
    const out = {}
    areaDefs(state).forEach((area) => { out[area] = [] })
    out['Line Leads'] = []
    out['Not Staffed / Away'] = []
    rows(state).forEach((row) => {
      if (row.isLineLead && STAFFED.has(row.status)) out['Line Leads'].push(row)
      else if (ABSENCE.has(row.status)) out['Not Staffed / Away'].push(row)
      else {
        const area = row.area || 'Unassigned'
        if (!out[area]) out[area] = []
        out[area].push(row)
      }
    })
    return out
  }

  function downloadCanvas(canvas, filename) {
    const link = document.createElement('a')
    link.download = filename
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.arcTo(x + w, y, x + w, y + h, radius)
    ctx.arcTo(x + w, y + h, x, y + h, radius)
    ctx.arcTo(x, y + h, x, y, radius)
    ctx.arcTo(x, y, x + w, y, radius)
    ctx.closePath()
  }

  function fillRound(ctx, x, y, w, h, r, fill) {
    ctx.fillStyle = fill
    roundRect(ctx, x, y, w, h, r)
    ctx.fill()
  }

  function strokeRound(ctx, x, y, w, h, r, stroke = '#d8e1ec') {
    ctx.strokeStyle = stroke
    roundRect(ctx, x, y, w, h, r)
    ctx.stroke()
  }

  function wrapText(ctx, text, maxWidth) {
    const words = safe(text).split(/\s+/).filter(Boolean)
    const lines = []
    let line = ''
    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word
      if (ctx.measureText(test).width <= maxWidth) line = test
      else {
        if (line) lines.push(line)
        line = word
      }
    })
    if (line) lines.push(line)
    return lines.length ? lines : ['']
  }

  function drawPill(ctx, x, y, text, fill, color = '#172033') {
    ctx.font = '700 18px Arial'
    const w = Math.ceil(ctx.measureText(text).width) + 24
    fillRound(ctx, x, y, w, 32, 16, fill)
    ctx.fillStyle = color
    ctx.fillText(text, x + 12, y + 22)
    return w
  }

  function measureBoard(state) {
    const groups = groupedRows(state)
    const visibleGroups = Object.entries(groups).filter(([, people]) => people.length)
    const cardHeights = visibleGroups.map(([area, people]) => 74 + people.length * 44)
    const cols = 2
    const colHeights = Array(cols).fill(0)
    cardHeights.forEach((h) => {
      const i = colHeights[0] <= colHeights[1] ? 0 : 1
      colHeights[i] += h + 20
    })
    return Math.max(900, 210 + Math.max(...colHeights) + 70)
  }

  function setupCanvas(width, height) {
    const scale = Math.min(2, window.devicePixelRatio || 1.5)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    ctx.scale(scale, scale)
    ctx.textBaseline = 'alphabetic'
    return { canvas, ctx }
  }

  function drawHeader(ctx, state, title, subtitle, width) {
    const day = selectedDay(state)
    const board = safe(state.boardTitle || 'StaffBoard')
    const week = safe(state.weekStartDate || '')
    const shift = safe(state.boardShift || '')
    const admin = safe(state.adminName || '')
    fillRound(ctx, 30, 24, width - 60, 124, 24, '#163b82')
    const gradient = ctx.createLinearGradient(30, 24, width - 30, 148)
    gradient.addColorStop(0, '#142e64')
    gradient.addColorStop(1, '#2563eb')
    fillRound(ctx, 30, 24, width - 60, 124, 24, gradient)
    ctx.fillStyle = '#ffffff'
    ctx.font = '900 36px Arial'
    ctx.fillText(title, 58, 70)
    ctx.font = '700 18px Arial'
    ctx.fillStyle = '#dbeafe'
    ctx.fillText(subtitle || `${board} · ${day}`, 58, 101)
    ctx.font = '700 16px Arial'
    ctx.fillText(`Week ${week} · ${shift}${admin ? ` · Lead: ${admin}` : ''}`, 58, 130)
    const stamp = new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    ctx.textAlign = 'right'
    ctx.fillStyle = '#bfdbfe'
    ctx.fillText(`Generated ${stamp}`, width - 58, 130)
    ctx.textAlign = 'left'
  }

  function makeBoardCanvas() {
    const state = readState()
    const allRows = rows(state)
    const staffed = allRows.filter((r) => STAFFED.has(r.status)).length
    const height = measureBoard(state)
    const width = 1400
    const { canvas, ctx } = setupCanvas(width, height)
    ctx.fillStyle = '#f3f7fb'
    ctx.fillRect(0, 0, width, height)
    drawHeader(ctx, state, `Staffing Board · ${selectedDay(state)}`, 'Builder share sheet grouped by area', width)

    let pillX = 58
    const pillY = 166
    pillX += drawPill(ctx, pillX, pillY, `Total Assigned ${allRows.length}`, '#e0f2fe', '#075985') + 10
    pillX += drawPill(ctx, pillX, pillY, `Staffed ${staffed}`, '#dcfce7', '#166534') + 10
    pillX += drawPill(ctx, pillX, pillY, `Areas ${Object.values(groupedRows(state)).filter((g) => g.length).length}`, '#ede9fe', '#5b21b6') + 10

    const groups = Object.entries(groupedRows(state)).filter(([, people]) => people.length)
    const colW = 650
    const gap = 30
    const x0 = 50
    const yStart = 220
    const colY = [yStart, yStart]

    groups.forEach(([area, people]) => {
      const col = colY[0] <= colY[1] ? 0 : 1
      const x = x0 + col * (colW + gap)
      const y = colY[col]
      const h = 74 + people.length * 44
      fillRound(ctx, x, y, colW, h, 20, '#ffffff')
      strokeRound(ctx, x, y, colW, h, 20, '#d8e1ec')
      ctx.fillStyle = '#172033'
      ctx.font = '900 24px Arial'
      ctx.fillText(area, x + 22, y + 36)
      ctx.fillStyle = '#2563eb'
      ctx.font = '900 20px Arial'
      ctx.fillText(String(people.length), x + colW - 48, y + 36)
      ctx.strokeStyle = '#e5edf6'
      ctx.beginPath(); ctx.moveTo(x + 20, y + 54); ctx.lineTo(x + colW - 20, y + 54); ctx.stroke()
      people.forEach((p, index) => {
        const yy = y + 84 + index * 44
        ctx.fillStyle = '#0f172a'
        ctx.font = '800 20px Arial'
        ctx.fillText(p.name, x + 22, yy)
        const details = [p.status, p.subArea, p.role, p.clockIn ? `In ${p.clockIn}` : ''].filter(Boolean).join(' · ')
        ctx.fillStyle = '#64748b'
        ctx.font = '700 15px Arial'
        ctx.fillText(details || '—', x + 310, yy)
      })
      colY[col] += h + 20
    })

    ctx.fillStyle = '#64748b'
    ctx.font = '700 15px Arial'
    ctx.fillText('StaffBoard share PNG · Current selected day only · Notes/comments hidden for privacy', 50, height - 34)
    return canvas
  }

  function makeBuilderListCanvas() {
    const state = readState()
    const all = rows(state)
    const width = 1400
    const rowH = 54
    const height = Math.max(900, 250 + all.length * rowH + 80)
    const { canvas, ctx } = setupCanvas(width, height)
    ctx.fillStyle = '#f3f7fb'
    ctx.fillRect(0, 0, width, height)
    drawHeader(ctx, state, `Builder Assignments · ${selectedDay(state)}`, 'Alphabetic list for sharing with builders', width)

    const y0 = 205
    fillRound(ctx, 50, y0 - 42, width - 100, 44, 14, '#e8eef7')
    ctx.fillStyle = '#53647c'
    ctx.font = '900 14px Arial'
    ctx.fillText('BUILDER', 74, y0 - 14)
    ctx.fillText('STATUS', 430, y0 - 14)
    ctx.fillText('AREA', 585, y0 - 14)
    ctx.fillText('ROLE / SUB AREA', 860, y0 - 14)
    ctx.fillText('TIME', 1150, y0 - 14)

    if (!all.length) {
      ctx.fillStyle = '#64748b'
      ctx.font = '800 24px Arial'
      ctx.fillText('No builders assigned for this day.', 74, y0 + 60)
    }

    all.forEach((p, i) => {
      const y = y0 + i * rowH
      fillRound(ctx, 50, y, width - 100, 44, 12, i % 2 === 0 ? '#ffffff' : '#f8fbff')
      strokeRound(ctx, 50, y, width - 100, 44, 12, '#e5edf6')
      ctx.fillStyle = '#172033'
      ctx.font = '900 19px Arial'
      ctx.fillText(p.name, 74, y + 29)
      ctx.font = '800 15px Arial'
      ctx.fillStyle = STAFFED.has(p.status) ? '#166534' : ABSENCE.has(p.status) ? '#9a3412' : '#334155'
      ctx.fillText(p.status || 'Present', 430, y + 28)
      ctx.fillStyle = '#172033'
      ctx.font = '800 16px Arial'
      ctx.fillText(p.isLineLead && STAFFED.has(p.status) ? 'Line Leads' : p.area || 'Unassigned', 585, y + 28)
      ctx.fillStyle = '#475569'
      ctx.font = '700 15px Arial'
      const role = [p.role, p.subArea].filter(Boolean).join(' · ')
      ctx.fillText(role || '—', 860, y + 28)
      const time = [p.clockIn ? `In ${p.clockIn}` : '', p.clockOut ? `Out ${p.clockOut}` : ''].filter(Boolean).join(' · ')
      ctx.fillText(time || '—', 1150, y + 28)
    })

    ctx.fillStyle = '#64748b'
    ctx.font = '700 15px Arial'
    ctx.fillText('StaffBoard share PNG · Current selected day only · Notes/comments hidden for privacy', 50, height - 34)
    return canvas
  }

  function filename(prefix) {
    const state = readState()
    const day = selectedDay(state).toLowerCase()
    const week = safe(state.weekStartDate || 'week').replaceAll('-', '')
    return `${prefix}-${day}-${week}.png`
  }

  function downloadBoard() {
    downloadCanvas(makeBoardCanvas(), filename('staffing-board-share'))
  }

  function downloadBuilders() {
    downloadCanvas(makeBuilderListCanvas(), filename('builder-assignments-share'))
  }

  function openShareModal() {
    document.querySelectorAll('[data-sharepng-modal]').forEach((x) => x.remove())
    const modal = document.createElement('div')
    modal.dataset.sharepngModal = 'true'
    modal.className = 'sharepng-backdrop'
    modal.innerHTML = `
      <div class="sharepng-modal">
        <div class="sharepng-head">
          <div><h2>Share Staffing PNG</h2><div class="sharepng-muted">Download clean PNGs builders can read on their phone.</div></div>
          <button class="sharepng-btn light" data-close-sharepng>Close</button>
        </div>
        <div class="sharepng-grid">
          <button class="sharepng-card" data-download-board><strong>Board by Area PNG</strong><span>Best for showing each area and everyone staffed there.</span></button>
          <button class="sharepng-card" data-download-builders><strong>Builder List PNG</strong><span>Alphabetic list so each person can quickly find themselves.</span></button>
        </div>
        <div class="sharepng-note">Exports only the selected day. Notes/comments are not included.</div>
      </div>`
    document.body.appendChild(modal)
    modal.querySelector('[data-close-sharepng]').onclick = () => modal.remove()
    modal.querySelector('[data-download-board]').onclick = downloadBoard
    modal.querySelector('[data-download-builders]').onclick = downloadBuilders
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove() })
  }

  function addStyle() {
    if (document.getElementById('share-png-style')) return
    const style = document.createElement('style')
    style.id = 'share-png-style'
    style.textContent = `
      .sharepng-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99982;display:flex;align-items:center;justify-content:center;padding:22px}.sharepng-modal{width:min(760px,95vw);background:white;border:1px solid #d8e1ec;border-radius:22px;box-shadow:0 28px 80px rgba(15,23,42,.35);overflow:hidden}.sharepng-head{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:20px;border-bottom:1px solid #e5edf6}.sharepng-head h2{margin:0;font-size:24px}.sharepng-muted,.sharepng-note{color:#66748a;font-size:14px;font-weight:700}.sharepng-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:20px}.sharepng-card{border:1px solid #d8e1ec;background:linear-gradient(180deg,#fff,#f8fbff);border-radius:18px;padding:18px;text-align:left;cursor:pointer;min-height:150px}.sharepng-card strong{display:block;font-size:20px;color:#172033;margin-bottom:8px}.sharepng-card span{color:#66748a;font-size:14px;font-weight:700;line-height:1.45}.sharepng-card:hover{border-color:#2563eb;box-shadow:0 14px 34px rgba(37,99,235,.14)}.sharepng-btn{border:0;border-radius:12px;padding:10px 14px;font-weight:900;cursor:pointer}.sharepng-btn.light{background:#e8eef7;color:#172033}.sharepng-note{padding:0 20px 20px}body[data-theme="dark"] .sharepng-modal{background:#22344e;color:#f4f8ff;border-color:#536986}body[data-theme="dark"] .sharepng-head{border-color:#536986}body[data-theme="dark"] .sharepng-card{background:#263852;border-color:#536986}body[data-theme="dark"] .sharepng-card strong{color:#fff}body[data-theme="dark"] .sharepng-muted,body[data-theme="dark"] .sharepng-note,body[data-theme="dark"] .sharepng-card span{color:#c8d6eb}@media(max-width:700px){.sharepng-grid{grid-template-columns:1fr}}
    `
    document.head.appendChild(style)
  }

  function ensureButtons() {
    addStyle()
    const navs = document.querySelectorAll('.view-tab-grid, .app-nav-tabs, .sidebar-tabs')
    navs.forEach((nav) => {
      if (nav.querySelector('[data-sharepng-button]')) return
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.dataset.sharepngButton = 'true'
      btn.className = nav.classList.contains('view-tab-grid') ? 'secondary sidebar-tab' : 'secondary nav-tab'
      btn.textContent = 'Share PNG'
      btn.addEventListener('click', openShareModal)
      nav.appendChild(btn)
    })
  }

  addStyle()
  document.addEventListener('DOMContentLoaded', ensureButtons)
  setInterval(ensureButtons, 2000)
  ensureButtons()
})()
