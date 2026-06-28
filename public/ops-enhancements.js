(() => {
  const STYLE_ID = 'staffboard-ops-enhancements-style'
  const MODAL_ID = 'staffboard-ops-enhancements-modal'
  const STATE_KEY = 'staffing_board_redo_complete_v2_weekly'
  const QUARTER_KEY = 'staffboard_quarter_media_v1'
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const STAFFED = new Set(['Present', 'Training', 'Indirect'])
  const PRIORITY_AREAS = ['Rack Prep', 'OB1', 'OB2', 'Speed Lite', 'Speed Line 1', 'Speed Line 2', 'Speed Line 3', 'Shipping']

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] || '&#039;'))
  }

  function number(value) {
    const n = Number(value || 0)
    return Number.isFinite(n) ? n : 0
  }

  function state() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch { return {} }
  }

  function quarters() {
    try { return JSON.parse(localStorage.getItem(QUARTER_KEY) || '{}') } catch { return {} }
  }

  function saveQuarters(value) {
    localStorage.setItem(QUARTER_KEY, JSON.stringify(value))
  }

  function currentQuarterKey(s) {
    return [s.currentBoardId || s.boardId || 'board', s.weekStartDate || '', s.selectedDay || 'Monday'].join('|')
  }

  function selectedDayState(s) {
    return s.weeklyData?.[s.selectedDay || 'Monday'] || {}
  }

  function builderName(s, id) {
    const found = (s.builderPool || []).find((b) => b.id === id)
    if (found?.name) return found.name
    return 'Unassigned builder'
  }

  function rowType(raw) {
    const low = String(raw || '').toLowerCase()
    if (low.includes('decom')) return 'Decom'
    if (low.includes('speed')) return 'SPEED'
    return 'Other'
  }

  function parseRackRows(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const cells = line.split(/\t|,|;/).map((x) => x.trim()).filter(Boolean)
        const rackId = cells[0] || line.split(/\s+/)[0] || ''
        return { rackId, raw: line, materialType: rowType(line) }
      })
  }

  function textNear(labelWords) {
    const labels = Array.from(document.querySelectorAll('label, .table-kicker, .ops-label, .small, div, span'))
    const match = labels.find((el) => {
      const text = (el.textContent || '').toLowerCase()
      return labelWords.every((word) => text.includes(word))
    })
    if (!match) return ''
    const card = match.closest('.card, .summary-card-block, .ops, .field, div') || match.parentElement
    const field = card?.querySelector('textarea, input') || match.parentElement?.querySelector('textarea, input')
    return field?.value || ''
  }

  function visibleRackText(kind) {
    const words = kind === 'prepped' ? ['prepped', 'rack'] : ['processed', 'rack']
    return textNear(words)
  }

  function metricText(d, keys) {
    for (const key of keys) {
      const value = d?.rackLists?.[key] ?? d?.opsMetrics?.[key]
      if (value) return String(value)
    }
    return ''
  }

  function summarizeRackText(preppedText, processedText) {
    const prepped = parseRackRows(preppedText)
    const processed = parseRackRows(processedText)
    const counts = {
      prepped: { Decom: 0, SPEED: 0, Other: 0, total: prepped.length },
      processed: { Decom: 0, SPEED: 0, Other: 0, total: processed.length },
      total: { Decom: 0, SPEED: 0, Other: 0, total: prepped.length + processed.length },
    }
    prepped.forEach((row) => { counts.prepped[row.materialType] += 1; counts.total[row.materialType] += 1 })
    processed.forEach((row) => { counts.processed[row.materialType] += 1; counts.total[row.materialType] += 1 })
    return { prepped, processed, counts, preppedText, processedText }
  }

  function dayRackSummary(s, dayName = s.selectedDay || 'Monday') {
    const d = s.weeklyData?.[dayName] || {}
    const selected = dayName === (s.selectedDay || 'Monday')
    const preppedText = metricText(d, ['prepped', 'preppedRackList', 'preppedRackIds', 'rackPrepIds']) || (selected ? visibleRackText('prepped') : '')
    const processedText = metricText(d, ['processed', 'processedRackList', 'processedRackIds', 'rackProcessedIds']) || (selected ? visibleRackText('processed') : '')
    return summarizeRackText(preppedText, processedText)
  }

  function weekRackSummary(s) {
    return DAYS.reduce((acc, day) => {
      const sum = dayRackSummary(s, day)
      ;['Decom', 'SPEED', 'Other', 'total'].forEach((k) => {
        acc.prepped[k] += sum.counts.prepped[k]
        acc.processed[k] += sum.counts.processed[k]
        acc.total[k] += sum.counts.total[k]
      })
      return acc
    }, {
      prepped: { Decom: 0, SPEED: 0, Other: 0, total: 0 },
      processed: { Decom: 0, SPEED: 0, Other: 0, total: 0 },
      total: { Decom: 0, SPEED: 0, Other: 0, total: 0 },
    })
  }

  function activeHeadcount(dayData, builders = []) {
    const builderMap = new Map(builders.map((b) => [b.id, b]))
    return Object.entries(dayData.assignments || {}).filter(([id, a]) => {
      const builder = builderMap.get(id)
      return STAFFED.has(a.status || 'Present') && !builder?.isLineLead
    }).length
  }

  function snapshotHeadcount(snapshot) {
    if (!snapshot?.totals) return null
    const t = snapshot.totals
    const hc = number(t.present) + number(t.training) + number(t.indirect)
    return hc || null
  }

  function quarterMetrics(s) {
    const d = selectedDayState(s)
    const qs = d.snapshots || {}
    const hc = { q1: snapshotHeadcount(qs.q1), q2: snapshotHeadcount(qs.q2), q3: snapshotHeadcount(qs.q3) }
    const values = Object.values(hc).filter((v) => v != null)
    const avgSnapshotHc = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
    const fullDayHc = number(d.opsMetrics?.manualHeadCount) || activeHeadcount(d, s.builderPool || [])
    const qStore = quarters()[currentQuarterKey(s)] || { q1: '', q2: '', q3: '', q4: '' }
    const qMedia = { q1: number(qStore.q1), q2: number(qStore.q2), q3: number(qStore.q3), q4: number(qStore.q4) }
    const qTotal = qMedia.q1 + qMedia.q2 + qMedia.q3 + qMedia.q4
    const mediaCount = number(d.opsMetrics?.totalMediaCount)
    const mediaProcessed = number(d.opsMetrics?.mediaProcessed)
    const avgHc = avgSnapshotHc || fullDayHc || 0
    return { hc, avgSnapshotHc, fullDayHc, qStore, qMedia, qTotal, mediaCount, mediaProcessed, avgHc }
  }

  function areaDefinitions(s) {
    return Array.isArray(s.areaDefs) ? s.areaDefs : []
  }

  function areaCounts(s) {
    const d = selectedDayState(s)
    const areas = areaDefinitions(s)
    const counts = Object.fromEntries(areas.map((a) => [a.name, { name: a.name, capacity: number(a.capacity), builders: [] }]))
    Object.entries(d.assignments || {}).forEach(([id, a]) => {
      if (!STAFFED.has(a.status || 'Present')) return
      const area = a.area || 'Unassigned'
      if (!counts[area]) counts[area] = { name: area, capacity: 0, builders: [] }
      counts[area].builders.push({ id, name: builderName(s, id), assignment: a })
    })
    return Object.values(counts)
  }

  function addDays(dateStr, days) {
    const d = new Date(`${dateStr}T00:00:00`)
    if (Number.isNaN(d.getTime())) return ''
    d.setDate(d.getDate() + days)
    return d.toISOString().slice(0, 10)
  }

  function previousWeekData(s) {
    const previousKey = addDays(s.weekStartDate || '', -7)
    return (s.weeklyBoards && s.weeklyBoards[previousKey]) || null
  }

  function previousAreaHours(s) {
    const prev = previousWeekData(s)
    const result = {}
    if (!prev) return result
    DAYS.forEach((day) => {
      Object.entries(prev[day]?.assignments || {}).forEach(([id, a]) => {
        if (!STAFFED.has(a.status || 'Present')) return
        const area = a.area || 'Unassigned'
        if (!result[id]) result[id] = {}
        result[id][area] = (result[id][area] || 0) + 7.5
      })
    })
    return result
  }

  function totalPrevHoursForArea(prevHours, id, area) {
    return number(prevHours[id]?.[area])
  }

  function chooseCandidate(builders, prevHours, avoidArea) {
    if (!builders.length) return null
    return builders
      .map((b) => ({ ...b, previousAreaHours: totalPrevHoursForArea(prevHours, b.id, avoidArea) }))
      .sort((a, b) => a.previousAreaHours - b.previousAreaHours)[0]
  }

  function rotationSuggestions(s) {
    const counts = areaCounts(s)
    const prevHours = previousAreaHours(s)
    const hasPrev = Object.keys(prevHours).length > 0
    const suggestions = []
    const unassigned = counts.find((a) => a.name === 'Unassigned')?.builders || []
    const emptyPriority = PRIORITY_AREAS.filter((name) => (counts.find((a) => a.name === name)?.builders.length || 0) === 0)

    if (unassigned.length && emptyPriority.length) {
      const target = emptyPriority[0]
      const person = chooseCandidate(unassigned, prevHours, target) || unassigned[0]
      suggestions.push(`Use ${person.name} from Unassigned to cover ${target}${hasPrev ? ` (previous week ${target}: ${person.previousAreaHours || 0}h)` : ''}.`)
    }

    const speedLines = ['Speed Lite', 'Speed Line 1', 'Speed Line 2', 'Speed Line 3'].map((name) => counts.find((a) => a.name === name) || { name, builders: [] })
    const maxLine = speedLines.reduce((a, b) => b.builders.length > a.builders.length ? b : a, speedLines[0])
    const minLine = speedLines.reduce((a, b) => b.builders.length < a.builders.length ? b : a, speedLines[0])
    if (maxLine && minLine && maxLine.builders.length - minLine.builders.length > 1) {
      const person = chooseCandidate(maxLine.builders, prevHours, minLine.name) || maxLine.builders[0]
      suggestions.push(`Balance SPEED: move ${person?.name || 'one builder'} from ${maxLine.name} to ${minLine.name}${hasPrev ? ` (previous week ${minLine.name}: ${person?.previousAreaHours || 0}h)` : ''}.`)
    }

    counts.forEach((area) => {
      if (area.capacity && area.builders.length > area.capacity) {
        const person = chooseCandidate(area.builders, prevHours, area.name) || area.builders[0]
        suggestions.push(`${area.name} is over capacity by ${area.builders.length - area.capacity}. Move ${person?.name || 'one builder'} to a lighter area.`)
      }
    })

    counts
      .filter((area) => area.name !== 'Unassigned' && area.builders.length >= 4)
      .forEach((area) => {
        const person = area.builders
          .map((b) => ({ ...b, previousAreaHours: totalPrevHoursForArea(prevHours, b.id, area.name) }))
          .sort((a, b) => b.previousAreaHours - a.previousAreaHours)[0]
        if (person && person.previousAreaHours >= 15) {
          suggestions.push(`Rotation check: ${person.name} had ${person.previousAreaHours}h in ${area.name} last week. Rotate them to a different area after the next quarter.`)
        }
      })

    if (!hasPrev) suggestions.push('Previous week hours not found yet. Save/use last week data for smarter rotation suggestions.')
    if (!suggestions.length) suggestions.push('Coverage looks balanced. No urgent rotation move suggested right now.')
    return suggestions.slice(0, 8)
  }

  function card(title, html) {
    return `<div class="opsx-card"><div class="opsx-title">${esc(title)}</div>${html}</div>`
  }

  function rackTable(summary) {
    const c = summary.counts || summary
    return `<table class="opsx-table"><thead><tr><th>Group</th><th>Decom</th><th>SPEED</th><th>Other</th><th>Total</th></tr></thead><tbody>
      <tr><td>Prepped</td><td>${c.prepped.Decom}</td><td>${c.prepped.SPEED}</td><td>${c.prepped.Other}</td><td>${c.prepped.total}</td></tr>
      <tr><td>Processed</td><td>${c.processed.Decom}</td><td>${c.processed.SPEED}</td><td>${c.processed.Other}</td><td>${c.processed.total}</td></tr>
      <tr><td><strong>Total</strong></td><td><strong>${c.total.Decom}</strong></td><td><strong>${c.total.SPEED}</strong></td><td><strong>${c.total.Other}</strong></td><td><strong>${c.total.total}</strong></td></tr>
    </tbody></table>`
  }

  function quarterInputs(s) {
    const q = quarterMetrics(s)
    return `<div class="opsx-quarter-inputs">
      ${['q1', 'q2', 'q3', 'q4'].map((k) => `<label>${k.toUpperCase()} Media<input data-quarter-input="${k}" value="${esc(q.qStore[k] || '')}" inputmode="numeric"></label>`).join('')}
    </div>`
  }

  function simpleAnalysisHtml(s) {
    const q = quarterMetrics(s)
    const mediaForCalc = q.qTotal || q.mediaProcessed || q.mediaCount
    const mediaPerHc = q.avgHc ? mediaForCalc / q.avgHc : 0
    return `<div class="opsx-kpis">
      <div><span>Q Media Total</span><strong>${q.qTotal}</strong></div>
      <div><span>Total Media Count</span><strong>${q.mediaCount}</strong></div>
      <div><span>Media Processed</span><strong>${q.mediaProcessed}</strong></div>
      <div><span>Avg Quarter HC</span><strong>${q.avgSnapshotHc ? q.avgSnapshotHc.toFixed(1) : '—'}</strong></div>
      <div><span>Full Day HC</span><strong>${q.fullDayHc}</strong></div>
      <div><span>Media / Avg HC</span><strong>${mediaPerHc.toFixed(1)}</strong></div>
    </div><div class="opsx-muted">Quarter HC comes from Q1/Q2/Q3 snapshots. Q media can be entered here for simple analysis and PDF totals.</div>`
  }

  function suggestionsHtml(s) {
    return `<ol class="opsx-list">${rotationSuggestions(s).map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`
  }

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      .opsx-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99998;display:flex;align-items:center;justify-content:center;padding:24px}
      .opsx-modal{background:var(--panel,#fff);color:var(--text,#172033);width:min(1180px,96vw);max-height:88vh;overflow:auto;border-radius:22px;border:1px solid var(--line,#d8e1ec);box-shadow:0 28px 80px rgba(15,23,42,.35)}
      .opsx-head{position:sticky;top:0;z-index:1;background:var(--panel,#fff);display:flex;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid var(--line,#d8e1ec)}
      .opsx-head h2{margin:0;font-size:22px}.opsx-body{padding:18px 20px;display:grid;gap:14px}.opsx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
      .opsx-card{background:rgba(248,250,252,.9);border:1px solid var(--line,#d8e1ec);border-radius:18px;padding:14px}.opsx-title{font-weight:900;font-size:15px;margin-bottom:9px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#66748a)}
      .opsx-table{width:100%;border-collapse:collapse}.opsx-table th,.opsx-table td{padding:9px;border-bottom:1px solid var(--line,#d8e1ec);text-align:left}.opsx-table th{font-size:12px;color:var(--muted,#66748a);text-transform:uppercase}
      .opsx-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.opsx-kpis div{background:#fff;border:1px solid var(--line,#d8e1ec);border-radius:14px;padding:10px}.opsx-kpis span{display:block;color:var(--muted,#66748a);font-size:12px;font-weight:800}.opsx-kpis strong{font-size:24px}
      .opsx-quarter-inputs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}.opsx-quarter-inputs label{font-size:12px;font-weight:900;color:var(--muted,#66748a)}.opsx-quarter-inputs input{width:100%;margin-top:4px;border:1px solid var(--line,#d8e1ec);border-radius:10px;padding:9px;background:#fff;color:#111}
      .opsx-list{margin:0;padding-left:20px}.opsx-list li{margin:8px 0}.opsx-muted{color:var(--muted,#66748a);font-size:13px;margin-top:8px}.opsx-btn{border:0;border-radius:10px;padding:9px 12px;font-weight:800;cursor:pointer;background:#2563eb;color:white}.opsx-close{background:#e8eef7;color:#172033}.opsx-inline{margin:14px 0}.opsx-pdf{margin-top:14px}
      @media(max-width:900px){.opsx-grid{grid-template-columns:1fr}.opsx-kpis{grid-template-columns:repeat(2,1fr)}.opsx-quarter-inputs{grid-template-columns:repeat(2,1fr)}}
    `
    document.head.appendChild(style)
  }

  function renderBody(container, s) {
    const daySummary = dayRackSummary(s)
    const weekSummary = weekRackSummary(s)
    const inputHint = !daySummary.counts.total.total ? '<div class="opsx-muted">No rack rows found. Paste Excel rows into the visible Prepped/Processed rack boxes, then click Refresh. Rows can be tab, comma, semicolon, or space separated.</div>' : ''
    container.innerHTML = `
      <div class="opsx-grid">${card('Daily Decom / SPEED Rack Totals', rackTable(daySummary) + inputHint)}${card('Weekly Decom / SPEED Rack Totals', rackTable(weekSummary))}</div>
      ${card('Simple Quarter / Media / Headcount Analysis', quarterInputs(s) + simpleAnalysisHtml(s))}
      ${card('Rotation Suggestions', suggestionsHtml(s))}
    `
    container.querySelectorAll('[data-quarter-input]').forEach((input) => {
      input.addEventListener('input', () => {
        const all = quarters()
        const key = currentQuarterKey(s)
        all[key] = { ...(all[key] || {}), [input.dataset.quarterInput]: input.value }
        saveQuarters(all)
        renderBody(container, state())
        injectInlineCards()
        injectPdfBlocks()
      })
    })
  }

  function openModal() {
    addStyle()
    document.getElementById(MODAL_ID)?.remove()
    const modal = document.createElement('div')
    modal.id = MODAL_ID
    modal.className = 'opsx-modal-backdrop'
    modal.innerHTML = `<div class="opsx-modal"><div class="opsx-head"><div><h2>Ops Enhancements</h2><div class="opsx-muted">Rack type totals, simple media/headcount analysis, and previous-week rotation suggestions</div></div><div style="display:flex;gap:8px"><button class="opsx-btn" data-refresh>Refresh</button><button class="opsx-btn opsx-close" data-close>Close</button></div></div><div class="opsx-body"></div></div>`
    document.body.appendChild(modal)
    const body = modal.querySelector('.opsx-body')
    const refresh = () => renderBody(body, state())
    modal.querySelector('[data-close]').onclick = () => modal.remove()
    modal.querySelector('[data-refresh]').onclick = refresh
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove() })
    refresh()
  }

  function ensureButton() {
    const navs = document.querySelectorAll('.app-nav-tabs, .sidebar-tabs')
    navs.forEach((nav) => {
      if (nav.querySelector('[data-opsx-tab]')) return
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.dataset.opsxTab = 'true'
      btn.className = nav.classList.contains('app-nav-tabs') ? 'secondary nav-tab' : 'secondary sidebar-tab'
      btn.textContent = 'Ops Enhancements'
      btn.addEventListener('click', openModal)
      nav.appendChild(btn)
    })
  }

  function inlineHtml(s) {
    return `<div class="opsx-inline opsx-card" data-opsx-inline="true"><div class="opsx-title">Decom / SPEED Rack Totals + Rotation Suggestions</div><div class="opsx-grid"><div>${rackTable(dayRackSummary(s))}</div><div>${suggestionsHtml(s)}</div></div></div>`
  }

  function injectInlineCards() {
    addStyle()
    const s = state()
    const existing = document.querySelector('[data-opsx-inline]')
    if (existing) existing.remove()
    const headings = Array.from(document.querySelectorAll('.table-kicker, .title, h2, h3'))
    const targetHeading = headings.find((el) => /Rack ID Summary/i.test(el.textContent || ''))
    const targetCard = targetHeading?.closest('.card, .summary-card-block, .board-shell')
    if (targetCard) targetCard.insertAdjacentHTML('afterend', inlineHtml(s))
  }

  function pdfHtml(s, label) {
    const week = weekRackSummary(s)
    const day = dayRackSummary(s)
    const q = quarterMetrics(s)
    const rack = label === 'Daily' ? day.counts : week
    return `<div class="opsx-pdf pdf-chart-card" data-opsx-pdf="true"><div class="pdf-chart-title">${label} Rack Type + Simple Analysis</div>
      <table class="pdf-mini-table"><tbody>
        <tr><td>${label} Decom Racks</td><td>${rack.total.Decom}</td><td>${label} SPEED Racks</td><td>${rack.total.SPEED}</td></tr>
        <tr><td>${label} Other Racks</td><td>${rack.total.Other}</td><td>${label} Total Racks</td><td>${rack.total.total}</td></tr>
        <tr><td>Q Media Total</td><td>${q.qTotal}</td><td>Avg Quarter HC</td><td>${q.avgSnapshotHc ? q.avgSnapshotHc.toFixed(1) : '—'}</td></tr>
        <tr><td>Full Day HC</td><td>${q.fullDayHc}</td><td>Media / Avg HC</td><td>${q.avgHc ? ((q.qTotal || q.mediaProcessed || q.mediaCount) / q.avgHc).toFixed(1) : '—'}</td></tr>
      </tbody></table>
    </div>`
  }

  function injectPdfBlocks() {
    const s = state()
    document.querySelectorAll('[data-opsx-pdf]').forEach((el) => el.remove())
    const sheets = Array.from(document.querySelectorAll('.pdf-report-sheet'))
    sheets.forEach((sheet, idx) => sheet.insertAdjacentHTML('beforeend', pdfHtml(s, idx === 0 ? 'Daily' : 'Weekly')))
  }

  function tick() {
    ensureButton()
    injectInlineCards()
    injectPdfBlocks()
  }

  addStyle()
  document.addEventListener('DOMContentLoaded', tick)
  setInterval(tick, 2500)
  tick()
})()
