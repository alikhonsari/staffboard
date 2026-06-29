(() => {
  function loadDensity() {
    if (!document.querySelector('[data-zoom-out-ui]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = '/zoom-out-ui.css'
      link.dataset.zoomOutUi = 'true'
      document.head.appendChild(link)
    }
    if (!document.querySelector('[data-tph-hours-fix-file]')) {
      const script = document.createElement('script')
      script.src = '/tph-hours-fix.js?v=2'
      script.dataset.tphHoursFixFile = 'true'
      document.body.appendChild(script)
    }
  }

  function sessionFallback() {
    setTimeout(() => {
      const text = document.body?.textContent || ''
      if (!/Checking session/i.test(text)) return
      localStorage.removeItem('staffboard2_token')
      localStorage.removeItem('staffboard2_user')
      const card = document.querySelector('.login-card')
      if (card) {
        card.innerHTML = '<h1>StaffBoard 2.0</h1><p>Session check timed out. Reloading login...</p>'
      }
      setTimeout(() => window.location.reload(), 700)
    }, 5000)
  }

  function style() {
    loadDensity()
    if (document.getElementById('manager-report-float-style')) return
    const s = document.createElement('style')
    s.id = 'manager-report-float-style'
    s.textContent = `
      .manager-report-float{
        position:fixed!important;
        top:12px!important;
        right:14px!important;
        bottom:auto!important;
        left:auto!important;
        z-index:100050!important;
        width:auto!important;
        min-width:0!important;
        max-width:170px!important;
        min-height:0!important;
        height:auto!important;
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        border:0!important;
        border-radius:999px!important;
        padding:7px 11px!important;
        background:#2563eb!important;
        color:#fff!important;
        font:900 12px Arial!important;
        line-height:1!important;
        box-shadow:0 10px 24px rgba(37,99,235,.22)!important;
        cursor:pointer!important;
      }
      .manager-report-float:hover{filter:brightness(1.08)!important}
      body[data-theme="dark"] .manager-report-float{background:#7dd3fc!important;color:#071421!important}
      @media(max-width:720px){.manager-report-float{top:10px!important;right:10px!important;font-size:11px!important;padding:7px 10px!important}}
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
    sessionFallback()
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
