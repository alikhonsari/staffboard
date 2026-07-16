const SYNC_STATE_MARKER = `  const [syncStatus, setSyncStatus] = useState('Loading...')`

const LEGACY_HYDRATION_EFFECT = `  useEffect(() => {
    ;(async () => {
      try {
        const remote = await loadRemoteState(defaultState)
        setState((prev) => normalizeState({ ...prev, ...remote }))
        setSyncStatus('Synced')
      } catch {
        setSyncStatus('Offline fallback')
      }
    })()
  }, [])`

const LEGACY_SAVE_EFFECT = `  useEffect(() => {
    persistState(state)
    const timer = setTimeout(async () => {
      try {
        await saveRemoteState(state)
        setSyncStatus('Synced')
      } catch {
        setSyncStatus('Save pending')
      }
    }, 700)
    return () => clearTimeout(timer)
  }, [state])`

const RESILIENT_HYDRATION_EFFECT = `  useEffect(() => {
    let cancelled = false
    let retryTimer = null
    let attempt = 0

    const hydrateFromPostgres = async () => {
      attempt += 1
      setSyncStatus(attempt === 1 ? 'Loading saved data...' : \`Retrying saved data (attempt \${attempt})...\`)
      try {
        const remote = await loadRemoteState(defaultState)
        if (cancelled) return
        setState(() => normalizeState(remote))
        setRemoteHydrationReady(true)
        setSyncStatus('Synced')
      } catch (error) {
        if (cancelled) return
        const message = error?.message || 'Unable to load saved data.'
        if (/invalid admin session/i.test(message)) {
          setSyncStatus('Session expired. Please log in again.')
          onLogout?.()
          return
        }
        const delayMs = attempt < 5 ? Math.min(8000, attempt * 1500) : 10000
        setSyncStatus(\`Load delayed: \${message} Retrying automatically...\`)
        retryTimer = setTimeout(hydrateFromPostgres, delayMs)
      }
    }

    hydrateFromPostgres()
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [])`

const GUARDED_SAVE_EFFECT = `  useEffect(() => {
    persistState(state)
    if (!remoteHydrationReady) return undefined
    const timer = setTimeout(async () => {
      try {
        await saveRemoteState(state)
        setSyncStatus('Synced')
      } catch (error) {
        const message = error?.message || 'Unknown save error'
        setSyncStatus('Save failed: ' + message)
      }
    }, 700)
    return () => clearTimeout(timer)
  }, [state, remoteHydrationReady])`

function replaceRequired(source, target, replacement, label) {
  if (!source.includes(target)) throw new Error(`Startup hydration transform could not locate ${label}.`)
  return source.replace(target, replacement)
}

export function injectStartupHydration(source) {
  if (source.includes('const [remoteHydrationReady, setRemoteHydrationReady]')) return source

  let next = replaceRequired(
    source,
    SYNC_STATE_MARKER,
    `${SYNC_STATE_MARKER}\n  const [remoteHydrationReady, setRemoteHydrationReady] = useState(false)`,
    'sync status state',
  )
  next = replaceRequired(next, LEGACY_HYDRATION_EFFECT, RESILIENT_HYDRATION_EFFECT, 'remote hydration effect')
  next = replaceRequired(next, LEGACY_SAVE_EFFECT, GUARDED_SAVE_EFFECT, 'autosave effect')

  if (!next.includes("setState(() => normalizeState(remote))")) throw new Error('Remote state replacement was not installed.')
  if (!next.includes('if (!remoteHydrationReady) return undefined')) throw new Error('Hydration save guard was not installed.')
  if (!next.includes('Retrying automatically')) throw new Error('Automatic hydration retry was not installed.')
  return next
}

export function startupHydrationPlugin() {
  return {
    name: 'staffboard-startup-hydration',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      return { code: injectStartupHydration(source), map: null }
    },
  }
}
