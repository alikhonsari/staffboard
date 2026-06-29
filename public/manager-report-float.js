(() => {
  function style() {
    if (document.getElementById('manager-report-float-style')) return
    const s = document.createElement('style')
    s.id = 'manager-report-float-style'
    s.textContent = `.manager-report-float{position:fixed;right:14px;bottom:58px;z-index:99982;border:0;border-radius:999px;padding:10px 14px;background:#2563eb;color:#fff;font:900 13px Arial;box-shadow:0 14px 34px rgba(37,99,235,.28);cursor:pointer}.manager-report-float:hover{filter:brightness(1.08)}body[data-theme="dark"] .manager-report-float{background:#7dd3fc;color:#071421}@media(max-width:720px){.manager-report-float{right:10px;bottom:104px}}`
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
    b.textContent = 'Manager Report'
    b.onclick = openManagerReport
    document.body.appendChild(b)
  }
  document.addEventListener('DOMContentLoaded', ensure)
  setInterval(ensure, 2000)
  ensure()
})()
