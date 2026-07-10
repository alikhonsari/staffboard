export function enhancementNavPlugin() {
  return {
    name: 'staffboard-enhancement-nav',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx') || code.includes("setMainTab('manager')")) return null
      const oldLine = `          <button className={mainTab === 'comments' ? 'primary nav-tab active' : 'secondary nav-tab'} onClick={() => setMainTab('comments')}>Comments</button>`
      const newLine = `          <button className={mainTab === 'manager' ? 'primary nav-tab active' : 'secondary nav-tab'} onClick={() => setMainTab('manager')}>Manager</button>
          <button className={mainTab === 'audit' ? 'primary nav-tab active' : 'secondary nav-tab'} onClick={() => setMainTab('audit')}>Audit Log</button>
          <button className={mainTab === 'tools' ? 'primary nav-tab active' : 'secondary nav-tab'} onClick={() => setMainTab('tools')}>Tools</button>
          <button className={mainTab === 'suggestions' ? 'primary nav-tab active' : 'secondary nav-tab'} onClick={() => setMainTab('suggestions')}>Suggestions</button>
          <button className={mainTab === 'comments' ? 'primary nav-tab active' : 'secondary nav-tab'} onClick={() => setMainTab('comments')}>Comments</button>`
      const next = code.replace(oldLine, newLine)
      return next === code ? null : { code: next, map: null }
    },
  }
}
