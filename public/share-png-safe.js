(() => {
  const KEY = 'staffing_board_redo_complete_v2_weekly'
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const STAFFED = new Set(['Present', 'Training', 'Indirect'])
  const ABSENCE = new Set(['PTO', 'LOA', 'VTO', 'Absent'])

  function state() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } }
  function dayName(s) { return DAYS.includes(s.selectedDay) ? s.selectedDay : 'Monday' }
  function dayData(s) { return s.weeklyData?.[dayName(s)] || { assignments: {}, speedLiteTeams: [] } }
  function safe(v, fallback = '') { return String(v ?? fallback).trim() }
  function areaDefs(s) {
    const defs = Array.isArray(s.areaDefs) ? s.areaDefs.map((a) => a.name || a).filter(Boolean) : []
    return defs.length ? defs : ['Unassigned', 'Rack Prep', 'OB1', 'OB2', 'Speed Lite', 'Speed Line 1', 'Speed Line 2', 'Speed Line 3', 'Shipping', 'EOS Pull Racks', 'Projects', 'Learning', '1:1', 'Media Destruction', 'Network Rack Recovery', 'Network Rack Prep']
  }
  function builders(s) {
    const map = new Map((s.builderPool || []).map((b) => [b.id, b]))
    return Object.entries(dayData(s).assignments || {}).map(([id, a]) => {
      const b = map.get(id) || { id, name: id }
      return {
        id,
        name: safe(b.name, id),
        isLineLead: !!b.isLineLead,
        countsAsProductionLabor: !!b.countsAsProductionLabor,
        status: safe(a.status || 'Present'),
        area: safe(a.area || 'Unassigned', 'Unassigned'),
        subArea: safe(a.subArea),
        role: safe(a.role),
        speedLiteTeamId: safe(a.speedLiteTeamId),
      }
    }).sort((a, b) => a.name.localeCompare(b.name))
  }
  function normalizedSpeedLiteTeams(s) {
    const seen = new Set()
    return (Array.isArray(dayData(s).speedLiteTeams) ? dayData(s).speedLiteTeams : [])
      .filter((team) => team && team.id && !seen.has(String(team.id)) && seen.add(String(team.id)))
      .map((team, index) => ({
        id: String(team.id),
        name: safe(team.name, `Team ${index + 1}`),
        targetSize: Math.max(1, Math.min(4, Number(team.targetSize || 2))),
        teamLeadBuilderId: safe(team.teamLeadBuilderId),
      }))
  }
  function teamStatus(targetSize, actual) {
    if (actual <= 0) return 'Empty'
    if (actual < targetSize) return `Needs ${targetSize - actual}`
    if (actual === targetSize) return 'Complete'
    return 'Over Target'
  }
  function speedLiteModel(s, allBuilders) {
    const staffedPeople = allBuilders.filter((b) => b.area === 'Speed Lite' && STAFFED.has(b.status))
    const teams = normalizedSpeedLiteTeams(s).map((team) => {
      const members = staffedPeople.filter((b) => b.speedLiteTeamId === team.id)
      return { ...team, members, status: teamStatus(team.targetSize, members.length) }
    })
    const validIds = new Set(teams.map((team) => team.id))
    const ungrouped = staffedPeople.filter((b) => !validIds.has(b.speedLiteTeamId))
    return { teams, ungrouped, total: staffedPeople.length }
  }
  function grouped(s, allBuilders) {
    const out = {}
    areaDefs(s).forEach((a) => { if (a !== 'Speed Lite') out[a] = [] })
    out['Line Leads'] = []
    out['Not Staffed / Away'] = []
    allBuilders.forEach((b) => {
      if (ABSENCE.has(b.status)) out['Not Staffed / Away'].push(b)
      else if (b.area === 'Speed Lite' && STAFFED.has(b.status)) return
      else if (b.isLineLead && STAFFED.has(b.status)) out['Line Leads'].push(b)
      else { if (!out[b.area]) out[b.area] = []; out[b.area].push(b) }
    })
    return out
  }
  function setup(w, h) {
    const scale = Math.min(2, window.devicePixelRatio || 1.5)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    const ctx = canvas.getContext('2d')
    ctx.scale(scale, scale)
    ctx.textBaseline = 'alphabetic'
    return { canvas, ctx }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.closePath()
  }
  function fill(ctx, x, y, w, h, r, color) { ctx.fillStyle = color; roundRect(ctx, x, y, w, h, r); ctx.fill() }
  function stroke(ctx, x, y, w, h, r, color = '#d8e1ec') { ctx.strokeStyle = color; roundRect(ctx, x, y, w, h, r); ctx.stroke() }
  function text(ctx, value, x, y, font, color = '#172033', align = 'left') { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value, x, y); ctx.textAlign = 'left' }
  function standardBlockHeight(people) { return 70 + people.length * 42 }
  function speedLiteBlockHeight(model) {
    let height = 78
    model.teams.forEach((team) => { height += 45 + Math.max(1, team.members.length) * 34 + 8 })
    if (model.ungrouped.length || !model.teams.length) height += 45 + Math.max(1, model.ungrouped.length) * 34 + 8
    return height + 12
  }
  function renderStandardBlock(ctx, x, y, colW, area, people) {
    const boxH = standardBlockHeight(people)
    fill(ctx, x, y, colW, boxH, 22, '#ffffff'); stroke(ctx, x, y, colW, boxH, 22)
    text(ctx, area, x + 20, y + 34, '950 23px Arial')
    text(ctx, String(people.length), x + colW - 28, y + 34, '950 23px Arial', '#2563eb', 'right')
    ctx.strokeStyle = '#e5edf6'; ctx.beginPath(); ctx.moveTo(x + 18, y + 52); ctx.lineTo(x + colW - 18, y + 52); ctx.stroke()
    people.forEach((person, i) => {
      const yy = y + 82 + i * 42
      text(ctx, person.name, x + 20, yy, '900 18px Arial')
      const detail = [person.status, person.subArea, person.role].filter(Boolean).join(' · ')
      text(ctx, detail || '—', x + 245, yy, '750 14px Arial', '#64748b')
    })
    return boxH
  }
  function renderSpeedLiteBlock(ctx, x, y, colW, model) {
    const boxH = speedLiteBlockHeight(model)
    fill(ctx, x, y, colW, boxH, 22, '#ffffff'); stroke(ctx, x, y, colW, boxH, 22, '#bfdbfe')
    text(ctx, 'Speed Lite Teams', x + 20, y + 34, '950 23px Arial')
    text(ctx, String(model.total), x + colW - 28, y + 34, '950 23px Arial', '#2563eb', 'right')
    text(ctx, `${model.teams.length} configured team${model.teams.length === 1 ? '' : 's'} · ${model.ungrouped.length} ungrouped`, x + 20, y + 57, '800 13px Arial', '#64748b')

    let yy = y + 75
    const drawTeam = (team, isUngrouped = false) => {
      const members = team.members || []
      const target = isUngrouped ? '—' : `${members.length}/${team.targetSize}`
      const status = isUngrouped ? (members.length ? 'Needs grouping' : 'Clear') : team.status
      const headerColor = isUngrouped ? '#fff7ed' : team.status === 'Complete' ? '#ecfdf5' : team.status === 'Over Target' ? '#fff1f2' : team.status === 'Empty' ? '#f8fafc' : '#eff6ff'
      fill(ctx, x + 14, yy, colW - 28, 34, 10, headerColor)
      text(ctx, team.name, x + 26, yy + 23, '900 16px Arial')
      text(ctx, `${target} · ${status}`, x + colW - 26, yy + 23, '850 13px Arial', '#475569', 'right')
      yy += 40
      if (!members.length) {
        text(ctx, 'No builders assigned', x + 32, yy + 20, '750 13px Arial', '#94a3b8')
        yy += 34
      } else {
        members.forEach((person) => {
          const isLead = !isUngrouped && team.teamLeadBuilderId === person.id
          text(ctx, person.name, x + 32, yy + 21, '900 16px Arial')
          const badges = [isLead ? 'Team Lead' : '', person.isLineLead ? 'Line Lead' : '', person.status].filter(Boolean).join(' · ')
          text(ctx, badges, x + 252, yy + 21, '750 13px Arial', isLead ? '#1d4ed8' : '#64748b')
          yy += 34
        })
      }
      yy += 8
    }

    model.teams.forEach((team) => drawTeam(team))
    if (model.ungrouped.length || !model.teams.length) drawTeam({ name: 'Ungrouped Speed Lite Staff', members: model.ungrouped }, true)
    return boxH
  }
  function boardCanvas() {
    const s = state()
    const allBuilders = builders(s)
    const speedLite = speedLiteModel(s, allBuilders)
    const standardGroups = Object.entries(grouped(s, allBuilders)).filter(([, people]) => people.length)
    const blocks = []
    const orderedAreas = areaDefs(s)
    orderedAreas.forEach((area) => {
      if (area === 'Speed Lite') {
        if (speedLite.total || speedLite.teams.length) blocks.push({ type: 'speedLite', area, model: speedLite, height: speedLiteBlockHeight(speedLite) })
      } else {
        const match = standardGroups.find(([name]) => name === area)
        if (match) blocks.push({ type: 'standard', area, people: match[1], height: standardBlockHeight(match[1]) })
      }
    })
    standardGroups.filter(([area]) => !orderedAreas.includes(area)).forEach(([area, people]) => blocks.push({ type: 'standard', area, people, height: standardBlockHeight(people) }))

    const cols = [0, 0, 0]
    blocks.forEach((block) => { const i = cols.indexOf(Math.min(...cols)); cols[i] += block.height + 18 })
    const w = 1600
    const h = Math.max(900, 210 + Math.max(...cols, 0) + 70)
    const { canvas, ctx } = setup(w, h)
    ctx.fillStyle = '#f3f7fb'; ctx.fillRect(0, 0, w, h)
    const grad = ctx.createLinearGradient(32, 24, w - 32, 145); grad.addColorStop(0, '#122a62'); grad.addColorStop(1, '#2563eb')
    fill(ctx, 32, 24, w - 64, 132, 28, grad)
    text(ctx, 'StaffBoard Share Report', 62, 72, '950 38px Arial', '#ffffff')
    text(ctx, 'Board by area with Speed Lite teams', 62, 104, '800 20px Arial', '#dbeafe')
    text(ctx, `${safe(s.boardTitle || 'Board')} · ${dayName(s)} · Week ${safe(s.weekStartDate)} · ${safe(s.boardShift || '')}`, 62, 134, '800 17px Arial', '#bfdbfe')
    const colW = 492, gap = 22, startX = 42, startY = 196, colY = [startY, startY, startY]
    blocks.forEach((block) => {
      const col = colY.indexOf(Math.min(...colY))
      const x = startX + col * (colW + gap)
      const y = colY[col]
      const boxH = block.type === 'speedLite'
        ? renderSpeedLiteBlock(ctx, x, y, colW, block.model)
        : renderStandardBlock(ctx, x, y, colW, block.area, block.people)
      colY[col] += boxH + 18
    })
    text(ctx, 'Current selected day only · Speed Lite teams included · Notes/comments hidden for privacy', 42, h - 34, '800 15px Arial', '#64748b')
    return canvas
  }
  function download(canvas) {
    const s = state()
    const a = document.createElement('a')
    a.download = `staffing-board-share-${dayName(s).toLowerCase()}-${safe(s.weekStartDate || 'week').replaceAll('-', '')}.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
  }
  function addStyle() {
    if (document.getElementById('share-png-safe-style')) return
    const style = document.createElement('style')
    style.id = 'share-png-safe-style'
    style.textContent = `.sharepng-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99982;display:flex;align-items:center;justify-content:center;padding:22px}.sharepng-modal{width:min(600px,95vw);background:white;border:1px solid #d8e1ec;border-radius:22px;box-shadow:0 28px 80px rgba(15,23,42,.35);overflow:hidden}.sharepng-head{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:20px;border-bottom:1px solid #e5edf6}.sharepng-head h2{margin:0;font-size:24px}.sharepng-card{border:1px solid #d8e1ec;background:linear-gradient(180deg,#fff,#f8fbff);border-radius:18px;padding:18px;text-align:left;cursor:pointer;margin:20px;width:calc(100% - 40px)}.sharepng-card strong{display:block;font-size:20px;color:#172033;margin-bottom:8px}.sharepng-card span,.sharepng-note{color:#66748a;font-size:14px;font-weight:700;line-height:1.45}.sharepng-btn{border:0;border-radius:12px;padding:10px 14px;font-weight:900;cursor:pointer;background:#e8eef7;color:#172033}.sharepng-note{padding:0 20px 20px}`
    document.head.appendChild(style)
  }
  function open() {
    addStyle()
    document.querySelectorAll('[data-sharepng-modal]').forEach((e) => e.remove())
    const modal = document.createElement('div')
    modal.dataset.sharepngModal = 'true'
    modal.className = 'sharepng-backdrop'
    modal.innerHTML = `<div class="sharepng-modal"><div class="sharepng-head"><div><h2>Share Staffing PNG</h2><div class="sharepng-note">Clean builder-facing report with Speed Lite teams.</div></div><button class="sharepng-btn" data-close>Close</button></div><button class="sharepng-card" data-export><strong>Board by Area PNG</strong><span>Export the selected day by area, including Speed Lite team names, members, Team Leads, targets, status, and ungrouped staff.</span></button><div class="sharepng-note">Notes/comments remain hidden for privacy.</div></div>`
    document.body.appendChild(modal)
    modal.querySelector('[data-close]').onclick = () => modal.remove()
    modal.querySelector('[data-export]').onclick = () => download(boardCanvas())
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove() })
  }
  window.StaffBoardSharePNG = { open }
})()