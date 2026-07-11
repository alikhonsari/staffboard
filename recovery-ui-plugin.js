export function recoveryUiPlugin() {
  return {
    name: 'staffboard-recovery-ui',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      if (!next.includes("./RecoveryPanel.jsx")) {
        next = `import RecoveryPanel from './RecoveryPanel.jsx'\n` + next
      }

      const topComments = `          <button className={mainTab === 'comments' ? 'primary nav-tab active' : 'secondary nav-tab'} onClick={() => setMainTab('comments')}>Comments</button>`
      if (!next.includes("setMainTab('recovery')}>Recovery")) {
        next = next.replace(topComments, `          <button className={mainTab === 'recovery' ? 'primary nav-tab active' : 'secondary nav-tab'} onClick={() => setMainTab('recovery')}>Recovery</button>\n${topComments}`)
      }

      const sideComments = `            <button className={mainTab === 'comments' ? 'primary sidebar-tab active' : 'secondary sidebar-tab'} onClick={() => setMainTab('comments')}>Comments</button>`
      if (!next.includes("sidebar-tab active' : 'secondary sidebar-tab'} onClick={() => setMainTab('recovery')")) {
        next = next.replace(sideComments, `            <button className={mainTab === 'recovery' ? 'primary sidebar-tab active' : 'secondary sidebar-tab'} onClick={() => setMainTab('recovery')}>Recovery</button>\n${sideComments}`)
      }

      const branchMarker = `        ) : mainTab === 'comments' ? (`
      if (!next.includes('data-recovery-panel-route="true"')) {
        const panel = `        ) : mainTab === 'recovery' ? (\n          <div data-recovery-panel-route="true">\n            <RecoveryPanel\n              state={state}\n              setState={setState}\n              defaultState={defaultState}\n              normalizeState={normalizeState}\n              user={user}\n            />\n          </div>\n${branchMarker}`
        next = next.replace(branchMarker, panel)
      }

      return next === code ? null : { code: next, map: null }
    },
  }
}
