(() => {
  const KEY = 'staffing_board_redo_complete_v2_weekly'
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

  function st() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } }
  function day(s) { return DAYS.includes(s.selectedDay) ? s.selectedDay : 'Monday' }
  function kind(line) {
    const t = String(line || '').toLowerCase()
    if (t.includes('decom')) return 'Decom'
    if (t.includes('speed')) return 'SPEED'
    return 'Other'
  }
  function boardText(line) {
    const t = String(line || '').toLowerCase()
    return t.includes('shift') || t.includes('staffboard') || t.includes('staffing board') || t.includes('week of') || t.includes('lead:') || t.includes('admin:')
  }
  function material(line) { return /\b(decom|speed)\b/i.test(String(line || '')) }
  function qty(line) {
    const raw = String(line || '').trim()
    const a = raw.match(/(?:^|\s)(\d+)\s*(?:x\s*)?(decom|speed)\b/i)
    if (a) return Number(a[1]) || 0
    const b = raw.match(/\b(decom|speed)\b\s*(?:x\s*)?(\d+)(?:\s|$)/i)
    if (b) return Number(b[2]) || 0
    return 0
  }
  function rackId(line) {
    if (boardText(line)) return false
    const hits = String(line || '').match(/\b[A-Z0-9][A-Z0-9-]{3,}\b/gi) || []
    return hits.some((x) => /\d/.test(x) && x.length >= 4)
  }
  function validLine(line) {
    const raw = String(line || '').trim()
    if (!raw || boardText(raw)) return false
    if (/^(group|decom|speed|other|total|prepped|processed|rack id|rack ids|material type|type)$/i.test(raw)) return false
    return material(raw) && (qty(raw) > 0 || rackId(raw))
  }
  function parse(txt) {
    return String(txt || '').split(/\r?\n/).map((x) => x.trim()).filter(validLine).map((raw) => ({ raw, kind: kind(raw), qty: qty(raw) || 1 }))
  }
  function savedText(d, keys) {
    for (const k of keys) {
      const v = d?.rackLists?.[k] ?? d?.opsMetrics?.[k]
      if (typeof v === 'string' && /\b(decom|speed)\b/i.test(v)) return v
    }
    return ''
  }
  function visible(label) {
    const want = label === 'prepped' ? ['paste', 'racks', 'prepped'] : ['paste', 'racks', 'processed']
    const areas = Array.from(document.querySelectorAll('textarea'))
    const direct = areas.find((field) => {
      const box = field.closest('.section,.card,.field,.row,div') || field.parentElement
      const text = (box?.textContent || '').toLowerCase()
      return want.every((w) => text.includes(w))
    })
    if (direct) return direct.value || ''
    const fallback = areas.find((field) => {
      const text = ((field.closest('.section,.card,.field,.row,div') || field.parentElement)?.textContent || '').toLowerCase()
      return label === 'prepped' ? text.includes('prepped') && text.includes('material') : text.includes('processed') && text.includes('material')
    })
    return fallback?.value || ''
  }
  function counts() {
    const s = st(), d = s.weeklyData?.[day(s)] || {}
    const pre = parse(savedText(d, ['preppedMaterialText', 'preppedRackMaterialText', 'preppedRackList', 'preppedRackIds']) || visible('prepped'))
    const rec = parse(savedText(d, ['processedMaterialText', 'processedRackMaterialText', 'processedRackList', 'processedRackIds']) || visible('processed'))
    const c = {
      prep: { Decom: 0, SPEED: 0, Other: 0, total: 0 },
      recovery: { Decom: 0, SPEED: 0, Other: 0, total: 0 },
      total: { Decom: 0, SPEED: 0, Other: 0, total: 0 },
    }
    pre.forEach((r) => { c.prep[r.kind] += r.qty; c.prep.total += r.qty; c.total[r.kind] += r.qty; c.total.total += r.qty })
    rec.forEach((r) => { c.recovery[r.kind] += r.qty; c.recovery.total += r.qty; c.total[r.kind] += r.qty; c.total.total += r.qty })
    return c
  }
  function html(c) {
    return `<div class="rack-simple-card"><div class="rack-simple-head"><strong>Rack Material Counts</strong><span>Prep and Recovery are separate</span></div><table class="opsx-table"><thead><tr><th>Workstream</th><th>Decom</th><th>SPEED</th><th>Other</th><th>Total</th></tr></thead><tbody><tr><td>Prep Racks</td><td>${c.prep.Decom}</td><td>${c.prep.SPEED}</td><td>${c.prep.Other}</td><td>${c.prep.total}</td></tr><tr><td>Recovery Racks</td><td>${c.recovery.Decom}</td><td>${c.recovery.SPEED}</td><td>${c.recovery.Other}</td><td>${c.recovery.total}</td></tr><tr><td><strong>Total Material</strong></td><td><strong>${c.total.Decom}</strong></td><td><strong>${c.total.SPEED}</strong></td><td><strong>${c.total.Other}</strong></td><td><strong>${c.total.total}</strong></td></tr></tbody></table><div class="rack-simple-note">Examples: <b>1 decom</b>, <b>2 speed</b>, or <b>RACK123 SPEED</b>. Work goal still uses Recovery racks + Prep racks + Media only.</div></div>`
  }
  function style() {
    if (document.getElementById('rack-stable-style')) return
    const s = document.createElement('style')
    s.id = 'rack-stable-style'
    s.textContent = `.rack-audit,.rack-audit-empty{display:none!important}.rack-simple-card{display:grid;gap:8px}.rack-simple-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.rack-simple-head strong{font-size:15px}.rack-simple-head span,.rack-simple-note{font-size:12px;color:#64748b;font-weight:800}.rack-simple-note{margin-top:4px}body[data-theme="dark"] .rack-simple-head span,body[data-theme="dark"] .rack-simple-note{color:#c8d6eb}`
    document.head.appendChild(s)
  }
  function patch() {
    style()
    document.querySelectorAll('.rack-audit,.rack-audit-empty').forEach((x) => x.remove())
    const card = document.querySelector('[data-opsx-inline]')
    const left = card?.querySelector('.opsx-grid > div:first-child') || card?.querySelector('.opsx-grid')
    if (!left) return
    const next = html(counts())
    if (left.innerHTML !== next) left.innerHTML = next
  }
  new MutationObserver(patch).observe(document.body, { childList: true, subtree: true })
  setInterval(patch, 500)
  patch()
})()
