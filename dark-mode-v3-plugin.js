export function darkModeV3Plugin() {
  return {
    name: 'staffboard-dark-mode-v3',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      const stateMarker = "  const [syncStatus, setSyncStatus] = useState('Loading...')"
      if (!next.includes('const [uiThemeMode, setUiThemeMode] = useState')) {
        const themeState = `${stateMarker}\n  const [uiThemeMode, setUiThemeMode] = useState(() => {\n    const preloaded = document.documentElement.dataset.theme\n    if (preloaded === 'dark' || preloaded === 'light') return preloaded\n    return state.darkMode ? 'dark' : 'light'\n  })`
        next = next.replace(stateMarker, themeState)
      }

      const oldEffect = `  useEffect(() => {\n    document.body.dataset.theme = state.darkMode ? 'dark' : 'light'\n  }, [state.darkMode])`
      const newEffect = `  useEffect(() => {\n    const mode = uiThemeMode === 'dark' ? 'dark' : 'light'\n    document.documentElement.dataset.theme = mode\n    document.body.dataset.theme = mode\n    document.documentElement.style.colorScheme = mode\n    document.body.classList.toggle('theme-dark-v3', mode === 'dark')\n    document.querySelector('[data-staffboard-shell]')?.classList.toggle('dark', mode === 'dark')\n\n    const onThemeChange = (event) => {\n      const requested = event?.detail?.theme\n      if (requested === 'dark' || requested === 'light') setUiThemeMode(requested)\n    }\n    window.addEventListener('staffboard:theme-change', onThemeChange)\n    return () => window.removeEventListener('staffboard:theme-change', onThemeChange)\n  }, [uiThemeMode])`
      next = next.replace(oldEffect, newEffect)

      next = next.replaceAll('state.darkMode ?', "uiThemeMode === 'dark' ?")

      return next === code ? null : { code: next, map: null }
    },
  }
}
