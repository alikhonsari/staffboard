const WEEKDAY_MARKER = "const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']"

const helpers = `

const STAFFBOARD_CLOSURE_SCOPE_LABELS = { entire_day: 'Entire Day', day_shift: 'Day Shift', night_shift: 'Night Shift' }
const staffboardOperationId = (boardId) => String(boardId || 'speed_day').replace(/_(day|night)$/i, '')
function staffboardClosureForState(source, boardId, weekStartDate, day) {
  const record = source?.dayClosures?.[staffboardOperationId(boardId)]?.[weekStartDate]?.[day]
  if (!record) return null
  if (record.entireDay?.closed) return { ...record.entireDay, scope: 'entire_day' }
  const night = /_night$/i.test(String(boardId || ''))
  const closure = night ? record.nightShift : record.dayShift
  return closure?.closed ? { ...closure, scope: night ? 'night_shift' : 'day_shift' } : null
}
const staffboardClosureReason = (closure) => !closure ? '' : closure.reason === 'Other' ? (closure.customReason || 'Other') : (closure.reason || 'Closed')
`

const hooks = `
  const [closureDialogOpen, setClosureDialogOpen] = useState(false)
  const [closureDialogMode, setClosureDialogMode] = useState('close')
  const [closureScope, setClosureScope] = useState('entire_day')
  const [closureReason, setClosureReason] = useState('Holiday')
  const [closureCustomReason, setClosureCustomReason] = useState('')
  const [closureNote, setClosureNote] = useState('')
  const [closureConfirmed, setClosureConfirmed] = useState(false)
  const [closureBusy, setClosureBusy] = useState(false)
  const [closureMessage, setClosureMessage] = useState('')
  const [closureError, setClosureError] = useState('')
  const closureRevisionRef = useRef(null)
  const closureActionInFlightRef = useRef(false)`

const closureLogic = `  const openClosureDialog = (mode) => {
    if (!canManageClosures) { setClosureMessage('Only an Admin or Manager can change operational-day status.'); return }
    setClosureDialogMode(mode); setClosureError(''); setClosureMessage(''); setClosureConfirmed(false)
    if (mode === 'reopen' && activeClosure) {
      setClosureScope(activeClosure.scope); setClosureReason(activeClosure.reason || 'Holiday')
      setClosureCustomReason(activeClosure.customReason || ''); setClosureNote(activeClosure.note || '')
    } else {
      setClosureScope('entire_day'); setClosureReason('Holiday'); setClosureCustomReason(''); setClosureNote('')
    }
    setClosureDialogOpen(true)
  }

  const runClosureAction = async () => {
    if (closureActionInFlightRef.current || closureBusy || !closureConfirmed) return
    if (!canManageClosures) { setClosureError('Only an Admin or Manager can change operational-day status.'); return }
    if (closureDialogMode === 'close' && !String(closureReason || '').trim()) { setClosureError('Choose a closure reason.'); return }
    if (closureDialogMode === 'close' && closureReason === 'Other' && !closureCustomReason.trim()) { setClosureError('Enter a custom closure reason.'); return }
    closureActionInFlightRef.current = true
    setClosureBusy(true); setClosureError(''); setClosureMessage('')
    try {
      const payload = await requestDayClosure(closureDialogMode, {
        boardId: state.currentBoardId || 'speed_day', weekStartDate: state.weekStartDate,
        day: state.selectedDay, scope: closureDialogMode === 'reopen' ? activeClosure?.scope : closureScope,
        reason: closureReason, customReason: closureCustomReason, note: closureNote, effectiveDate: selectedOperationalDate,
      }, defaultState)
      const persistedState = payload?.normalizedState || payload?.state
      if (!persistedState) throw new Error('The server did not return the persisted closure state.')
      setState((prev) => normalizeState({ ...prev, ...persistedState }))
      closureRevisionRef.current = Number(payload.closureRevision || persistedState.closureRevision || 0)
      setClosureMessage(payload.message || (closureDialogMode === 'reopen' ? 'Operational day reopened.' : 'Operational day marked closed.'))
      setClosureDialogOpen(false); setClosureConfirmed(false); setSyncStatus('Synced')
    } catch (error) {
      if (error?.latestState) {
        setState((prev) => normalizeState({ ...prev, ...error.latestState }))
        closureRevisionRef.current = Number(error.latestState.closureRevision || closureRevisionRef.current || 0)
        setSyncStatus('Synced')
      }
      const requestSuffix = error?.requestId ? ' Request ID: ' + error.requestId : ''
      const message = error?.conflict
        ? 'The board changed in another session. The latest board has been loaded; review the closure details and confirm again.'
        : (error?.message || 'Day closure update failed.')
      setClosureError(message + requestSuffix)
    } finally {
      closureActionInFlightRef.current = false
      setClosureBusy(false)
    }
  }

  useEffect(() => {
    let stopped = false, polling = false
    const pollClosures = async () => {
      if (stopped || polling) return
      polling = true
      try {
        const status = await loadDayClosureStatus()
        const revision = Number(status.closureRevision || 0)
        if (closureRevisionRef.current == null) closureRevisionRef.current = revision
        else if (revision !== closureRevisionRef.current) {
          const remote = await loadRemoteState(defaultState)
          if (stopped) return
          setState((prev) => normalizeState({ ...prev, ...remote }))
          closureRevisionRef.current = revision
          if (status.notifications?.[0]?.message) setClosureMessage(status.notifications[0].message)
          setSyncStatus('Synced')
        }
      } catch { /* normal state synchronization remains the fallback */ }
      finally { polling = false }
    }
    pollClosures()
    const timer = setInterval(pollClosures, 2000)
    const onFocus = () => pollClosures()
    const onVisibility = () => { if (document.visibilityState === 'visible') pollClosures() }
    window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onVisibility)
    return () => { stopped = true; clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])

`

