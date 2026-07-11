export function builderManagementCommandPlugin() {
  return {
    name: 'staffboard-builder-management-commands',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/BuilderManagementWorkspace.jsx')) return null
      let next = code

      next = next.replace(
        "      if (command === 'archived') setView('archived')",
        "      if (command === 'archived') setView('archived')\n      if (command === 'search') {\n        setView('master')\n        setSearch(event?.detail?.query || '')\n        if (event?.detail?.builderId) setProfileId(event.detail.builderId)\n      }"
      )

      if (!next.includes("event.key === 'Escape' && (showAdd || showQuickAdd || profileId)")) {
        const marker = "  useEffect(() => {\n    if (!profileId) { setProfileDraft(null); return }"
        const escapeEffect = `  useEffect(() => {
    const onEscape = (event) => {
      if (event.key === 'Escape' && (showAdd || showQuickAdd || profileId)) {
        setShowAdd(false)
        setShowQuickAdd(false)
        setProfileId('')
      }
    }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [showAdd, showQuickAdd, profileId])

`
        next = next.replace(marker, escapeEffect + marker)
      }

      return next === code ? null : { code: next, map: null }
    },
  }
}
