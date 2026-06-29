(() => {
  const KEY = 'staffing_board_redo_complete_v2_weekly'
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

  function st() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } }
  function day(s) { return DAYS.includes(s.selectedDay) ? s.selectedDay : 'Monday' }
  function kind(line) { const t = String(line).toLowerCase(); return t.includes('decom') ? 'Decom' : t.includes('speed') ? 'SPEED' : 'Other' }
  function boardText(line) { const t = String(line || '').toLowerCase(); return t.includes('shift') || t.includes('staffboard') || t.includes('staffing board') || t.includes('week of') || t.includes('lead:') || t.includes('admin:') }
  function rackId(line) {
    if (boardText(line)) return false
    const hits = String(line || '').match(/\b[A-Z0-9][A-Z0-9-]{3,}\b/gi) || []
    return hits.some((x) => /\d/.test(x) && x.length >= 4)
  }
  function row(line) {
    const raw = String(line || '').trim()
    if (!raw || boardText(raw)) return false
    if (/^(group|decom|speed|other|total|prepped|processed|rack id|rack ids|material type|type)$/i.test(raw)) return false
    return rackId(raw) && /\b(decom|speed)\b/i.test(raw)
  }
  function parse(txt) { return String(txt || '').split(/\r?\n/).map((x) => x.trim()).filter(row).map((raw) => ({ raw, kind: kind(raw) })) }
  function savedText(d, keys) { for (const k of keys) { const v = d?.rackLists?.[k] ?? d?.opsMetrics?.[k]; if (v) return String(v) } return '' }
  function visible(label) {
    const words = label === 'prepped' ? ['prepped', 'rack'] : ['processed', 'rack']
    const els = Array.from(document.querySelectorAll('label,.table-kicker,.ops-label,.small,div,span'))
    const hit = els.find((el) => words.every((w) => (el.textContent || '').toLowerCase().includes(w)))
    const host = hit?.closest('.card,.summary-card-block,.ops,.field,div') || hit?.parentElement
    return host?.querySelector('textarea,input')?.value || ''
  }
  function counts() {
    const s = st(), d = s.weeklyData?.[day(s)] || {}
    const pre = parse(savedText(d, ['prepped', 'preppedRackList', 'preppedRackIds', 'rackPrepIds']) || visible('prepped'))
    const pro = parse(savedText(d, ['processed', 'processedRackList', 'processedRackIds', 'rackProcessedIds']) || visible('processed'))
    const c = { prepped: { Decom: 0, SPEED: 0, Other: 0, total: pre.length }, processed: { Decom: 0, SPEED: 0, Other: 0, total: pro.length }, total: { Decom: 0, SPEED: 0, Other: 0, total: pre.length + pro.length } }
    pre.forEach((r) => { c.prepped[r.kind]++; c.total[r.kind]++ })
    pro.forEach((r) => { c.processed[r.kind]++; c.total[r.kind]++ })
    return c
  }
  function html(c) { return `<table class="opsx-table"><thead><tr><th>Group</th><th>Decom</th><th>SPEED</th><th>Other</th><th>Total</th></tr></thead><tbody><tr><td>Prepped</td><td>${c.prepped.Decom}</td><td>${c.prepped.SPEED}</td><td>${c.prepped.Other}</td><td>${c.prepped.total}</td></tr><tr><td>Processed</td><td>${c.processed.Decom}</td><td>${c.processed.SPEED}</td><td>${c.processed.Other}</td><td>${c.processed.total}</td></tr><tr><td><strong>Total</strong></td><td><strong>${c.total.Decom}</strong></td><td><strong>${c.total.SPEED}</strong></td><td><strong>${c.total.Other}</strong></td><td><strong>${c.total.total}</strong></td></tr></tbody></table>` }
  function style() {
    if (document.getElementById('rack-stable-style')) return
    const s = document.createElement('style')
    s.id = 'rack-stable-style'
    s.textContent = '.rack-audit,.rack-audit-empty{display:none!important}'
    document.head.appendChild(s)
  }
  function patch() {
    style()
    document.querySelectorAll('.rack-audit,.rack-audit-empty').forEach((x) => x.remove())
    const card = document.querySelector('[data-opsx-inline]')
    const left = card?.querySelector('.opsx-grid > div:first-child') || card?.querySelector('.opsx-grid')
    if (!left) return
    const next = html(counts())
    const table = left.querySelector('table')
    if (!table || table.outerHTML !== next) left.innerHTML = next
  }
  new MutationObserver(patch).observe(document.body, { childList: true, subtree: true })
  setInterval(patch, 500)
  patch()
})()