export function injectAppCore(code) {
  let next = code
  const closureImport = "import { loadDayClosureStatus, requestDayClosure } from './storageAdapter'"
  if (!next.includes(closureImport)) next = closureImport + '\n' + next
  if (!next.includes('function staffboardClosureForState')) next = next.replace(WEEKDAY_MARKER, WEEKDAY_MARKER + helpers)
  const hookMarker = "  const [syncStatus, setSyncStatus] = useState('Loading...')"
  if (!next.includes('const [closureDialogOpen')) next = next.replace(hookMarker, hookMarker + hooks)
  const dayMarker = "  const dayState = state.weeklyData[state.selectedDay] || defaultDay()"
  if (!next.includes('const activeClosure = staffboardClosureForState')) next = next.replace(dayMarker, dayMarker + `
  const activeClosure = staffboardClosureForState(state, state.currentBoardId, state.weekStartDate, state.selectedDay)
  const isDayClosed = !!activeClosure
  const canManageClosures = ['admin', 'manager', 'system'].includes(String(user?.role || 'admin').toLowerCase())
  const closureReasonLabel = staffboardClosureReason(activeClosure)
  const closureScopeLabel = STAFFBOARD_CLOSURE_SCOPE_LABELS[activeClosure?.scope] || ''
  const selectedOperationalDate = addDays(state.weekStartDate, Math.max(0, WEEKDAYS.indexOf(state.selectedDay)))
  const weekClosureRows = WEEKDAYS.map((day) => {
    const closure = staffboardClosureForState(state, state.currentBoardId, state.weekStartDate, day)
    return closure ? { day, ...closure, displayReason: staffboardClosureReason(closure) } : null
  }).filter(Boolean)`)
  const effectMarker = "  useEffect(() => {\n    const t = setInterval(() => setTick(Date.now()), 60000)"
  if (!next.includes('const runClosureAction = async')) next = next.replace(effectMarker, closureLogic + effectMarker)

  next = next.replace("  const updateDay = (updater) => {\n    saveState((prev) => {", "  const updateDay = (updater) => {\n    if (isDayClosed) { alert('This operational day is closed. Reopen it before editing.'); return }\n    saveState((prev) => {")
  next = next.replace("    const updateBuilderAssignment = (builderId, patch) => {\n    if (!builderId) return", "    const updateBuilderAssignment = (builderId, patch) => {\n    if (isDayClosed) { alert('This operational day is closed. Reopen it before editing.'); return }\n    if (!builderId) return")
  next = next.replace("  const counts = useMemo(() => {\n    let present = 0", "  const counts = useMemo(() => {\n    if (isDayClosed) return { present: 0, pto: 0, loa: 0, vto: 0, absent: 0, training: 0, indirect: 0, staffed: 0, total: 0, unassigned: 0, lineLeads: 0 }\n    let present = 0")
  next = next.replace("  const shift = useMemo(() => {\n    const now = new Date()", "  const shift = useMemo(() => {\n    if (isDayClosed) return { nowLabel: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), endLabel: 'Closed', remainingHours: 0, hoursWorked: 0, shiftHours: 0 }\n    const now = new Date()")
  next = next.replace("  const totalHeadCount = useMemo(() => {\n    const manual = numVal(dayState.opsMetrics.manualHeadCount)", "  const totalHeadCount = useMemo(() => {\n    if (isDayClosed) return 0\n    const manual = numVal(dayState.opsMetrics.manualHeadCount)")
  next = next.replace("  const metrics = useMemo(() => {\n    const ops = dayState.opsMetrics", "  const metrics = useMemo(() => {\n    if (isDayClosed) return { rackPrepOutput: 0, weightedTarget: 0, weightedCompleted: 0, remainingWork: 0, targetTPH: 0, requiredTPH: 0, recoveryGoal: 0, recoveryProcessed: 0, rackPrepGoal: 0, mediaGoal: 0, mediaProcessed: 0, totalWorkload: 0, completedWorkload: 0 }\n    const ops = dayState.opsMetrics")
  next = next.replace("  const areaCounts = useMemo(() => effectiveAreaDefs.map((a) => ({\n    ...a,\n    count: activeBuilders.filter((b) => {", "  const areaCounts = useMemo(() => effectiveAreaDefs.map((a) => ({\n    ...a,\n    count: isDayClosed ? 0 : activeBuilders.filter((b) => {")
  next = next.replace("  const staffingSuggestions = useMemo(() => {\n    const unassigned", "  const staffingSuggestions = useMemo(() => {\n    if (isDayClosed) return []\n    const unassigned")
  next = next.replaceAll('disabled={scheduleBusy ||', 'disabled={scheduleBusy || isDayClosed ||').replaceAll('disabled={scheduleBusy}', 'disabled={scheduleBusy || isDayClosed}')

  next = next.replace("    const mode = document.getElementById('copyDayMode')?.value || 'full'\n    if (!WEEKDAYS.includes(targetDay)) return alert('Pick a target day.')", "    const mode = document.getElementById('copyDayMode')?.value || 'full'\n    if (staffboardClosureForState(state, state.currentBoardId, state.weekStartDate, targetDay)) return alert('The target day is closed. Reopen it before copying data.')\n    if (!WEEKDAYS.includes(targetDay)) return alert('Pick a target day.')")
  next = next.replace("    const template = dayTemplates.find((t) => t.id === templateId)\n    if (!template) return alert('Pick a template.')", "    const template = dayTemplates.find((t) => t.id === templateId)\n    if (staffboardClosureForState(state, state.currentBoardId, state.weekStartDate, targetDay)) return alert('The target day is closed. Reopen it before applying a template.')\n    if (!template) return alert('Pick a template.')")
  next = next.replace('<div className={state.darkMode ? "app dark" : "app"} style={{ gridTemplateColumns:', '<div className={`${state.darkMode ? "app dark" : "app"}${isDayClosed ? " day-closed" : ""}`} style={{ gridTemplateColumns:')

  next = next.replace("  const snapshot = {\n    weekStartDate: state.weekStartDate,", "  const snapshot = {\n    weekStartDate: state.weekStartDate,\n    closedDays: [],")
  next = next.replace("  WEEKDAYS.forEach((day) => {\n    const dayState = state.weeklyData?.[day] || defaultDay()", "  WEEKDAYS.forEach((day) => {\n    const closure = staffboardClosureForState(state, state.currentBoardId, state.weekStartDate, day)\n    if (closure) {\n      snapshot.closedDays.push({ day, scope: closure.scope, reason: staffboardClosureReason(closure) })\n      snapshot.byDay.push({ day, closed: true, closureReason: staffboardClosureReason(closure), recoveryProcessed: 0, rackPrepDone: 0, totalMediaCount: 0, mediaProcessed: 0, staffedHours: 0 })\n      return\n    }\n    const dayState = state.weeklyData?.[day] || defaultDay()")
  next = next.replace("  if (Number(totals.staffedHours || 0) > 0) return true\n  return false", "  if (Number(totals.staffedHours || 0) > 0) return true\n  if (Array.isArray(snapshot.closedDays) && snapshot.closedDays.length) return true\n  return false")
  next = next.replace("  const currentWeekDayWork = (currentWeekAnalysis.byDay || []).map((d) => ({ label: d.day.slice(0,3), value: d.recoveryProcessed + d.rackPrepDone + (d.totalMediaCount / RACK_WEIGHT) }))", "  const currentWeekDayWork = (currentWeekAnalysis.byDay || []).filter((d) => !d.closed).map((d) => ({ label: d.day.slice(0,3), value: d.recoveryProcessed + d.rackPrepDone + (d.totalMediaCount / RACK_WEIGHT) }))")
  next = next.replace("      WEEKDAYS.forEach((day) => {\n        const assignment = (state.weeklyData[day] || defaultDay()).assignments[builder.id]", "      WEEKDAYS.forEach((day) => {\n        if (staffboardClosureForState(state, state.currentBoardId, state.weekStartDate, day)) return\n        const assignment = (state.weeklyData[day] || defaultDay()).assignments[builder.id]")

  const slack = "  const slackText = (type = 'daily') => {\n"
  if (next.includes(slack) && !next.includes("SITE CLOSED — ' + closureReasonLabel")) next = next.replace(slack, `${slack}    if (isDayClosed) return [
      boardLabel + ' — ' + state.selectedDay + ' — Week ' + String(weekInfo.week).padStart(2, '0'),
      'SITE CLOSED — ' + closureReasonLabel, 'Scope: ' + closureScopeLabel + ' | Date: ' + selectedOperationalDate,
      activeClosure?.note ? 'Note: ' + activeClosure.note : '', 'Staffing, scheduling, TPH, goals, risk flags, and recommendations are disabled.',
      'Closed by: ' + (activeClosure?.closedBy || 'Admin') + ' | Applied: ' + (activeClosure?.closedAt ? new Date(activeClosure.closedAt).toLocaleString() : '—'),
    ].filter(Boolean).join(String.fromCharCode(10))
`)
  return next
}
