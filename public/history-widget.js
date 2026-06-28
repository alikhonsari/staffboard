(() => {
  const STYLE_ID = 'staffboard-history-widget-style'
  const MODAL_ID = 'staffboard-history-modal'

  function token() {
    return localStorage.getItem('staffboard2_token') || localStorage.getItem('staffboard_shared_auth_token') || ''
  }

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      .history-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px}
      .history-modal-card{background:#fff;color:#172033;width:min(1100px,96vw);max-height:86vh;overflow:auto;border-radius:20px;box-shadow:0 28px 80px rgba(15,23,42,.35);border:1px solid #d8e1ec}
      .history-modal-head{position:sticky;top:0;background:#fff;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid #e5edf6}
      .history-modal-head h2{margin:0;font-size:22px}
      .history-modal-body{padding:18px 20px}
      .history-close,.history-refresh{border:0;border-radius:10px;padding:9px 12px;font-weight:800;cursor:pointer;background:#e8eef7;color:#172033}
      .history-refresh{background:#2563eb;color:white}
      .history-table{width:100%;border-collapse:collapse;font-size:13px}
      .history-table th,.history-table td{padding:10px;border-bottom:1px solid #e5edf6;text-align:left;vertical-align:top}
      .history-table th{background:#f3f6fb;font-size:12px;text-transform:uppercase;color:#53647c}
      .history-muted{color:#66748a;font-size:13px}
      .history-error{background:#fee2e2;color:#991b1b;border:1px solid #fecaca;padding:12px;border-radius:12px;margin-bottom:12px}
    `
    document.head.appendChild(style)
  }

  function ensureHistoryButtons() {
    const navs = document.querySelectorAll('.app-nav-tabs, .sidebar-tabs')
    navs.forEach((nav) => {
      if (nav.querySelector('[data-history-tab]')) return
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.dataset.historyTab = 'true'
      btn.className = nav.classList.contains('app-nav-tabs') ? 'secondary nav-tab' : 'secondary sidebar-tab'
      btn.textContent = 'History'
      btn.addEventListener('click', openHistory)
      nav.appendChild(btn)
    })
  }

  async function fetchHistory() {
    const res = await fetch('/api/history', { headers: { Authorization: `Bearer ${token()}` } })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to load history')
    return Array.isArray(data.events) ? data.events : []
  }

  function formatTime(value) {
    if (!value) return '—'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString()
  }

  function rowHtml(event) {
    return `<tr>
      <td>${escapeHtml(formatTime(event.at))}</td>
      <td><strong>${escapeHtml(event.user || '—')}</strong></td>
      <td>${escapeHtml(event.action || 'Saved board')}</td>
      <td>${escapeHtml(event.boardTitle || event.boardId || '—')}</td>
      <td>${escapeHtml(event.weekStartDate || '—')}</td>
      <td>${escapeHtml(event.selectedDay || '—')}</td>
      <td class="history-muted">${escapeHtml(String(event.ip || '—'))}</td>
    </tr>`
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]))
  }

  async function loadIntoModal() {
    const body = document.querySelector(`#${MODAL_ID} .history-modal-body`)
    if (!body) return
    body.innerHTML = '<div class="history-muted">Loading history...</div>'
    try {
      const events = await fetchHistory()
      body.innerHTML = `
        <div class="history-muted" style="margin-bottom:12px">Showing latest ${events.length} saved change events. Auto-save writes a history entry when the shared board is saved.</div>
        <table class="history-table">
          <thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Board</th><th>Week</th><th>Day</th><th>Source</th></tr></thead>
          <tbody>${events.length ? events.map(rowHtml).join('') : '<tr><td colspan="7" class="history-muted">No history yet. Make a change and wait for auto-save.</td></tr>'}</tbody>
        </table>`
    } catch (err) {
      body.innerHTML = `<div class="history-error">${escapeHtml(err.message || 'Could not load history')}</div>`
    }
  }

  function openHistory() {
    addStyle()
    document.getElementById(MODAL_ID)?.remove()
    const modal = document.createElement('div')
    modal.id = MODAL_ID
    modal.className = 'history-modal-backdrop'
    modal.innerHTML = `
      <div class="history-modal-card">
        <div class="history-modal-head">
          <div><h2>Change History</h2><div class="history-muted">Who changed the shared board and when</div></div>
          <div style="display:flex;gap:8px"><button class="history-refresh" type="button">Refresh</button><button class="history-close" type="button">Close</button></div>
        </div>
        <div class="history-modal-body"></div>
      </div>`
    document.body.appendChild(modal)
    modal.querySelector('.history-close').addEventListener('click', () => modal.remove())
    modal.querySelector('.history-refresh').addEventListener('click', loadIntoModal)
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove() })
    loadIntoModal()
  }

  addStyle()
  setInterval(ensureHistoryButtons, 1500)
  document.addEventListener('DOMContentLoaded', ensureHistoryButtons)
  ensureHistoryButtons()
})()
