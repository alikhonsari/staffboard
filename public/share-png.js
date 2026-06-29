(() => {
  const STATE_KEY = 'staffing_board_redo_complete_v2_weekly'
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const STAFFED = new Set(['Present', 'Training', 'Indirect'])
  const ABSENCE = new Set(['PTO', 'LOA', 'VTO', 'Absent'])

  function readState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch { return {} }
  }
  function safe(value, fallback = '') { return String(value ?? fallback).trim() }
  function num(value) { const n = Number(value || 0); return Number.isFinite(n) ? n : 0 }
  function selectedDay(s) { return DAYS.includes(s.selectedDay) ? s.selectedDay : 'Monday' }
  function dayData(s) { return s.weeklyData?.[selectedDay(s)] || { assignments: {}, opsMetrics: {} } }
  function builderMap(s) {
    const map = new Map()
    ;(s.builderPool || []).forEach((b) => { if (b?.id) map.set(b.id, b) })
    Object.values(s.archivedBuilders || {}).forEach((b) => { if (b?.id && !map.has(b.id)) map.set(b.id, b) })
    return map
  }
  function areaDefs(s) {
    const defs = Array.isArray(s.areaDefs) ? s.areaDefs.map((a) => a.name || a).filter(Boolean) : []
    return defs.length ? defs : ['Unassigned', 'Rack Prep', 'OB1', 'OB2', 'Speed Lite', 'Speed Line 1', 'Speed Line 2', 'Speed Line 3', 'Shipping', 'EOS Pull Racks', 'Projects', 'Learning', '1:1', 'Media Destruction', 'Network Rack Recovery', 'Network Rack Prep']
  }
  function activeHeadcount(s, d) {
    const map = builderMap(s)
    const manual = num(d.opsMetrics?.manualHeadCount)
    if (manual) return manual
    return Object.entries(d.assignments || {}).filter(([id, a]) => STAFFED.has(a.status || 'Present') && !map.get(id)?.isLineLead).length
  }
  function tph(s) {
    const d = dayData(s)
    const hc = activeHeadcount(s, d)
    const goal = num(d.opsMetrics?.goalTph || s.goalTph || 7)
    const elapsed = num(d.opsMetrics?.elapsedHours || d.opsMetrics?.hoursElapsed || s.elapsedHours || 0)
    const shift = num(d.opsMetrics?.shiftHours || s.shiftHours || 7.5)
    const remaining = Math.max(0, shift - elapsed)
    const recovery = num(d.opsMetrics?.racksProcessed)
    const prep = num(d.opsMetrics?.racksPrepped)
    const media = num(d.opsMetrics?.mediaProcessed)
    const total = recovery + prep + media
    const current = elapsed > 0 && hc > 0 ? total / elapsed / hc : 0
    const goalUnits = goal * shift * Math.max(hc, 1)
    const projected = current * shift * Math.max(hc, 1)
    const gap = projected - goalUnits
    const pace = goalUnits ? Math.round(total / goalUnits * 100) : 0
    const status = current >= goal ? 'ON TRACK' : current >= goal * 0.85 ? 'WATCH' : 'BEHIND'
    return { hc, goal, elapsed, shift, remaining, recovery, prep, media, total, current, projected, gap, pace, status }
  }
  function rows(s) {
    const map = builderMap(s)
    return Object.entries(dayData(s).assignments || {}).map(([id, a]) => {
      const b = map.get(id) || { id, name: id }
      return {
        id,
        name: safe(b.name, id),
        isLineLead: !!b.isLineLead,
        status: safe(a.status || 'Present'),
        area: safe(a.area || 'Unassigned', 'Unassigned'),
        subArea: safe(a.subArea),
        role: safe(a.role),
        clockIn: safe(a.clockInTime),
        clockOut: safe(a.leaveTime),
      }
    }).sort((a, b) => a.name.localeCompare(b.name))
  }
  function groupedRows(s) {
    const out = {}
    areaDefs(s).forEach((a) => { out[a] = [] })
    out['Line Leads'] = []
    out['Not Staffed / Away'] = []
    rows(s).forEach((r) => {
      if (r.isLineLead && STAFFED.has(r.status)) out['Line Leads'].push(r)
      else if (ABSENCE.has(r.status)) out['Not Staffed / Away'].push(r)
      else { if (!out[r.area]) out[r.area] = []; out[r.area].push(r) }
    })
    return out
  }
  function setup(w, h) {
    const scale = Math.min(2, window.devicePixelRatio || 1.5)
    const c = document.createElement('canvas')
    c.width = Math.round(w * scale); c.height = Math.round(h * scale)
    const x = c.getContext('2d'); x.scale(scale, scale); x.textBaseline = 'alphabetic'
    return { c, x }
  }
  function rr(x, a, b, w, h, r) {
    x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath()
  }
  function fill(x, a, b, w, h, r, color) { x.fillStyle = color; rr(x, a, b, w, h, r); x.fill() }
  function stroke(x, a, b, w, h, r, color = '#d8e1ec') { x.strokeStyle = color; rr(x, a, b, w, h, r); x.stroke() }
  function text(x, t, a, b, font, color = '#172033', align = 'left') { x.font = font; x.fillStyle = color; x.textAlign = align; x.fillText(t, a, b); x.textAlign = 'left' }
  function pill(x, a, b, label, value, color) {
    fill(x, a, b, 178, 62, 18, '#ffffff'); stroke(x, a, b, 178, 62, 18, '#d8e1ec')
    text(x, label, a + 14, b + 22, '900 13px Arial', '#64748b')
    text(x, value, a + 14, b + 49, '950 26px Arial', color)
  }
  function header(x, s, w, subtitle) {
    const g = x.createLinearGradient(32, 24, w - 32, 150); g.addColorStop(0, '#122a62'); g.addColorStop(1, '#2563eb')
    fill(x, 32, 24, w - 64, 132, 28, g)
    text(x, 'StaffBoard Share Report', 62, 72, '950 38px Arial', '#ffffff')
    text(x, subtitle, 62, 104, '800 20px Arial', '#dbeafe')
    text(x, `${safe(s.boardTitle || 'Board')} · ${selectedDay(s)} · Week ${safe(s.weekStartDate)} · ${safe(s.boardShift || '')}`, 62, 134, '800 17px Arial', '#bfdbfe')
    text(x, new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), w - 62, 134, '800 17px Arial', '#bfdbfe', 'right')
  }
  function drawSummary(x, s, y, w) {
    const m = tph(s)
    const statusColor = m.status === 'ON TRACK' ? '#166534' : m.status === 'WATCH' ? '#b45309' : '#991b1b'
    fill(x, 32, y, w - 64, 100, 24, '#ffffff'); stroke(x, 32, y, w - 64, 100, 24, '#d8e1ec')
    text(x, 'Manager snapshot', 58, y + 30, '950 16px Arial', '#64748b')
    text(x, m.status, 58, y + 70, '950 34px Arial', statusColor)
    const start = 285
    pill(x, start, y + 18, 'Current TPH/HC', m.current.toFixed(1), '#172033')
    pill(x, start + 192, y + 18, 'Goal TPH/HC', m.goal.toFixed(1), '#172033')
    pill(x, start + 384, y + 18, 'Pace', `${m.pace}%`, statusColor)
    pill(x, start + 576, y + 18, 'Projected Gap', `${m.gap >= 0 ? '+' : ''}${Math.round(m.gap)}`, statusColor)
    pill(x, start + 768, y + 18, 'Headcount', String(m.hc), '#172033')
  }
  function boardHeight(s) {
    const groups = Object.values(groupedRows(s)).filter((g) => g.length)
    const cols = [0, 0, 0]
    groups.forEach((people) => { const i = cols.indexOf(Math.min(...cols)); cols[i] += 76 + people.length * 42 + 18 })
    return Math.max(900, 310 + Math.max(...cols) + 70)
  }
  function boardCanvas() {
    const s = readState(); const w = 1600; const h = boardHeight(s); const { c, x } = setup(w, h)
    x.fillStyle = '#f3f7fb'; x.fillRect(0, 0, w, h); header(x, s, w, 'Board by area for builders'); drawSummary(x, s, 176, w)
    const groups = Object.entries(groupedRows(s)).filter(([, p]) => p.length)
    const colW = 492, gap = 22, startX = 42, startY = 306, colY = [startY, startY, startY]
    groups.forEach(([area, people]) => {
      const col = colY.indexOf(Math.min(...colY)), a = startX + col * (colW + gap), b = colY[col], h2 = 70 + people.length * 42
      fill(x, a, b, colW, h2, 22, '#ffffff'); stroke(x, a, b, colW, h2, 22)
      text(x, area, a + 20, b + 34, '950 23px Arial', '#172033'); text(x, String(people.length), a + colW - 28, b + 34, '950 23px Arial', '#2563eb', 'right')
      x.strokeStyle = '#e5edf6'; x.beginPath(); x.moveTo(a + 18, b + 52); x.lineTo(a + colW - 18, b + 52); x.stroke()
      people.forEach((p, i) => {
        const yy = b + 82 + i * 42
        text(x, p.name, a + 20, yy, '900 18px Arial')
        const detail = [p.status, p.subArea, p.role].filter(Boolean).join(' · ')
        text(x, detail || '—', a + 245, yy, '750 14px Arial', '#64748b')
      })
      colY[col] += h2 + 18
    })
    text(x, 'Current selected day only · Notes/comments hidden for privacy', 42, h - 34, '800 15px Arial', '#64748b')
    return c
  }
  function builderCanvas() {
    const s = readState(); const all = rows(s); const w = 1600; const h = Math.max(900, 315 + all.length * 52 + 70); const { c, x } = setup(w, h)
    x.fillStyle = '#f3f7fb'; x.fillRect(0, 0, w, h); header(x, s, w, 'Alphabetic builder assignment list'); drawSummary(x, s, 176, w)
    const y0 = 325
    fill(x, 42, y0 - 44, w - 84, 44, 16, '#e8eef7')
    ;[['BUILDER',70],['STATUS',430],['AREA',590],['ROLE / SUB AREA',880],['TIME',1250]].forEach(([t, a]) => text(x, t, a, y0 - 15, '950 14px Arial', '#53647c'))
    all.forEach((p, i) => {
      const y = y0 + i * 52
      fill(x, 42, y, w - 84, 42, 14, i % 2 ? '#f8fbff' : '#ffffff'); stroke(x, 42, y, w - 84, 42, 14, '#e5edf6')
      text(x, p.name, 70, y + 27, '950 18px Arial')
      text(x, p.status, 430, y + 27, '900 15px Arial', STAFFED.has(p.status) ? '#166534' : '#9a3412')
      text(x, p.isLineLead && STAFFED.has(p.status) ? 'Line Leads' : p.area || 'Unassigned', 590, y + 27, '900 16px Arial')
      text(x, [p.role, p.subArea].filter(Boolean).join(' · ') || '—', 880, y + 27, '750 15px Arial', '#64748b')
      text(x, [p.clockIn ? `In ${p.clockIn}` : '', p.clockOut ? `Out ${p.clockOut}` : ''].filter(Boolean).join(' · ') || '—', 1250, y + 27, '750 15px Arial', '#64748b')
    })
    if (!all.length) text(x, 'No builders assigned for this day.', 70, y0 + 70, '900 26px Arial', '#64748b')
    text(x, 'Current selected day only · Notes/comments hidden for privacy', 42, h - 34, '800 15px Arial', '#64748b')
    return c
  }
  function dl(canvas, name) { const a = document.createElement('a'); a.download = name; a.href = canvas.toDataURL('image/png'); a.click() }
  function fname(prefix) { const s = readState(); return `${prefix}-${selectedDay(s).toLowerCase()}-${safe(s.weekStartDate || 'week').replaceAll('-', '')}.png` }
  function openModal() {
    document.querySelectorAll('[data-sharepng-modal]').forEach((e) => e.remove())
    const m = document.createElement('div'); m.dataset.sharepngModal = 'true'; m.className = 'sharepng-backdrop'
    m.innerHTML = `<div class="sharepng-modal"><div class="sharepng-head"><div><h2>Share Staffing PNG</h2><div class="sharepng-muted">Clean builder-facing PNG reports with manager TPH snapshot.</div></div><button class="sharepng-btn light" data-close-sharepng>Close</button></div><div class="sharepng-grid"><button class="sharepng-card" data-board><strong>Board by Area PNG</strong><span>Best to post for the team: each area with staffed builders.</span></button><button class="sharepng-card" data-list><strong>Builder List PNG</strong><span>Alphabetical list so every builder finds their assignment fast.</span></button></div><div class="sharepng-note">Exports the selected day only. Notes/comments are not included.</div></div>`
    document.body.appendChild(m); m.querySelector('[data-close-sharepng]').onclick = () => m.remove(); m.querySelector('[data-board]').onclick = () => dl(boardCanvas(), fname('staffing-board-share')); m.querySelector('[data-list]').onclick = () => dl(builderCanvas(), fname('builder-assignments-share')); m.addEventListener('click', (e) => { if (e.target === m) m.remove() })
  }
  function style() {
    if (document.getElementById('share-png-style')) return
    const st = document.createElement('style'); st.id = 'share-png-style'; st.textContent = `.sharepng-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99982;display:flex;align-items:center;justify-content:center;padding:22px}.sharepng-modal{width:min(760px,95vw);background:white;border:1px solid #d8e1ec;border-radius:22px;box-shadow:0 28px 80px rgba(15,23,42,.35);overflow:hidden}.sharepng-head{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:20px;border-bottom:1px solid #e5edf6}.sharepng-head h2{margin:0;font-size:24px}.sharepng-muted,.sharepng-note{color:#66748a;font-size:14px;font-weight:700}.sharepng-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:20px}.sharepng-card{border:1px solid #d8e1ec;background:linear-gradient(180deg,#fff,#f8fbff);border-radius:18px;padding:18px;text-align:left;cursor:pointer;min-height:150px}.sharepng-card strong{display:block;font-size:20px;color:#172033;margin-bottom:8px}.sharepng-card span{color:#66748a;font-size:14px;font-weight:700;line-height:1.45}.sharepng-card:hover{border-color:#2563eb;box-shadow:0 14px 34px rgba(37,99,235,.14)}.sharepng-btn{border:0;border-radius:12px;padding:10px 14px;font-weight:900;cursor:pointer}.sharepng-btn.light{background:#e8eef7;color:#172033}.sharepng-note{padding:0 20px 20px}body[data-theme="dark"] .sharepng-modal{background:#22344e;color:#f4f8ff;border-color:#536986}body[data-theme="dark"] .sharepng-head{border-color:#536986}body[data-theme="dark"] .sharepng-card{background:#263852;border-color:#536986}body[data-theme="dark"] .sharepng-card strong{color:#fff}body[data-theme="dark"] .sharepng-muted,body[data-theme="dark"] .sharepng-note,body[data-theme="dark"] .sharepng-card span{color:#c8d6eb}@media(max-width:700px){.sharepng-grid{grid-template-columns:1fr}}`; document.head.appendChild(st)
  }
  function buttons() {
    style(); document.querySelectorAll('.view-tab-grid,.app-nav-tabs,.sidebar-tabs').forEach((nav) => { if (nav.querySelector('[data-sharepng-button]')) return; const b = document.createElement('button'); b.type = 'button'; b.dataset.sharepngButton = 'true'; b.className = nav.classList.contains('view-tab-grid') ? 'secondary sidebar-tab' : 'secondary nav-tab'; b.textContent = 'Share PNG'; b.onclick = openModal; nav.appendChild(b) })
  }
  document.addEventListener('DOMContentLoaded', buttons); setInterval(buttons, 2000); buttons()
})()
