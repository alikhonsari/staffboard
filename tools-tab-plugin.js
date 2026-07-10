export function toolsTabPlugin() {
  return {
    name: 'staffboard-tools-tab',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') || code.includes('Copy Day / Templates / Slack Tools')) return null
      const panel = `        ) : mainTab === 'tools' ? (
        <div className="board-shell">
          <div className="board-header"><div><div className="title">Copy Day / Templates / Slack Tools</div><div style={{ marginTop: 8 }}><span className="pill">{state.selectedDay}</span><span className="pill">Week of {state.weekStartDate}</span></div></div><div className="muted">Safe tools with confirmation prompts before overwrite.</div></div>
          <div className="two-col-layout">
            <div className="summary-card-block card"><div className="table-kicker">Copy Selected Day</div><div className="row two"><div><label>Target Day</label><select id="copyDayTarget">{WEEKDAYS.filter((d) => d !== state.selectedDay).map((d) => <option key={d} value={d}>{d}</option>)}</select></div><div><label>Copy Mode</label><select id="copyDayMode"><option value="full">Full Day</option><option value="roster">Roster / Assignments</option><option value="clock">Clock Times Only</option><option value="areas">Areas / Status Only</option><option value="metrics">Goals / Rack Metrics Only</option></select></div></div><button className="primary" onClick={copySelectedDay}>Copy Day</button></div>
            <div className="summary-card-block card"><div className="table-kicker">Templates</div><div className="row two"><button className="secondary" onClick={saveDayTemplate}>Save Current Day as Template</button><div><label>Apply To</label><select id="templateTargetDay">{WEEKDAYS.map((d) => <option key={d} value={d}>{d}</option>)}</select></div></div><div className="row"><div><label>Saved Template</label><select id="templateSelect">{dayTemplates.length ? dayTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>) : <option value="">No templates saved</option>}</select></div></div><button className="primary" onClick={applyDayTemplate}>Apply Template</button></div>
          </div>
          <div className="summary-card-block card"><div className="table-kicker">Slack-ready Copy Buttons</div><div className="row three"><button className="secondary" onClick={() => copySlack('daily')}>Copy Daily Summary for Slack</button><button className="secondary" onClick={() => copySlack('tph')}>Copy TPH Update for Slack</button><button className="secondary" onClick={() => copySlack('issues')}>Copy Staffing Issues for Slack</button></div></div>
        </div>
`
      const next = code.replace("        ) : mainTab === 'comments' ? (", panel + "        ) : mainTab === 'comments' ? (")
      return next === code ? null : { code: next, map: null }
    },
  }
}
