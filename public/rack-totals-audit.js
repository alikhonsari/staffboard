(() => {
  const STATE_KEY = 'staffing_board_redo_complete_v2_weekly'
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] || '&#039;'))
  }
  function readState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch { return {} }
  }
  function selectedDay(s) {
    return DAYS.includes(s.selectedDay) ? s.selectedDay : 'Monday'
  }
  function rowType(raw) {
    const low = String(raw || '').toLowerCase()
    if (low.includes('decom')) return 'Decom'
    if (low.includes('speed')) return 'SPEED'
    return 'Other'
  }
  function looksLikeHeader(line) {
    const low = String(line || '').toLowerCase().trim()
    return /^(group|decom|speed|other|total|prepped|processed|rack id|rack ids|material type|type|board title|operation board|shift|day|week)$/.test(low)
  }
  function looksLikeBoardText(line) {
    const low = String(line || '').toLowerCase().trim()
    return low.includes('shift') || low.includes('staffboard') || low.includes('staffing board') || low.includes('week of') || low.includes('admin:') || low.includes('lead:')
  }
  function extractCells(line) {
    return String(line || '').split(/\t|,|;|\s{2,}/).map((x) => x.trim()).filter(Boolean)
  }
  function hasRackLikeId(value) {
    const text = String(value || '').trim()
    if (!text || looksLikeBoardText(text)) return false
    const candidates = text.match(/\b[A-Z0-9][A-Z0-9-]{3,}\b/gi) || []
    return candidates.some((candidate) => /\d/.test(candidate) && candidate.length >= 4)
  }
  function looksLikeRackRow(line) {
    const raw = String(line || '').trim()
    if (!raw || looksLikeHeader(raw) || looksLikeBoardText(raw)) return false
    const parts = extractCells(raw)
    const hasMaterial = /\b(decom|speed)\b/i.test(raw)
    const hasId = parts.some(hasRackLikeId) || hasRackLikeId(raw)
    return hasId && hasMaterial
  }
  function parseRows(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map((raw) => raw.trim())
      .filter(Boolean)
      .map((raw) => ({ raw, type: rowType(raw), counted: looksLikeRackRow(raw) }))
      .filter((row) => row.counted)
  }
  function metricText(d, keys) {
    for (const key of keys) {
      const value = d?.rackLists?.[key] ?? d?.opsMetrics?.[key]
      if (value) return String(value)
    }
    return ''
  }
  function visibleText(kind) {
    const terms = kind === 'prepped' ? ['prepped', 'rack'] : ['processed', 'rack']
    const labels = Array.from(document.querySelectorAll('label, .table-kicker, .ops-label, .small, div, span'))
    const match = labels.find((el) => {
      const t = (el.textContent || '').toLowerCase()
      return terms.every((term) => t.includes(term))
    })
    const host = match?.closest('.card, .summary-card-block, .ops, .field, div') || match?.parentElement
    const field = host?.querySelector('textarea, input') || match?.parentElement?.querySelector('textarea, input')
    return field?.value || ''
  }
  function dayTexts(s) {
    const d = s.weeklyData?.[selectedDay(s)] || {}
    return {
      prepped: metricText(d, ['prepped', 'preppedRackList', 'preppedRackIds', 'rackPrepIds']) || visibleText('prepped'),
      processed: metricText(d, ['processed', 'processedRackList', 'processedRackIds', 'rackProcessedIds']) || visibleText('processed'),
    }
  }
  function summarize(texts) {
    const prepped = parseRows(texts.prepped)
    const processed = parseRows(texts.processed)
    const counts = {
      prepped: { Decom: 0, SPEED: 0, Other: 0, total: prepped.length },
      processed: { Decom: 0, SPEED: 0, Other: 0, total: processed.length },
      total: { Decom: 0, SPEED: 0, Other: 0, total: prepped.length + processed.length },
    }
    prepped.forEach((r) => { counts.prepped[r.type] += 1; counts.total[r.type] += 1 })
    processed.forEach((r) => { counts.processed[r.type] += 1; counts.total[r.type] += 1 })
    return { prepped, processed, counts }
  }
  function table(c) {
    return `<table class="opsx-table"><thead><tr><th>Group</th><th>Decom</th><th>SPEED</th><th>Other</th><th>Total</th></tr></thead><tbody>
      <tr><td>Prepped</td><td>${c.prepped.Decom}</td><td>${c.prepped.SPEED}</td><td>${c.prepped.Other}</td><td>${c.prepped.total}</td></tr>
      <tr><td>Processed</td><td>${c.processed.Decom}</td><td>${c.processed.SPEED}</td><td>${c.processed.Other}</td><td>${c.processed.total}</td></tr>
      <tr><td><strong>Total</strong></td><td><strong>${c.total.Decom}</strong></td><td><strong>${c.total.SPEED}</strong></td><td><strong>${c.total.Other}</strong></td><td><strong>${c.total.total}</strong></td></tr>
    </tbody></table>`
  }
  function rowList(label, rows) {
    if (!rows.length) return `<div class="rack-audit-empty">${esc(label)}: no counted rack rows.</div>`
    return `<div class="rack-audit-block"><strong>${esc(label)} counted rows</strong>${rows.map((r) => `<div class="rack-audit-row"><span>${esc(r.type)}</span>${esc(r.raw)}</div>`).join('')}</div>`
  }
  function style() {
    if (document.getElementById('rack-audit-style')) return
    const s = document.createElement('style')
    s.id = 'rack-audit-style'
    s.textContent = `.rack-audit{margin-top:10px;border:1px dashed #cbd5e1;border-radius:14px;padding:10px;background:#f8fbff}.rack-audit-title{font-weight:950;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin-bottom:8px}.rack-audit-block{display:grid;gap:5px;margin:8px 0}.rack-audit-row{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:#334155;background:#fff;border:1px solid #e5edf6;border-radius:10px;padding:6px 8px}.rack-audit-row span{font-weight:950;color:#2563eb;min-width:54px}.rack-audit-empty{font-size:12px;color:#64748b;font-weight:750;margin:5px 0}body[data-theme="dark"] .rack-audit{background:#263852;border-color:#5a6f8e}body[data-theme="dark"] .rack-audit-row{background:#22344e;color:#f4f8ff;border-color:#536986}body[data-theme="dark"] .rack-audit-title,body[data-theme="dark"] .rack-audit-empty{color:#c8d6eb}`
    document.head.appendChild(s)
  }
  function patch() {
    style()
    const s = readState()
    const summary = summarize(dayTexts(s))
    const card = document.querySelector('[data-opsx-inline]')
    if (!card) return
    const left = card.querySelector('.opsx-grid > div:first-child') || card.querySelector('.opsx-grid')
    if (!left) return
    left.innerHTML = `${table(summary.counts)}<div class="rack-audit"><div class="rack-audit-title">Where these numbers came from</div>${rowList('Prepped', summary.prepped)}${rowList('Processed', summary.processed)}<div class="rack-audit-empty">Strict mode: a row must include a rack-like ID containing a number and a material word like SPEED or Decom. Board titles such as SPEED Night Shift are ignored.</div></div>`
  }
  document.addEventListener('DOMContentLoaded', patch)
  setInterval(patch, 1500)
  patch()
})()
