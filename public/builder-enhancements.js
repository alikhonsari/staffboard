(() => {
  const STYLE_ID = 'staffboard-builder-enhancements-style'
  const MODAL_ID = 'staffboard-builder-enhancements-modal'
  const STATE_KEY = 'staffing_board_redo_complete_v2_weekly'
  const TOKEN_KEYS = ['staffboard2_token', 'staffboard_shared_auth_token']
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const SKILLS = [
    ['trainedTdr', 'TDR'],
    ['trainedForklift', 'Forklift'],
    ['trainedCenterRider', 'Center Rider'],
    ['trainedClampTruck', 'Clamp Truck'],
    ['isTrainer', 'Trainer'],
    ['isSafetyMember', 'Safety'],
    ['isLineLead', 'Line Lead'],
  ]
  const STAFFED = new Set(['Present', 'Training', 'Indirect'])
  let saveTimer = null
  let filterText = ''
  let skillFilter = 'all'
  let badgeFilter = 'all'

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] || '&#039;'))
  }

  function id() {
    return 'b-' + Math.random().toString(36).slice(2, 10)
  }

  function state() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch { return {} }
  }

  function writeState(next) {
    next.updatedAt = new Date().toLocaleString()
    localStorage.setItem(STATE_KEY, JSON.stringify(next))
    scheduleSave(next)
    window.dispatchEvent(new Event('staffboard-builder-enhancements-updated'))
  }

  function token() {
    for (const key of TOKEN_KEYS) {
      const value = localStorage.getItem(key)
      if (value) return value
    }
    return ''
  }

  function scheduleSave(next) {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      const auth = token()
      if (!auth) return
      try {
        await fetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
          body: JSON.stringify({ state: next }),
        })
      } catch (err) {
        console.warn('Builder enhancement remote save failed', err)
      }
    }, 800)
  }

  function builderFlags(builder) {
    return SKILLS.filter(([key]) => builder?.[key]).map(([, label]) => label)
  }

  function badgeLabel(value) {
    const v = String(value || 'day').toLowerCase()
    if (v.includes('night')) return 'Blue Night'
    if (v.includes('green')) return 'Green'
    return 'Blue Day'
  }

  function normalizeBadge(value) {
    const v = String(value || '').toLowerCase()
    if (v.includes('night')) return 'night'
    if (v.includes('green')) return 'green'
    return 'day'
  }

  function truthy(value) {
    const v = String(value || '').toLowerCase().trim()
    return ['y', 'yes', 'true', '1', 'x', 'trained', 'trainer', 'safety', 'line lead', 'linelead'].includes(v)
  }

  function parseLine(line) {
    const cells = line.split(/\t|,|;/).map((x) => x.trim())
    const raw = line.toLowerCase()
    const name = cells[0] || ''
    const badge = normalizeBadge(cells[1] || raw)
    return {
      name,
      badgeType: badge,
      trainedTdr: truthy(cells[2]) || raw.includes('tdr'),
      trainedForklift: truthy(cells[3]) || raw.includes('forklift'),
      trainedCenterRider: truthy(cells[4]) || raw.includes('center rider') || raw.includes('centerrider'),
      trainedClampTruck: truthy(cells[5]) || raw.includes('clamp'),
      isTrainer: truthy(cells[6]) || raw.includes('trainer'),
      isSafetyMember: truthy(cells[7]) || raw.includes('safety'),
      isLineLead: truthy(cells[8]) || raw.includes('line lead') || raw.includes('linelead'),
      groupName: cells[9] || '',
    }
  }

  function parseBuilders(text) {
    const rows = String(text || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
    return rows
      .map(parseLine)
      .filter((row) => row.name && !/^name$/i.test(row.name))
  }

  function selectedDay(s) {
    return s.selectedDay || 'Monday'
  }

  function ensureWeek(s) {
    if (!s.weeklyData) s.weeklyData = {}
    DAYS.forEach((day) => {
      if (!s.weeklyData[day]) s.weeklyData[day] = { assignments: {}, opsMetrics: {}, rackLists: {}, snapshots: {}, movementLog: [], attendanceLog: [] }
      if (!s.weeklyData[day].assignments) s.weeklyData[day].assignments = {}
    })
  }

  function blankAssignment() {
    const now = new Date().toLocaleString()
    return { status: 'Present', area: '', subArea: '', role: '', leaveTime: '', clockInTime: '', comment: '', builderNotes: '', createdAt: now, updatedAt: now, sessionStartIso: '', areaHistory: [] }
  }

  function addOrUpdateBuilders(text, addToToday) {
    const rows = parseBuilders(text)
    if (!rows.length) return alert('Paste at least one builder row.')
    const s = state()
    ensureWeek(s)
    if (!Array.isArray(s.builderPool)) s.builderPool = []
    if (!Array.isArray(s.builderGroups)) s.builderGroups = []
    const byName = new Map(s.builderPool.map((b) => [String(b.name || '').toLowerCase().trim(), b]))
    let added = 0
    let updated = 0
    rows.forEach((row) => {
      const key = row.name.toLowerCase().trim()
      let builder = byName.get(key)
      if (builder) {
        Object.assign(builder, {
          badgeType: row.badgeType || builder.badgeType || 'day',
          trainedTdr: !!(builder.trainedTdr || row.trainedTdr),
          trainedForklift: !!(builder.trainedForklift || row.trainedForklift),
          trainedCenterRider: !!(builder.trainedCenterRider || row.trainedCenterRider),
          trainedClampTruck: !!(builder.trainedClampTruck || row.trainedClampTruck),
          isTrainer: !!(builder.isTrainer || row.isTrainer),
          isSafetyMember: !!(builder.isSafetyMember || row.isSafetyMember),
          isLineLead: !!(builder.isLineLead || row.isLineLead),
        })
        updated += 1
      } else {
        builder = {
          id: id(),
          name: row.name,
          badgeType: row.badgeType || 'day',
          trainedTdr: !!row.trainedTdr,
          trainedForklift: !!row.trainedForklift,
          trainedCenterRider: !!row.trainedCenterRider,
          trainedClampTruck: !!row.trainedClampTruck,
          isTrainer: !!row.isTrainer,
          isSafetyMember: !!row.isSafetyMember,
          isLineLead: !!row.isLineLead,
        }
        s.builderPool.push(builder)
        byName.set(key, builder)
        added += 1
      }
      if (row.groupName) {
        let group = s.builderGroups.find((g) => String(g.name || '').toLowerCase() === row.groupName.toLowerCase())
        if (!group) {
          group = { id: 'g-' + Math.random().toString(36).slice(2, 10), name: row.groupName, builderIds: [] }
          s.builderGroups.push(group)
        }
        group.builderIds = Array.from(new Set([...(group.builderIds || []), builder.id]))
      }
      if (addToToday) {
        const day = selectedDay(s)
        if (!s.weeklyData[day].assignments[builder.id]) s.weeklyData[day].assignments[builder.id] = blankAssignment()
      }
    })
    writeState(s)
    alert(`Builder import complete. Added ${added}, updated ${updated}. Refresh the page if the main roster does not repaint immediately.`)
    openModal()
  }

  function assignmentFor(s, builderId, day = selectedDay(s)) {
    return s.weeklyData?.[day]?.assignments?.[builderId] || null
  }

  function stats(s) {
    const builders = Array.isArray(s.builderPool) ? s.builderPool : []
    const assignedToday = builders.filter((b) => assignmentFor(s, b.id)).length
    const activeToday = builders.filter((b) => STAFFED.has(assignmentFor(s, b.id)?.status || '')).length
    return {
      total: builders.length,
      assignedToday,
      activeToday,
      day: builders.filter((b) => (b.badgeType || 'day') === 'day').length,
      night: builders.filter((b) => b.badgeType === 'night').length,
      green: builders.filter((b) => b.badgeType === 'green').length,
      trainers: builders.filter((b) => b.isTrainer).length,
      safety: builders.filter((b) => b.isSafetyMember).length,
      lineLeads: builders.filter((b) => b.isLineLead).length,
      tdr: builders.filter((b) => b.trainedTdr).length,
      forklift: builders.filter((b) => b.trainedForklift).length,
      center: builders.filter((b) => b.trainedCenterRider).length,
      clamp: builders.filter((b) => b.trainedClampTruck).length,
    }
  }

  function duplicates(builders) {
    const map = new Map()
    builders.forEach((b) => {
      const key = String(b.name || '').toLowerCase().replace(/\s+/g, ' ').trim()
      if (!key) return
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(b)
    })
    return Array.from(map.values()).filter((x) => x.length > 1)
  }

  function filteredBuilders(s) {
    const q = filterText.toLowerCase().trim()
    return (s.builderPool || []).filter((b) => {
      const flags = builderFlags(b).join(' ').toLowerCase()
      const text = `${b.name || ''} ${badgeLabel(b.badgeType)} ${flags}`.toLowerCase()
      const badgeOk = badgeFilter === 'all' || (b.badgeType || 'day') === badgeFilter
      let skillOk = true
      if (skillFilter !== 'all') skillOk = !!b[skillFilter]
      return badgeOk && skillOk && (!q || text.includes(q))
    }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  }

  function csvValue(value) {
    const s = String(value ?? '')
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }

  function download(name, text, type = 'text/csv;charset=utf-8') {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type }))
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 800)
  }

  function exportMatrix() {
    const s = state()
    const rows = [['Name', 'Badge', 'TDR', 'Forklift', 'Center Rider', 'Clamp Truck', 'Trainer', 'Safety', 'Line Lead', 'Today Status', 'Today Area']]
    filteredBuilders(s).forEach((b) => {
      const a = assignmentFor(s, b.id)
      rows.push([b.name, badgeLabel(b.badgeType), b.trainedTdr ? 'Yes' : '', b.trainedForklift ? 'Yes' : '', b.trainedCenterRider ? 'Yes' : '', b.trainedClampTruck ? 'Yes' : '', b.isTrainer ? 'Yes' : '', b.isSafetyMember ? 'Yes' : '', b.isLineLead ? 'Yes' : '', a?.status || '', a?.area || ''])
    })
    download(`builder-matrix-${s.weekStartDate || 'week'}.csv`, rows.map((row) => row.map(csvValue).join(',')).join('\n'))
  }

  function markSkill(builderId, key, checked) {
    const s = state()
    const b = (s.builderPool || []).find((x) => x.id === builderId)
    if (!b) return
    b[key] = checked
    writeState(s)
    renderModalBody()
  }

  function changeBadge(builderId, value) {
    const s = state()
    const b = (s.builderPool || []).find((x) => x.id === builderId)
    if (!b) return
    b.badgeType = value
    writeState(s)
    renderModalBody()
  }

  function addBuilderToToday(builderId) {
    const s = state()
    ensureWeek(s)
    const day = selectedDay(s)
    if (!s.weeklyData[day].assignments[builderId]) s.weeklyData[day].assignments[builderId] = blankAssignment()
    writeState(s)
    renderModalBody()
  }

  function removeBuilderFromToday(builderId) {
    const s = state()
    const day = selectedDay(s)
    if (s.weeklyData?.[day]?.assignments) delete s.weeklyData[day].assignments[builderId]
    writeState(s)
    renderModalBody()
  }

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      .builderx-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99978;display:flex;align-items:center;justify-content:center;padding:24px}
      .builderx-modal{background:#fff;color:#172033;width:min(1280px,97vw);max-height:90vh;overflow:auto;border:1px solid #d8e1ec;border-radius:22px;box-shadow:0 28px 80px rgba(15,23,42,.35)}
      .builderx-head{position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid #e5edf6;padding:18px 20px;display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.builderx-head h2{margin:0;font-size:22px}.builderx-body{padding:18px 20px;display:grid;gap:14px;background:linear-gradient(180deg,#f8fafc,#fff)}
      .builderx-actions{display:flex;gap:8px;flex-wrap:wrap}.builderx-btn{border:0;border-radius:11px;padding:9px 12px;font-weight:900;cursor:pointer;background:#e8eef7;color:#172033}.builderx-primary{background:#2563eb;color:white}.builderx-danger{background:#fee2e2;color:#991b1b}.builderx-card{background:white;border:1px solid #d8e1ec;border-radius:18px;padding:14px;box-shadow:0 8px 20px rgba(15,23,42,.05)}
      .builderx-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}.builderx-kpi{background:#f8fafc;border:1px solid #d8e1ec;border-radius:14px;padding:12px}.builderx-kpi span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#66748a;font-weight:900}.builderx-kpi strong{display:block;font-size:24px;margin-top:4px}.builderx-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .builderx-controls{display:grid;grid-template-columns:1.4fr .7fr .7fr auto;gap:10px;align-items:end}.builderx-controls input,.builderx-controls select,.builderx-card textarea{width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:10px 12px;font:inherit}.builderx-card textarea{min-height:140px;resize:vertical}.builderx-table-wrap{overflow:auto;border:1px solid #d8e1ec;border-radius:15px;background:#fff;max-height:470px}.builderx-table{width:100%;border-collapse:collapse;min-width:1040px}.builderx-table th,.builderx-table td{padding:9px 10px;border-bottom:1px solid #e5edf6;text-align:left;font-size:13px;vertical-align:middle}.builderx-table th{position:sticky;top:0;background:#f3f6fb;color:#53647c;text-transform:uppercase;font-size:11px;letter-spacing:.05em;z-index:1}.builderx-table tbody tr:hover{background:#f8fafc}.builderx-table select{border:1px solid #cbd5e1;border-radius:9px;padding:6px;background:white}.builderx-chip{display:inline-flex;padding:3px 8px;border-radius:999px;background:#eef4fa;border:1px solid #d8e1ec;font-size:11px;font-weight:900;margin:2px}.builderx-warn{background:#fff7ed;border-color:#fed7aa;color:#9a3412}.builderx-good{background:#ecfdf5;border-color:#bbf7d0;color:#166534}.builderx-muted{color:#66748a;font-size:13px;line-height:1.45}.builderx-list{display:grid;gap:8px}.builderx-list-row{border:1px solid #e5edf6;border-radius:12px;padding:10px;background:#f8fafc}.builderx-check{display:flex;align-items:center;justify-content:center}.builderx-check input{width:18px;height:18px}
      body[data-theme="dark"] .builderx-modal,body[data-theme="dark"] .builderx-head,body[data-theme="dark"] .builderx-card{background:#22344e!important;color:#f4f8ff!important;border-color:#536986!important}body[data-theme="dark"] .builderx-body{background:linear-gradient(180deg,#1d2b42,#22344e)!important}body[data-theme="dark"] .builderx-kpi,body[data-theme="dark"] .builderx-table-wrap,body[data-theme="dark"] .builderx-list-row{background:#263852!important;border-color:#536986!important;color:#f4f8ff!important}body[data-theme="dark"] .builderx-table th{background:#344963!important;color:#c8d6eb!important}body[data-theme="dark"] .builderx-table td{border-color:#40536f!important}body[data-theme="dark"] .builderx-controls input,body[data-theme="dark"] .builderx-controls select,body[data-theme="dark"] .builderx-card textarea,body[data-theme="dark"] .builderx-table select{background:#263852!important;color:#fff!important;border-color:#5a6f8e!important}body[data-theme="dark"] .builderx-btn{background:#344963!important;color:#f4f8ff!important}body[data-theme="dark"] .builderx-primary{background:#7dd3fc!important;color:#071421!important}body[data-theme="dark"] .builderx-muted{color:#c8d6eb!important}body[data-theme="dark"] .builderx-chip{background:#344963!important;border-color:#647a99!important;color:#f4f8ff!important}
      @media(max-width:900px){.builderx-grid{grid-template-columns:1fr}.builderx-kpis{grid-template-columns:repeat(2,1fr)}.builderx-controls{grid-template-columns:1fr}.builderx-backdrop{padding:10px}.builderx-modal{max-height:94vh}}
    `
    document.head.appendChild(style)
  }

  function kpiHtml(stats) {
    const items = [
      ['Total', stats.total], ['Assigned Today', stats.assignedToday], ['Active Today', stats.activeToday], ['Trainers', stats.trainers], ['Safety', stats.safety], ['Line Leads', stats.lineLeads],
      ['TDR', stats.tdr], ['Forklift', stats.forklift], ['Center Rider', stats.center], ['Clamp', stats.clamp], ['Blue Night', stats.night], ['Green', stats.green],
    ]
    return `<div class="builderx-kpis">${items.map(([label, value]) => `<div class="builderx-kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`
  }

  function skillCoverageHtml(s) {
    const builders = s.builderPool || []
    const rows = SKILLS.map(([key, label]) => {
      const count = builders.filter((b) => b[key]).length
      const pct = builders.length ? Math.round(count / builders.length * 100) : 0
      return `<div class="builderx-list-row"><strong>${esc(label)}</strong><div class="builderx-muted">${count} trained · ${pct}% of roster</div></div>`
    })
    return rows.join('')
  }

  function duplicateHtml(s) {
    const groups = duplicates(s.builderPool || [])
    if (!groups.length) return '<div class="builderx-list-row builderx-good">No duplicate names found.</div>'
    return groups.map((group) => `<div class="builderx-list-row builderx-warn"><strong>${esc(group[0].name)}</strong><div class="builderx-muted">${group.length} profiles: ${group.map((b) => esc(b.id)).join(', ')}</div></div>`).join('')
  }

  function tableHtml(s) {
    const rows = filteredBuilders(s)
    return `<div class="builderx-table-wrap"><table class="builderx-table"><thead><tr><th>Name</th><th>Badge</th><th>Today</th><th>Area</th>${SKILLS.map(([, label]) => `<th>${esc(label)}</th>`).join('')}<th>Action</th></tr></thead><tbody>${rows.length ? rows.map((b) => {
      const a = assignmentFor(s, b.id)
      const flags = builderFlags(b)
      return `<tr>
        <td><strong>${esc(b.name)}</strong><div>${flags.map((x) => `<span class="builderx-chip">${esc(x)}</span>`).join('')}</div></td>
        <td><select data-badge="${esc(b.id)}"><option value="day" ${b.badgeType === 'day' || !b.badgeType ? 'selected' : ''}>Blue Day</option><option value="night" ${b.badgeType === 'night' ? 'selected' : ''}>Blue Night</option><option value="green" ${b.badgeType === 'green' ? 'selected' : ''}>Green</option></select></td>
        <td>${a ? `<span class="builderx-chip builderx-good">${esc(a.status || 'Present')}</span>` : '<span class="builderx-chip builderx-warn">Not on day</span>'}</td>
        <td>${esc(a?.area || '—')}</td>
        ${SKILLS.map(([key]) => `<td class="builderx-check"><input type="checkbox" data-skill="${key}" data-builder="${esc(b.id)}" ${b[key] ? 'checked' : ''}></td>`).join('')}
        <td>${a ? `<button class="builderx-btn builderx-danger" data-remove-day="${esc(b.id)}">Remove Today</button>` : `<button class="builderx-btn" data-add-day="${esc(b.id)}">Add Today</button>`}</td>
      </tr>`
    }).join('') : '<tr><td colspan="12" class="builderx-muted">No builders match the current filter.</td></tr>'}</tbody></table></div>`
  }

  function assignmentSummaryHtml(s) {
    const day = selectedDay(s)
    const assignments = s.weeklyData?.[day]?.assignments || {}
    const counts = {}
    Object.entries(assignments).forEach(([builderId, assignment]) => {
      const area = assignment.area || 'Unassigned'
      if (!counts[area]) counts[area] = { area, total: 0, present: 0, training: 0, indirect: 0, other: 0 }
      counts[area].total += 1
      const status = assignment.status || 'Present'
      if (status === 'Present') counts[area].present += 1
      else if (status === 'Training') counts[area].training += 1
      else if (status === 'Indirect') counts[area].indirect += 1
      else counts[area].other += 1
    })
    const rows = Object.values(counts).sort((a, b) => b.total - a.total || a.area.localeCompare(b.area))
    return `<div class="builderx-table-wrap" style="max-height:260px"><table class="builderx-table" style="min-width:720px"><thead><tr><th>Area</th><th>Total</th><th>Present</th><th>Training</th><th>Indirect</th><th>Other</th></tr></thead><tbody>${rows.length ? rows.map((r) => `<tr><td><strong>${esc(r.area)}</strong></td><td>${r.total}</td><td>${r.present}</td><td>${r.training}</td><td>${r.indirect}</td><td>${r.other}</td></tr>`).join('') : '<tr><td colspan="6" class="builderx-muted">No assignments for selected day.</td></tr>'}</tbody></table></div>`
  }

  function renderModalBody() {
    const modal = document.getElementById(MODAL_ID)
    if (!modal) return
    const s = state()
    const body = modal.querySelector('.builderx-body')
    body.innerHTML = `
      ${kpiHtml(stats(s))}
      <div class="builderx-card">
        <div class="builderx-controls">
          <div><label>Search roster</label><input data-builder-search value="${esc(filterText)}" placeholder="Name, badge, skill…"></div>
          <div><label>Badge</label><select data-builder-badge-filter><option value="all">All badges</option><option value="day" ${badgeFilter === 'day' ? 'selected' : ''}>Blue Day</option><option value="night" ${badgeFilter === 'night' ? 'selected' : ''}>Blue Night</option><option value="green" ${badgeFilter === 'green' ? 'selected' : ''}>Green</option></select></div>
          <div><label>Skill</label><select data-builder-skill-filter><option value="all">All skills</option>${SKILLS.map(([key, label]) => `<option value="${key}" ${skillFilter === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div>
          <button class="builderx-btn builderx-primary" data-export-builders>Export Matrix</button>
        </div>
      </div>
      <div class="builderx-card"><div class="builderx-muted" style="margin-bottom:10px">Skill Matrix · toggle skills directly here. Changes auto-save to shared board.</div>${tableHtml(s)}</div>
      <div class="builderx-grid">
        <div class="builderx-card"><div class="builderx-muted" style="margin-bottom:10px">Current Day Assignment Summary · ${esc(selectedDay(s))}</div>${assignmentSummaryHtml(s)}</div>
        <div class="builderx-card"><div class="builderx-muted" style="margin-bottom:10px">Skill Coverage</div><div class="builderx-list">${skillCoverageHtml(s)}</div></div>
      </div>
      <div class="builderx-grid">
        <div class="builderx-card"><div class="builderx-muted" style="margin-bottom:10px">Duplicate Name Check</div><div class="builderx-list">${duplicateHtml(s)}</div></div>
        <div class="builderx-card"><div class="builderx-muted" style="margin-bottom:10px">Bulk Import / Update Builders from Excel</div><textarea data-bulk-import placeholder="Name, Badge, TDR, Forklift, Center Rider, Clamp, Trainer, Safety, Line Lead, Group\nJohn Smith, day, yes, no, yes, no, no, yes, no, Team A"></textarea><label style="display:flex;gap:8px;align-items:center;margin:10px 0"><input data-import-add-today type="checkbox" style="width:18px;height:18px"> Add imported builders to selected day as Unassigned</label><button class="builderx-btn builderx-primary" data-run-import>Import / Update Builders</button></div>
      </div>
    `
    attachBodyEvents(modal)
  }

  function attachBodyEvents(modal) {
    modal.querySelector('[data-builder-search]')?.addEventListener('input', (e) => { filterText = e.target.value; renderModalBody() })
    modal.querySelector('[data-builder-badge-filter]')?.addEventListener('change', (e) => { badgeFilter = e.target.value; renderModalBody() })
    modal.querySelector('[data-builder-skill-filter]')?.addEventListener('change', (e) => { skillFilter = e.target.value; renderModalBody() })
    modal.querySelector('[data-export-builders]')?.addEventListener('click', exportMatrix)
    modal.querySelectorAll('[data-skill]').forEach((input) => input.addEventListener('change', () => markSkill(input.dataset.builder, input.dataset.skill, input.checked)))
    modal.querySelectorAll('[data-badge]').forEach((select) => select.addEventListener('change', () => changeBadge(select.dataset.badge, select.value)))
    modal.querySelectorAll('[data-add-day]').forEach((btn) => btn.addEventListener('click', () => addBuilderToToday(btn.dataset.addDay)))
    modal.querySelectorAll('[data-remove-day]').forEach((btn) => btn.addEventListener('click', () => removeBuilderFromToday(btn.dataset.removeDay)))
    modal.querySelector('[data-run-import]')?.addEventListener('click', () => {
      const text = modal.querySelector('[data-bulk-import]')?.value || ''
      const addToday = !!modal.querySelector('[data-import-add-today]')?.checked
      addOrUpdateBuilders(text, addToday)
    })
  }

  function openModal() {
    addStyle()
    document.getElementById(MODAL_ID)?.remove()
    const modal = document.createElement('div')
    modal.id = MODAL_ID
    modal.className = 'builderx-backdrop'
    modal.innerHTML = `<div class="builderx-modal"><div class="builderx-head"><div><h2>Builder Tools</h2><div class="builderx-muted">Roster health, skill matrix, daily assignment summary, duplicate check, and Excel bulk import.</div></div><div class="builderx-actions"><button class="builderx-btn builderx-primary" data-refresh>Refresh</button><button class="builderx-btn" data-close>Close</button></div></div><div class="builderx-body"></div></div>`
    document.body.appendChild(modal)
    modal.querySelector('[data-close]').onclick = () => modal.remove()
    modal.querySelector('[data-refresh]').onclick = renderModalBody
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove() })
    renderModalBody()
  }

  function ensureButtons() {
    const navs = document.querySelectorAll('.view-tab-grid, .app-nav-tabs, .sidebar-tabs')
    navs.forEach((nav) => {
      if (nav.querySelector('[data-builderx-tab]')) return
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.dataset.builderxTab = 'true'
      btn.className = nav.classList.contains('view-tab-grid') ? 'secondary sidebar-tab' : 'secondary nav-tab'
      btn.textContent = 'Builder Tools'
      btn.addEventListener('click', openModal)
      nav.appendChild(btn)
    })
  }

  function addBuilderSummaryCard() {
    const existing = document.querySelector('[data-builderx-summary]')
    if (existing) existing.remove()
    const s = state()
    const st = stats(s)
    const headings = Array.from(document.querySelectorAll('.title, h2, .table-kicker')).filter((el) => /builder/i.test(el.textContent || ''))
    const host = headings[0]?.closest('.board-shell') || headings[0]?.parentElement
    if (!host) return
    const html = `<div class="builderx-card" data-builderx-summary="true" style="margin:14px 0"><div class="builderx-muted" style="margin-bottom:10px">Builder Roster Health</div>${kpiHtml(st)}<div style="margin-top:10px"><button class="builderx-btn builderx-primary" data-open-builderx>Open Builder Tools</button></div></div>`
    host.insertAdjacentHTML('afterbegin', html)
    host.querySelector('[data-open-builderx]')?.addEventListener('click', openModal)
  }

  function tick() {
    ensureButtons()
    addStyle()
    addBuilderSummaryCard()
  }

  addStyle()
  document.addEventListener('DOMContentLoaded', tick)
  window.addEventListener('staffboard-builder-enhancements-updated', tick)
  setInterval(tick, 2500)
  tick()
})()
