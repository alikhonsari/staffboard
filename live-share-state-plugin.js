const STATE_DECLARATION = "  const [state, setState] = useState(() => normalizeState(loadState(defaultState)))"

export function injectLiveShareState(source) {
  if (source.includes('window.__STAFFBOARD_SHARE_STATE__')) return source
  if (!source.includes(STATE_DECLARATION)) throw new Error('Live share-state transform could not locate StaffBoard state declaration.')
  return source.replace(
    STATE_DECLARATION,
    `${STATE_DECLARATION}\n  useEffect(() => {\n    window.__STAFFBOARD_SHARE_STATE__ = state\n    window.dispatchEvent(new CustomEvent('staffboard:share-state-updated', { detail: {\n      boardId: state.currentBoardId || '',\n      weekStartDate: state.weekStartDate || '',\n      selectedDay: state.selectedDay || '',\n    } }))\n    return () => {\n      if (window.__STAFFBOARD_SHARE_STATE__ === state) delete window.__STAFFBOARD_SHARE_STATE__\n    }\n  }, [state])`,
  )
}

export function liveShareStatePlugin() {
  return {
    name: 'live-share-state',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      return { code: injectLiveShareState(source), map: null }
    },
  }
}
