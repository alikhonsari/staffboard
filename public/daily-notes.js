(() => {
  const STYLE_ID = 'staffboard-daily-notes-style'
  const STATE_KEY = 'staffing_board_redo_complete_v2_weekly'
  const TOKEN_KEYS = ['staffboard2_token', 'staffboard_shared_auth_token']
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  let saveTimer = null

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] || '&#039;'))
  }

  function readState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch { return {} }
  }

  function writeState(state) {
    localStorage.setItem(STATE_KEY, JSON.stringify(state))
  }

  function token() {
    for (const key of TOKEN_KEYS) {
      const value = localStorage.getItem(key)
      if (value) return value
    }
    return ''
  }

  function selectedDay(state) {
    return state.selectedDay || 'Monday'
  }

  function ensureDay(state, day = selectedDay(state)) {
    if (!state.weeklyData) state.weeklyData = {}
    if (!state.weeklyData[day]) state.weeklyData[day] = { assignments: {}, opsMetrics: {}, rackLists: {}, snapshots: {} }
    if (!state.weeklyData[day].dailyComments) {
      state.weeklyData[day].dailyComments = {
        safetyObservations: '',
        performanceShoutouts: '',
        concerns: '',
        builderVoice: '',
        suggestions: '',
        generalNotes: '',
      }
    }
    return state.weeklyData[day]
  }

  function getDailyComments(state, day = selectedDay(state)) {
    return ensureDay(state, day).dailyComments
  }

  function setDailyComment(field, value) {
    const state = readState()
    const day = selectedDay(state)
    const dayData = ensureDay(state, day)
    dayData.dailyComments = { ...dayData.dailyComments, [field]: value }
    state.updatedAt = new Date().toLocaleString()
    writeState(state)
    scheduleRemoteSave(state)
    injectDailyNotesPanel()
    injectDailyPdfNotes()
  }

  function scheduleRemoteSave(state) {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      const auth = token()
      if (!auth) return
      try {
        await fetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
          body: JSON.stringify({ state }),
        })
      } catch (err) {
        console.warn('Daily notes remote save failed', err)
      }
    }, 900)
  }

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      .daily-notes-card{margin:14px 0;padding:14px;border:1px solid var(--line,#d8e1ec);border-radius:18px;background:var(--panel,#fff);box-shadow:0 6px 18px rgba(15,23,42,.04)}
      .daily-notes-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}
      .daily-notes-kicker{font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted,#66748a);font-weight:900}
      .daily-notes-title{font-weight:900;font-size:1.05rem;margin-top:3px}
      .daily-notes-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .daily-notes-field label{display:block;font-size:.78rem;font-weight:900;color:var(--muted,#66748a);margin-bottom:6px}
      .daily-notes-field textarea{width:100%;min-height:92px;border:1px solid var(--line,#d8e1ec);border-radius:12px;padding:10px 12px;background:#fff;color:var(--text,#152033);resize:vertical;font:inherit}
      .daily-notes-field.wide{grid-column:1/-1}.daily-notes-status{font-size:.78rem;color:var(--muted,#66748a);font-weight:800}
      body[data-theme="dark"] .daily-notes-card{background:linear-gradient(180deg,rgba(35,52,78,.96),rgba(30,45,69,.98)) !important;border-color:rgba(166,192,229,.34) !important;color:var(--text) !important}
      body[data-theme="dark"] .daily-notes-field textarea{background:#263852 !important;color:#fff !important;border-color:#5a6f8e !important}
      body[data-theme="dark"] .daily-notes-kicker,body[data-theme="dark"] .daily-notes-status,body[data-theme="dark"] .daily-notes-field label{color:#c8d6eb !important}
      @media(max-width:900px){.daily-notes-grid{grid-template-columns:1fr}.daily-notes-field.wide{grid-column:auto}}
    `
    document.head.appendChild(style)
  }

  function fieldHtml(name, label, value, wide = false) {
    return `<div class="daily-notes-field ${wide ? 'wide' : ''}"><label>${esc(label)}</label><textarea data-daily-note-field="${name}">${esc(value)}</textarea></div>`
  }

  function panelHtml(state) {
    const day = selectedDay(state)
    const comments = getDailyComments(state, day)
    return `<div class="daily-notes-card" data-daily-notes-panel="true">
      <div class="daily-notes-head">
        <div><div class="daily-notes-kicker">Daily Notes / Comments</div><div class="daily-notes-title">${esc(day)} notes for daily report</div></div>
        <div class="daily-notes-status">Auto-saves to shared board</div>
      </div>
      <div class="daily-notes-grid">
        ${fieldHtml('safetyObservations', 'Safety Observations', comments.safetyObservations || '')}
        ${fieldHtml('performanceShoutouts', 'Performance Shoutouts', comments.performanceShoutouts || '')}
        ${fieldHtml('concerns', 'Concerns / Barriers', comments.concerns || '')}
        ${fieldHtml('builderVoice', 'Builder Voice', comments.builderVoice || '')}
        ${fieldHtml('suggestions', 'Suggestions / Next Steps', comments.suggestions || '', true)}
        ${fieldHtml('generalNotes', 'General Daily Notes', comments.generalNotes || '', true)}
      </div>
    </div>`
  }

  function attachEvents(panel) {
    panel.querySelectorAll('[data-daily-note-field]').forEach((textarea) => {
      textarea.addEventListener('input', () => setDailyComment(textarea.dataset.dailyNoteField, textarea.value))
    })
  }

  function injectDailyNotesPanel() {
    addStyle()
    const state = readState()
    const existing = document.querySelector('[data-daily-notes-panel]')
    if (existing) existing.remove()
    const commentsTitle = Array.from(document.querySelectorAll('.title, h2, .table-kicker')).find((el) => /comments|voice/i.test(el.textContent || ''))
    const host = commentsTitle?.closest('.board-shell') || commentsTitle?.parentElement
    if (!host) return
    host.insertAdjacentHTML('afterbegin', panelHtml(state))
    const panel = host.querySelector('[data-daily-notes-panel]')
    if (panel) attachEvents(panel)
  }

  function noteRows(comments) {
    const rows = [
      ['Safety Observations', comments.safetyObservations],
      ['Performance Shoutouts', comments.performanceShoutouts],
      ['Concerns / Barriers', comments.concerns],
      ['Builder Voice', comments.builderVoice],
      ['Suggestions / Next Steps', comments.suggestions],
      ['General Daily Notes', comments.generalNotes],
    ].filter(([, value]) => String(value || '').trim())
    if (!rows.length) return '<tr><td colspan="2">No daily notes entered.</td></tr>'
    return rows.map(([label, value]) => `<tr><td>${esc(label)}</td><td>${esc(value)}</td></tr>`).join('')
  }

  function injectDailyPdfNotes() {
    const state = readState()
    const sheet = document.querySelector('.pdf-report-sheet')
    if (!sheet) return
    sheet.querySelectorAll('[data-daily-notes-pdf]').forEach((el) => el.remove())
    const day = selectedDay(state)
    const comments = getDailyComments(state, day)
    sheet.insertAdjacentHTML('beforeend', `<div class="pdf-chart-card" data-daily-notes-pdf="true"><div class="pdf-chart-title">Daily Notes / Comments - ${esc(day)}</div><table class="pdf-mini-table"><tbody>${noteRows(comments)}</tbody></table></div>`)
  }

  function tick() {
    injectDailyNotesPanel()
    injectDailyPdfNotes()
  }

  addStyle()
  document.addEventListener('DOMContentLoaded', tick)
  setInterval(tick, 2500)
  tick()
})()
