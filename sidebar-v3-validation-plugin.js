import fs from 'node:fs'
import path from 'node:path'

export function sidebarV3ValidationPlugin() {
  return {
    name: 'staffboard-sidebar-v3-validation',
    enforce: 'pre',
    buildStart() {
      const requiredFiles = [
        ['public/sidebar-v3.js', ['staffboard.sidebar.v3.', 'data-sidebar-nav', 'sidebar-mobile-open', 'aria-current']],
        ['public/sidebar-v3.css', ['.sidebar-collapsed', '.sidebar-mobile-open', '.sidebar-toggle-v3', 'prefers-reduced-motion']],
      ]
      requiredFiles.forEach(([filename, markers]) => {
        const fullPath = path.join(process.cwd(), filename)
        if (!fs.existsSync(fullPath)) throw new Error('Sidebar v3 asset missing: ' + filename)
        const source = fs.readFileSync(fullPath, 'utf8')
        const missing = markers.filter((marker) => !source.includes(marker))
        if (missing.length) throw new Error('Sidebar v3 asset markers missing from ' + filename + ': ' + missing.join(', '))
      })
    },
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      const required = [
        'data-staffboard-shell="true"',
        'data-sidebar-toggle',
        'data-sidebar-backdrop',
        'data-sidebar-v3',
        'data-sidebar-enhancement-root="true"',
      ]
      const missing = required.filter((marker) => !code.includes(marker))
      if (missing.length) throw new Error('Sidebar v3 App transform missing: ' + missing.join(', '))
      if (code.includes('>{sidebarOpen ? "Hide Menu" : "Show Menu"}</button>')) {
        throw new Error('Legacy Show/Hide Menu button survived Sidebar v3 transform')
      }
      return null
    },
  }
}
