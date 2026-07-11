export function sidebarV3Plugin() {
  return {
    name: 'staffboard-sidebar-v3',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      const oldShell = `  return (\n    <div className={state.darkMode ? "app dark" : "app"} style={{ gridTemplateColumns: sidebarOpen ? "320px minmax(0,1fr)" : "minmax(0,1fr)" }}>\n      <button className="sidebar-toggle" onClick={() => setSidebarOpen((v) => !v)}>{sidebarOpen ? "Hide Menu" : "Show Menu"}</button>\n      {sidebarOpen && (\n      <aside className="sidebar">`
      const newShell = `  return (\n    <div className={state.darkMode ? "app dark staffboard-shell-v3" : "app staffboard-shell-v3"} data-staffboard-shell="true" data-main-tab={mainTab}>\n      <button type="button" className="sidebar-toggle sidebar-toggle-v3" data-sidebar-toggle aria-controls="staffboard-sidebar" aria-expanded="true" aria-label="Collapse sidebar" title="Collapse sidebar"><span className="sidebar-toggle-icon" aria-hidden="true">‹</span><span className="sr-only">Toggle navigation</span></button>\n      <div className="sidebar-mobile-backdrop" data-sidebar-backdrop aria-hidden="true"></div>\n      <aside id="staffboard-sidebar" className="sidebar sidebar-v3" data-sidebar-v3>\n        <div data-sidebar-enhancement-root="true"></div>`

      if (next.includes(oldShell)) next = next.replace(oldShell, newShell)

      const oldClose = `      </aside>\n      )}\n      <main className="main" ref={captureRef}>`
      const newClose = `      </aside>\n      <main className="main" ref={captureRef}>`
      if (next.includes(oldClose)) next = next.replace(oldClose, newClose)

      return next === code ? null : { code: next, map: null }
    },
  }
}
