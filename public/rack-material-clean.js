(() => {
  const KEY = 'staffing_board_redo_complete_v2_weekly'

  function readState() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } }
  function kind(text) { const t = String(text || '').toLowerCase(); return t.includes('decom') ? 'Decom' : t.includes('speed') ? 'SPEED' : 'Other' }
  function quantity(text) {
    const raw = String(text || '').trim()
    const a = raw.match(/(?:^|\s)(\d+)\s*(?:x\s*)?(decom|speed)\b/i)
    if (a) return Number(a[1]) || 0
    const b = raw.match(/\b(decom|speed)\b\s*(?:x\s*)?(\d+)(?:\s|$)/i)
    if (b) return Number(b[2]) || 0
    return 0
  }
  function isBoardText(text) {
    const t = String(text || '').toLowerCase()
    return t.includes('shift') || t.includes('staffboard') || t.includes('staffing board') || t.includes('week of') || t.includes('lead:') || t.includes('admin:')
  }
  function hasRackId(text) {
    if (isBoardText(text)) return false
    const hits = String(text || '').match(/\b[A-Z0-9][A-Z0-9-]{3,}\b/gi) || []
    return hits.some((x) => /\d/.test(x) && x.length >= 4)
  }
  function isMaterialRow(line) {
    const raw = String(line || '').trim()
    if (!raw || isBoardText(raw)) return false
    if (/^(group|decom|speed|other|total|prepped|processed|recovered|rack id|rack ids|material type|type)$/i.test(raw)) return false
    return /\b(decom|speed)\b/i.test(raw) && (quantity(raw) > 0 || hasRackId(raw))
  }
  function parse(text) {
    const out = { Decom: 0, SPEED: 0, Other: 0, total: 0 }
    String(text || '').split(/\r?\n/).map((x) => x.trim()).filter(isMaterialRow).forEach((line) => {
      const q = quantity(line) || 1
      const k = kind(line)
      out[k] += q
      out.total += q
    })
    return out
  }
  function findPasteText(type) {
    const terms = type === 'prep' ? ['paste', 'racks', 'prepped'] : ['paste', 'racks', 'processed']
    const boxes = Array.from(document.querySelectorAll('textarea'))
    const box = boxes.find((area) => {
      const host = area.closest('.section,.card,.field,.row,div') || area.parentElement
      const text = (host?.textContent || '').toLowerCase()
      return terms.every((term) => text.includes(term))
    })
    return box?.value || ''
  }
  function totals() {
    return { prep: parse(findPasteText('prep')), recovery: parse(findPasteText('recovery')) }
  }
  function cell(title, c) {
    return `<div class="rack-clean-cell"><span>${title}</span><strong>${c.total}</strong><small>Decom ${c.Decom} · SPEED ${c.SPEED} · Other ${c.Other}</small></div>`
  }
  function html(t) {
    return `<div class="rack-clean" data-rack-clean="true"><div class="rack-clean-title"><strong>Rack Material Breakdown</strong><span>Separate from TPH/Goal</span></div><div class="rack-clean-grid">${cell('Prepped Racks', t.prep)}${cell('Recovered Racks', t.recovery)}</div><div class="rack-clean-note">This only counts the pasted material lists. Goal/TPH uses the numeric Recovery + Prep + Media fields separately.</div></div>`
  }
  function style() {
    if (document.getElementById('rack-clean-style')) return
    const s = document.createElement('style')
    s.id = 'rack-clean-style'
    s.textContent = `.rack-clean{margin:10px 0 12px;padding:12px;border:1px solid #d8e1ec;border-radius:18px;background:linear-gradient(180deg,#fff,#f8fbff)}.rack-clean-title{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}.rack-clean-title strong{font-size:15px}.rack-clean-title span,.rack-clean-note{font-size:12px;color:#64748b;font-weight:850}.rack-clean-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.rack-clean-cell{border:1px solid #e5edf6;border-radius:15px;background:#fff;padding:11px}.rack-clean-cell span{display:block;text-transform:uppercase;letter-spacing:.055em;font-size:11px;font-weight:950;color:#64748b}.rack-clean-cell strong{display:block;font-size:30px;line-height:1;color:#1d4ed8;margin-top:3px}.rack-clean-cell small{display:block;margin-top:5px;color:#334155;font-weight:850}.rack-clean-note{margin-top:9px}.old-material-hidden{display:none!important}body[data-theme="dark"] .rack-clean,body[data-theme="dark"] .rack-clean-cell{background:#263852;color:#fff;border-color:#536986}body[data-theme="dark"] .rack-clean-title span,body[data-theme="dark"] .rack-clean-note,body[data-theme="dark"] .rack-clean-cell span,body[data-theme="dark"] .rack-clean-cell small{color:#c8d6eb}body[data-theme="dark"] .rack-clean-cell strong{color:#7dd3fc}@media(max-width:800px){.rack-clean-grid{grid-template-columns:1fr}}`
    document.head.appendChild(s)
  }
  function hideOldMaterialLine() {
    Array.from(document.querySelectorAll('.kpi,.ops,.summary-card,.card,.summary-card-block')).forEach((el) => {
      const text = (el.textContent || '').toLowerCase()
      if (text.includes('material types') && text.includes('decom') && text.includes('speed') && !el.querySelector('[data-rack-clean]')) el.classList.add('old-material-hidden')
    })
  }
  function inject() {
    style()
    hideOldMaterialLine()
    const t = totals()
    document.querySelectorAll('[data-rack-clean]').forEach((x) => x.remove())
    const title = Array.from(document.querySelectorAll('.table-kicker,h2,.title')).find((el) => /Rack ID Summary/i.test(el.textContent || ''))
    const host = title?.closest('.card,.summary-card-block,.board-shell,.section')
    if (host) host.insertAdjacentHTML('beforeend', html(t))
  }
  document.addEventListener('DOMContentLoaded', inject)
  setInterval(inject, 1200)
  inject()
})()
