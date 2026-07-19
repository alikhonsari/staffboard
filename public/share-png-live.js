(() => {
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const STAFFED = new Set(['Present', 'Training', 'Indirect'])
  const ABSENCE = new Set(['PTO', 'LOA', 'VTO', 'Absent'])

  const safe = (value, fallback = '') => String(value ?? fallback).trim()
  const liveState = () => window.__STAFFBOARD_SHARE_STATE__ || null
  const dayName = (state) => DAYS.includes(state?.selectedDay) ? state.selectedDay : 'Monday'
  const dayData = (state) => state?.weeklyData?.[dayName(state)] || { assignments: {}, speedLiteTeams: [] }
  const areaDefs = (state) => {
    const defs = Array.isArray(state?.areaDefs) ? state.areaDefs.map((area) => area?.name || area).filter(Boolean) : []
    return defs.length ? defs : ['Unassigned', 'Rack Prep', 'OB1', 'OB2', 'Speed Lite', 'Speed Line 1', 'Speed Line 2', 'Speed Line 3', 'Shipping', 'EOS Pull Racks', 'Projects', 'Learning', '1:1']
  }

  function builders(state) {
    const pool = new Map((state?.builderPool || []).map((builder) => [builder.id, builder]))
    return Object.entries(dayData(state).assignments || {}).map(([id, assignment]) => {
      const builder = pool.get(id) || { id, name: id }
      return {
        id,
        name: safe(builder.name, id),
        isLineLead: Boolean(builder.isLineLead),
        status: safe(assignment.status || 'Present'),
        area: safe(assignment.area || 'Unassigned', 'Unassigned'),
        subArea: safe(assignment.subArea),
        role: safe(assignment.role),
        speedLiteTeamId: safe(assignment.speedLiteTeamId),
      }
    }).sort((a, b) => a.name.localeCompare(b.name))
  }

  function speedLiteModel(state, people) {
    const staffed = people.filter((person) => person.area === 'Speed Lite' && STAFFED.has(person.status))
    const seen = new Set()
    const teams = (Array.isArray(dayData(state).speedLiteTeams) ? dayData(state).speedLiteTeams : [])
      .filter((team) => team?.id && !seen.has(String(team.id)) && seen.add(String(team.id)))
      .map((team, index) => {
        const id = String(team.id)
        const members = staffed.filter((person) => person.speedLiteTeamId === id)
        const targetSize = Math.max(1, Math.min(4, Number(team.targetSize || 2)))
        const status = members.length === 0 ? 'Empty' : members.length < targetSize ? `Needs ${targetSize - members.length}` : members.length === targetSize ? 'Complete' : 'Over Target'
        return { id, name: safe(team.name, `Team ${index + 1}`), targetSize, teamLeadBuilderId: safe(team.teamLeadBuilderId), members, status }
      })
    const validIds = new Set(teams.map((team) => team.id))
    return { teams, ungrouped: staffed.filter((person) => !validIds.has(person.speedLiteTeamId)), total: staffed.length }
  }

  function grouped(state, people) {
    const groups = {}
    areaDefs(state).forEach((area) => { if (area !== 'Speed Lite') groups[area] = [] })
    groups['Line Leads'] = []
    groups['Not Staffed / Away'] = []
    people.forEach((person) => {
      if (ABSENCE.has(person.status)) groups['Not Staffed / Away'].push(person)
      else if (person.area === 'Speed Lite' && STAFFED.has(person.status)) return
      else if (person.isLineLead && STAFFED.has(person.status)) groups['Line Leads'].push(person)
      else {
        if (!groups[person.area]) groups[person.area] = []
        groups[person.area].push(person)
      }
    })
    return groups
  }

  function setup(width, height) {
    const scale = Math.min(2, window.devicePixelRatio || 1.5)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')
    ctx.scale(scale, scale)
    ctx.textBaseline = 'alphabetic'
    return { canvas, ctx }
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.arcTo(x + width, y, x + width, y + height, radius)
    ctx.arcTo(x + width, y + height, x, y + height, radius)
    ctx.arcTo(x, y + height, x, y, radius)
    ctx.arcTo(x, y, x + width, y, radius)
    ctx.closePath()
  }
  function fill(ctx, x, y, width, height, radius, color) { ctx.fillStyle = color; roundRect(ctx, x, y, width, height, radius); ctx.fill() }
  function stroke(ctx, x, y, width, height, radius, color = '#d8e1ec') { ctx.strokeStyle = color; roundRect(ctx, x, y, width, height, radius); ctx.stroke() }
  function text(ctx, value, x, y, font, color = '#172033', align = 'left') { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value, x, y); ctx.textAlign = 'left' }

  function standardHeight(people) { return 70 + people.length * 42 }
  function speedHeight(model) {
    let height = 78
    model.teams.forEach((team) => { height += 45 + Math.max(1, team.members.length) * 34 + 8 })
    if (model.ungrouped.length || !model.teams.length) height += 45 + Math.max(1, model.ungrouped.length) * 34 + 8
    return height + 12
  }

  function renderStandard(ctx, x, y, width, area, people) {
    const height = standardHeight(people)
    fill(ctx, x, y, width, height, 22, '#ffffff'); stroke(ctx, x, y, width, height, 22)
    text(ctx, area, x + 20, y + 34, '950 23px Arial')
    text(ctx, String(people.length), x + width - 28, y + 34, '950 23px Arial', '#2563eb', 'right')
    people.forEach((person, index) => {
      const yy = y + 82 + index * 42
      text(ctx, person.name, x + 20, yy, '900 18px Arial')
      text(ctx, [person.status, person.subArea, person.role].filter(Boolean).join(' · ') || '—', x + 245, yy, '750 14px Arial', '#64748b')
    })
    return height
  }

  function renderSpeed(ctx, x, y, width, model) {
    const height = speedHeight(model)
    fill(ctx, x, y, width, height, 22, '#ffffff'); stroke(ctx, x, y, width, height, 22, '#bfdbfe')
    text(ctx, 'Speed Lite Teams', x + 20, y + 34, '950 23px Arial')
    text(ctx, String(model.total), x + width - 28, y + 34, '950 23px Arial', '#2563eb', 'right')
    let yy = y + 75
    const draw = (team, ungrouped = false) => {
      const members = team.members || []
      fill(ctx, x + 14, yy, width - 28, 34, 10, ungrouped ? '#fff7ed' : '#eff6ff')
      text(ctx, team.name, x + 26, yy + 23, '900 16px Arial')
      text(ctx, ungrouped ? `${members.length} · Needs grouping` : `${members.length}/${team.targetSize} · ${team.status}`, x + width - 26, yy + 23, '850 13px Arial', '#475569', 'right')
      yy += 40
      if (!members.length) { text(ctx, 'No builders assigned', x + 32, yy + 20, '750 13px Arial', '#94a3b8'); yy += 34 }
      else members.forEach((person) => {
        text(ctx, person.name, x + 32, yy + 21, '900 16px Arial')
        text(ctx, [team.teamLeadBuilderId === person.id ? 'Team Lead' : '', person.isLineLead ? 'Line Lead' : '', person.status].filter(Boolean).join(' · '), x + 252, yy + 21, '750 13px Arial', '#64748b')
        yy += 34
      })
      yy += 8
    }
    model.teams.forEach((team) => draw(team))
    if (model.ungrouped.length || !model.teams.length) draw({ name: 'Ungrouped Speed Lite Staff', members: model.ungrouped }, true)
    return height
  }

  function boardCanvas() {
    const state = liveState()
    if (!state) throw new Error('StaffBoard is still loading. Wait for Sync status: Synced and try again.')
    const people = builders(state)
    const speed = speedLiteModel(state, people)
    const groups = Object.entries(grouped(state, people)).filter(([, rows]) => rows.length)
    const blocks = []
    const ordered = areaDefs(state)
    ordered.forEach((area) => {
      if (area === 'Speed Lite') {
        if (speed.total || speed.teams.length) blocks.push({ type: 'speed', model: speed, height: speedHeight(speed) })
      } else {
        const match = groups.find(([name]) => name === area)
        if (match) blocks.push({ type: 'standard', area, people: match[1], height: standardHeight(match[1]) })
      }
    })
    groups.filter(([area]) => !ordered.includes(area)).forEach(([area, rows]) => blocks.push({ type: 'standard', area, people: rows, height: standardHeight(rows) }))

    const columns = [0, 0, 0]
    blocks.forEach((block) => { const index = columns.indexOf(Math.min(...columns)); columns[index] += block.height + 18 })
    const width = 1600
    const height = Math.max(900, 210 + Math.max(...columns, 0) + 70)
    const { canvas, ctx } = setup(width, height)
    ctx.fillStyle = '#f3f7fb'; ctx.fillRect(0, 0, width, height)
    const gradient = ctx.createLinearGradient(32, 24, width - 32, 145); gradient.addColorStop(0, '#122a62'); gradient.addColorStop(1, '#2563eb')
    fill(ctx, 32, 24, width - 64, 132, 28, gradient)
    text(ctx, 'StaffBoard Share Report', 62, 72, '950 38px Arial', '#ffffff')
    text(ctx, 'Board by area with Speed Lite teams', 62, 104, '800 20px Arial', '#dbeafe')
    text(ctx, `${safe(state.boardTitle || 'Board')} · ${dayName(state)} · Week ${safe(state.weekStartDate)} · ${safe(state.boardShift || '')}`, 62, 134, '800 17px Arial', '#bfdbfe')
    const columnWidth = 492, gap = 22, startX = 42, startY = 196, columnY = [startY, startY, startY]
    blocks.forEach((block) => {
      const column = columnY.indexOf(Math.min(...columnY))
      const x = startX + column * (columnWidth + gap)
      const y = columnY[column]
      columnY[column] += (block.type === 'speed' ? renderSpeed(ctx, x, y, columnWidth, block.model) : renderStandard(ctx, x, y, columnWidth, block.area, block.people)) + 18
    })
    if (!blocks.length) text(ctx, `No staffed assignments recorded for ${dayName(state)}.`, 62, 235, '850 20px Arial', '#64748b')
    text(ctx, 'Current selected day only · Live StaffBoard data · Notes/comments hidden for privacy', 42, height - 34, '800 15px Arial', '#64748b')
    return { canvas, state }
  }

  function exportPng() {
    try {
      const { canvas, state } = boardCanvas()
      const link = document.createElement('a')
      link.download = `staffing-board-share-${dayName(state).toLowerCase()}-${safe(state.weekStartDate || 'week').replaceAll('-', '')}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (error) {
      alert(error?.message || 'Unable to create the Share PNG.')
    }
  }

  function open() {
    exportPng()
  }

  window.StaffBoardSharePNG = { open, exportPng }
})()
