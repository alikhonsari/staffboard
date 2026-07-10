export function toolsTabPlugin() {
  return {
    name: 'staffboard-tools-tab',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') || code.includes('Copy Day / Templates / Slack Tools')) return null
      const panel = `        ) : mainTab === 'tools' ? (
        <div className="board-shell">
          <div className="board-header">
            <div><div className="title">Copy Day / Templates / Slack Tools</div><div style={{ marginTop: 8 }}><span className="pill">{boardLabel}</span><span className="pill">{activeScopeShift}</span><span className="pill">{state.selectedDay}</span><span className="pill">Week of {state.weekStartDate}</span></div></div>
            <div className="muted">Actions default to the current board and shift. Cross-shift actions always require an explicit warning confirmation.</div>
          </div>
          <div className="two-col-layout">
            <div className="summary-card-block card">
              <div className="table-kicker">Copy Selected Day</div>
              <div className="small">Source: {state.currentBoardId} · {activeScopeShift} · {state.selectedDay} · Week {weekInfo.week}</div>
              <div className="row two"><div><label>Target Board / Shift</label><select id="copyTargetBoard" defaultValue={state.currentBoardId}>{Object.entries(BOARD_PRESETS).map(([id, preset]) => <option key={id} value={id}>{preset.label}</option>)}</select></div><div><label>Target Day</label><select id="copyDayTarget">{WEEKDAYS.filter((d) => d !== state.selectedDay).map((d) => <option key={d} value={d}>{d}</option>)}</select></div></div>
              <div className="row"><div><label>Copy Mode</label><select id="copyDayMode"><option value="full">Full Day</option><option value="roster">Roster / Assignments</option><option value="clock">Clock Times Only</option><option value="areas">Areas / Status Only</option><option value="metrics">Goals / Rack Metrics Only</option></select></div></div>
              <button className="primary" onClick={copySelectedDayScoped}>Copy Day with Scope Check</button>
            </div>
            <div className="summary-card-block card">
              <div className="table-kicker">Shift-aware Templates</div>
              <div className="row two"><div><label>Template Scope</label><select id="templateScope"><option value="board">Current Board Only</option><option value="shift">Current Shift Across Boards</option><option value="global">Global Template</option></select></div><div><label>Apply To</label><select id="templateTargetDay">{WEEKDAYS.map((d) => <option key={d} value={d}>{d}</option>)}</select></div></div>
              <button className="secondary" onClick={saveScopedDayTemplate}>Save Current Day as Template</button>
              <div className="row"><div><label>Compatible Saved Template</label><select id="templateSelect">{dayTemplates.length ? dayTemplates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.scope || 'board'} · {t.shift || 'legacy'} · {t.createdBy || 'legacy'}</option>) : <option value="">No compatible templates saved</option>}</select></div></div>
              <button className="primary" onClick={applyScopedDayTemplate}>Apply Template with Scope Check</button>
              <div className="small">Template metadata includes creator, board, shift, source week/day, and created time.</div>
            </div>
          </div>
          <div className="summary-card-block card"><div className="table-kicker">Slack-ready and Comparison Tools</div><div className="row three"><button className="secondary" onClick={() => copySlack('daily')}>Copy Daily Summary for Slack</button><button className="secondary" onClick={() => copySlack('tph')}>Copy TPH Update for Slack</button><button className="secondary" onClick={() => copySlack('issues')}>Copy Staffing Issues for Slack</button></div><div className="row three"><button className="secondary" onClick={copyHandoffSlack}>Copy Day/Night Handoff</button><button className="secondary" onClick={exportShiftComparisonCsv}>Export Day vs Night Comparison CSV</button><button className="secondary" onClick={exportWeeklyPdf}>Export Current Shift Weekly PDF</button></div></div>
        </div>
`
      const next = code.replace("        ) : mainTab === 'comments' ? (", panel + "        ) : mainTab === 'comments' ? (")
      return next === code ? null : { code: next, map: null }
    },
  }
}
