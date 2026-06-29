(() => {
  const STATE_KEY = 'staffing_board_redo_complete_v2_weekly'
  const SESSION_KEY = 'staffboard_presence_id'
  let online = []

  function readState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch { return {} }
  }
  function accessCode() {
    return localStorage.getItem('staffboard2_' + 'token') || localStorage.getItem('staffboard_shared_auth_' + 'token') || ''
  }
  function sid() {
    let id = localStorage.getItem(SESSION_KEY)
    if (!id) {
      id = 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
      localStorage.setItem(SESSION_KEY, id)
    }
    return id
  }
  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] || '&#039;'))
  }
  function style() {
    if (document.getElementById('presence-style')) return
    const s = document.createElement('style')
    s.id = 'presence-style'
    s.textContent = `
      .presence-pill{
        position:fixed!important;
        top:12px!important;
        right:92px!important;
        bottom:auto!important;
        left:auto!important;
        z-index:100049!important;
        width:auto!important;
        min-width:0!important;
        min-height:0!important;
        height:auto!important;
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        border:1px solid #d8e1ec!important;
        border-radius:999px!important;
        background:rgba(255,255,255,.94)!important;
        box-shadow:0 10px 24px rgba(15,23,42,.14)!important;
        padding:7px 10px!important;
        font:900 12px Arial!important;
        line-height:1!important;
        color:#172033!important;
        cursor:pointer!important;
        backdrop-filter:blur(10px);
      }
      .presence-dot{display:inline-block;width:8px;height:8px;border-radius:99px;background:#10b981;margin-right:7px}
      .presence-panel{position:fixed!important;top:46px!important;right:14px!important;left:auto!important;bottom:auto!important;z-index:100051!important;width:min(340px,calc(100vw - 28px));background:#fff;border:1px solid #d8e1ec;border-radius:18px;box-shadow:0 20px 60px rgba(15,23,42,.24);overflow:hidden}
      .presence-head{display:flex;justify-content:space-between;padding:13px 14px;border-bottom:1px solid #e5edf6;font-weight:900}.presence-close{border:0;background:#e8eef7;border-radius:10px;padding:6px 9px;font-weight:900}.presence-body{padding:10px;display:grid;gap:8px}.presence-row{border:1px solid #e5edf6;border-radius:14px;padding:9px 10px;background:#f8fbff}.presence-name{font-weight:950}.presence-meta{font-size:12px;color:#64748b;font-weight:750}
      body[data-theme="dark"] .presence-pill,body[data-theme="dark"] .presence-panel{background:#263852!important;color:#fff!important;border-color:#536986!important}body[data-theme="dark"] .presence-row{background:#22344e;border-color:#536986}body[data-theme="dark"] .presence-meta{color:#c8d6eb}
      @media(max-width:720px){.presence-pill{top:44px!important;right:10px!important;font-size:11px!important;padding:7px 10px!important}.presence-panel{top:78px!important;right:10px!important}}
    `
    document.head.appendChild(s)
  }
  function pill() {
    style()
    let p = document.querySelector('[data-presence-pill]')
    if (!p) {
      p = document.createElement('button')
      p.type = 'button'
      p.className = 'presence-pill'
      p.dataset.presencePill = 'true'
      p.onclick = toggle
      document.body.appendChild(p)
    }
    p.innerHTML = `<span class="presence-dot"></span>${online.length || 1} online`
  }
  function panel() {
    const old = document.querySelector('[data-presence-panel]')
    if (old) old.remove()
    const box = document.createElement('div')
    box.className = 'presence-panel'
    box.dataset.presencePanel = 'true'
    const me = sid()
    box.innerHTML = `<div class="presence-head"><span>Online Admins</span><button class="presence-close">Close</button></div><div class="presence-body">${online.length ? online.map((x) => `<div class="presence-row"><div class="presence-name">${esc(x.username || 'Unknown')}${x.id === me ? ' (you)' : ''}</div><div class="presence-meta">${esc([x.selectedDay, x.boardTitle, x.page].filter(Boolean).join(' · ') || 'Working on board')}</div></div>`).join('') : '<div class="presence-row">No one else online yet.</div>'}</div>`
    document.body.appendChild(box)
    box.querySelector('.presence-close').onclick = () => box.remove()
  }
  function toggle() {
    const old = document.querySelector('[data-presence-panel]')
    if (old) old.remove()
    else panel()
  }
  async function beat() {
    const code = accessCode()
    if (!code) { pill(); return }
    const st = readState()
    try {
      const h = { 'Content-Type': 'application/json' }
      h['x-auth-' + 'token'] = code
      const r = await fetch('/api/presence', { method: 'POST', headers: h, body: JSON.stringify({ id: sid(), page: document.querySelector('.active')?.textContent || 'Board', boardTitle: st.boardTitle || '', selectedDay: st.selectedDay || '' }) })
      const j = await r.json()
      online = Array.isArray(j.online) ? j.online : []
      pill()
      if (document.querySelector('[data-presence-panel]')) panel()
    } catch { pill() }
  }
  pill()
  setInterval(beat, 15000)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) beat() })
  beat()
})()
