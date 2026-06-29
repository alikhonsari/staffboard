(() => {
  function loadDensity() {
    if (!document.querySelector('[data-zoom-out-ui]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = '/zoom-out-ui.css'
      link.dataset.zoomOutUi = 'true'
      document.head.appendChild(link)
    }
  }
  function style() {
    loadDensity()
    if (document.getElementById('manager-report-float-style')) return
    const s = document.createElement('style')
    s.id = 'manager-report-float-style'
    s.textContent = `
      .manager-report-float{position:fixed!important;top:12px!important;right:14px!important;bottom:auto!important;left:auto!important;z-index:100050!important;width:auto!important;min-width:0!important;max-width:170px!important;min-height:0!important;height:auto!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;border:0!important;border-radius:999px!important;padding:7px 11px!important;background:#2563eb!important;color:#fff!important;font:900 12px Arial!important;line-height:1!important;box-shadow:0 10px 24px rgba(37,99,235,.22)!important;cursor:pointer!important}.manager-report-float:hover{filter:brightness(1.08)!important}body[data-theme="dark"] .manager-report-float{background:#7dd3fc!important;color:#071421!important}@media(max-width:720px){.manager-report-float{top:10px!important;right:10px!important;font-size:11px!important;padding:7px 10px!important}}
    `
    document.head.appendChild(s)
  }
  function openManagerReport() {
    const btn = document.querySelector('[data-manager-report-button]')
    if (btn) return btn.click()
    const scriptLoaded = document.querySelector('[data-manager-tph-file]')
    if (!scriptLoaded) {
      const s = document.createElement('script')
      s.src = '/manager-tph.js'
      s.dataset.managerTphFile = 'true'
      document.body.appendChild(s)
    }
    setTimeout(() => {
      const later = document.querySelector('[data-manager-report-button]')
      if (later) later.click()
      else alert('Manager Report is still loading. Refresh the page and try again.')
    }, 700)
  }
  function ensure() {
    style()
    if (document.querySelector('[data-manager-report-float]')) return
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'manager-report-float'
    b.dataset.managerReportFloat = 'true'
    b.textContent = 'Manager'
    b.onclick = openManagerReport
    document.body.appendChild(b)
  }
  document.addEventListener('DOMContentLoaded', ensure)
  setInterval(ensure, 2000)
  ensure()
})()

;(() => {
  const KEY = 'staffing_board_redo_complete_v2_weekly'
  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday']
  const SHIFT_HOURS = 8
  const one = (v) => Number(v || 0).toFixed(1)
  function st(){ try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } }
  function day(s){ return DAYS.includes(s.selectedDay) ? s.selectedDay : 'Monday' }
  function isNight(s){ return String(s.boardShift || '').toLowerCase().includes('night') }
  function base(s){ const d = new Date(`${s.weekStartDate || new Date().toISOString().slice(0,10)}T00:00:00`); d.setDate(d.getDate() + Math.max(0, DAYS.indexOf(day(s)))); return d }
  function info(){
    const s = st(), now = new Date(), start = base(s), end = base(s), br = base(s)
    if (isNight(s)) { start.setHours(17,0,0,0); end.setDate(end.getDate()+1); end.setHours(1,30,0,0); br.setHours(21,0,0,0) }
    else { start.setHours(8,0,0,0); end.setHours(16,30,0,0); br.setHours(12,0,0,0) }
    const brEnd = new Date(br); brEnd.setMinutes(brEnd.getMinutes()+30)
    let worked = 0, remaining = 0
    if (now <= start) remaining = SHIFT_HOURS
    else if (now >= end) worked = SHIFT_HOURS
    else {
      const since = (now-start)/60000, toEnd = (end-now)/60000
      let brUsed = 0, brLeft = 0
      if (now >= brEnd) brUsed = 30; else if (now > br && now < brEnd) brUsed = (now-br)/60000
      if (now < br) brLeft = 30; else if (now >= br && now < brEnd) brLeft = (brEnd-now)/60000
      worked = Math.max(0,(since-brUsed)/60); remaining = Math.max(0,(toEnd-brLeft)/60)
    }
    return { worked: Math.max(0,Math.min(SHIFT_HOURS,worked)), remaining: Math.max(0,Math.min(SHIFT_HOURS,remaining)), start: start.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}), end: end.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}) }
  }
  function patch(){
    const x = info()
    document.querySelectorAll('.kpi,.ops,.progress-card,.summary-card,.dashboard-card,.png-meta-pill').forEach((el) => {
      const t = (el.textContent || '').toLowerCase()
      if (t.includes('hours worked') && t.includes('remaining')) {
        const target = el.querySelector('strong,.kpi-value,.ops-value,.summary-value')
        if (target) target.textContent = `${one(x.worked)}h / ${one(x.remaining)}h`
        el.title = `Shift ${x.start} - ${x.end}`
      }
    })
    document.querySelectorAll('.manager-report-grid div,.unweighted-grid div').forEach((el) => {
      const t = (el.textContent || '').toLowerCase()
      if (t.includes('hours left')) {
        const strong = el.querySelector('strong')
        const small = el.querySelector('small')
        if (strong) strong.textContent = one(x.remaining)
        if (small) small.textContent = `${one(x.worked)} elapsed · ${x.start}-${x.end}`
      }
    })
  }
  document.addEventListener('DOMContentLoaded', patch)
  new MutationObserver(patch).observe(document.body, { childList:true, subtree:true })
  setInterval(patch, 1000)
  patch()
})()
