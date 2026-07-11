export function darkModeV3ValidationPlugin() {
  return {
    name: 'staffboard-dark-mode-v3-validation',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      const required = [
        'const [uiThemeMode, setUiThemeMode] = useState',
        "window.addEventListener('staffboard:theme-change'",
        'document.documentElement.dataset.theme = mode',
        "uiThemeMode === 'dark' ? \"app dark staffboard-shell-v3\" : \"app staffboard-shell-v3\"",
      ]
      const missing = required.filter((marker) => !code.includes(marker))
      const legacyEffect = "document.body.dataset.theme = state.darkMode ? 'dark' : 'light'"
      if (code.includes(legacyEffect)) missing.push('legacy shared-state body theme effect removed')
      if (missing.length) throw new Error('Dark Mode v3 transforms missing: ' + missing.join(', '))
      return null
    },
  }
}
