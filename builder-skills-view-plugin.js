const IMPORT_MARKER = "import {\n  buildBuilderProfile,"
const VIEW_MARKER = "const [view, setView] = useState('dashboard')"
const OPEN_MARKER = '  function openQualification(builderId, trainingId) {'
const SUBMIT_MARKER = '  async function submitQualification(event) {'
const TOOLBAR_MARKER = "        ['dashboard', 'Dashboard'], ['matrix', 'Training Matrix'], ['builders', 'Builder Profiles'],"
const RENDER_MARKER = "    {!loading && view === 'dashboard' ? <>"

export function injectBuilderSkillsView(source) {
  if (source.includes("import BuilderSkillsView from './BuilderSkillsView'")) return source
  const required = [IMPORT_MARKER, VIEW_MARKER, OPEN_MARKER, SUBMIT_MARKER, TOOLBAR_MARKER, RENDER_MARKER]
  const missing = required.filter((marker) => !source.includes(marker))
  if (missing.length) throw new Error(`Builder Skills transform markers missing: ${missing.join(' | ')}`)

  let output = source.replace(
    IMPORT_MARKER,
    "import BuilderSkillsView from './BuilderSkillsView'\nimport {\n  buildBuilderProfile,",
  )
  output = output.replace(VIEW_MARKER, "const [view, setView] = useState('skills')")
  output = output.replace(OPEN_MARKER, '  function openQualification(builderId, trainingId, overrides = {}) {')
  output = output.replace(
    "      reason: '',\n    })",
    "      reason: '',\n      ...overrides,\n    })",
  )
  output = output.replace(
    SUBMIT_MARKER,
    `  async function saveQuickQualification(input, successMessage = 'Qualification updated.') {
    setSaving(true)
    setError('')
    try {
      await saveQualification(input)
      await refresh()
      notify(successMessage)
    } catch (requestError) {
      setError(requestError.message)
      throw requestError
    } finally {
      setSaving(false)
    }
  }

${SUBMIT_MARKER}`,
  )
  output = output.replace(
    TOOLBAR_MARKER,
    "        ['skills', 'Builder Skills'], ['dashboard', 'Dashboard'], ['matrix', 'Training Matrix'], ['builders', 'Builder Profiles'],",
  )
  output = output.replace(
    RENDER_MARKER,
    `    {!loading && view === 'skills' ? <BuilderSkillsView
      snapshot={snapshot}
      qualificationsByKey={qualificationsByKey}
      selectedBuilderId={selectedBuilderId}
      setSelectedBuilderId={setSelectedBuilderId}
      openQualification={openQualification}
      saveQuickQualification={saveQuickQualification}
      saving={saving}
      currentUser={currentUser}
    /> : null}

${RENDER_MARKER}`,
  )
  output = output.replace(
    '</label></div><label>Notes<textarea',
    `</label></div><label>Certificate file URL<input value={qualificationDraft.certificateFileUrl || ''} onChange={(event) => setQualificationDraft((previous) => ({ ...previous, certificateFileUrl: event.target.value }))} placeholder="Future-ready certificate or document URL" /></label><label>Notes<textarea`,
  )
  return output
}

export function builderSkillsViewPlugin() {
  return {
    name: 'staffboard-builder-skills-view',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/src/TrainingTab.jsx')) return null
      return { code: injectBuilderSkillsView(source), map: null }
    },
  }
}
