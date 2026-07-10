export function shiftContextUxPlugin() {
  return {
    name: 'staffboard-shift-context-ux',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') || code.includes('Currently editing scope')) return null
      const marker = `        </div>\n\n        {mainTab === 'board' ? (`
      const block = `        </div>\n\n        <div className="card" style={{ marginBottom: 12, padding: 12 }}>\n          <div className="table-kicker">Currently editing scope</div>\n          <div className="strong">{currentEditingLabel}</div>\n          <div className="small">Board ID: {state.currentBoardId} · Admin: {enhancementAdmin} · Data is isolated by board, shift, week, and day.</div>\n        </div>\n        {state.scopeWarnings?.length ? <div className="card" style={{ marginBottom: 12, padding: 12, borderColor: '#f59e0b' }}><div className="table-kicker status-warn">State validation notice</div>{state.scopeWarnings.map((warning, index) => <div className="small" key={index}>{warning}</div>)}</div> : null}\n\n        {mainTab === 'board' ? (`
      const next = code.replace(marker, block)
      return next === code ? null : { code: next, map: null }
    },
  }
}
