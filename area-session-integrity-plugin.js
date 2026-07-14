const FUNCTION_MARKER = '    const updateBuilderAssignment = (builderId, patch) => {'
const TIMESTAMP_MARKER = '      const timestamp = nowString()\n      const currentStatus = currentAssignment.status || \'Present\''
const AREA_BLOCK_START = '      if (patch.area !== undefined && nextArea !== currentArea) {'
const STATUS_BLOCK_START = '\n\n      if (patch.status !== undefined && nextStatus !== currentStatus) {'

export function injectAreaSessionIntegrity(code) {
  if (!code.includes(FUNCTION_MARKER)) throw new Error('Area-session integrity transform could not locate updateBuilderAssignment.')

  let next = code
  if (!next.includes('const timestampIso = nowIso()')) {
    if (!next.includes(TIMESTAMP_MARKER)) throw new Error('Area-session integrity transform could not locate assignment timestamp setup.')
    next = next.replace(
      TIMESTAMP_MARKER,
      "      const timestamp = nowString()\n      const timestampIso = nowIso()\n      const currentStatus = currentAssignment.status || 'Present'",
    )
  }

  if (!next.includes('nextAssignment.areaHistory = syncAreaSession(currentAssignment, nextAssignment, timestampIso)')) {
    const start = next.indexOf(AREA_BLOCK_START, next.indexOf(FUNCTION_MARKER))
    const end = start >= 0 ? next.indexOf(STATUS_BLOCK_START, start) : -1
    if (start < 0 || end < 0) throw new Error('Area-session integrity transform could not locate the legacy area-history block.')

    const replacement = `      if ((patch.area !== undefined && nextArea !== currentArea) || (patch.status !== undefined && nextStatus !== currentStatus)) {
        nextAssignment.areaHistory = syncAreaSession(currentAssignment, nextAssignment, timestampIso)
      } else {
        nextAssignment.areaHistory = Array.isArray(currentAssignment.areaHistory) ? currentAssignment.areaHistory : []
      }

      if (patch.area !== undefined && nextArea !== currentArea) {
        movementLog.unshift({
          timestamp,
          builder: builder.name,
          from: \`${'${currentArea} / ${currentStatus}'}\`,
          to: \`${'${nextArea} / ${nextStatus}'}\`,
          note: \`Area changed from ${'${currentArea}'} to ${'${nextArea}'}\`,
        })
      }`
    next = next.slice(0, start) + replacement + next.slice(end)
  }

  const functionStart = next.indexOf(FUNCTION_MARKER)
  const functionEnd = next.indexOf('\n\n\n  const saveCurrentWeekSnapshot', functionStart)
  const assignmentCode = functionEnd > functionStart ? next.slice(functionStart, functionEnd) : next.slice(functionStart)
  if (!assignmentCode.includes('syncAreaSession(currentAssignment, nextAssignment, timestampIso)')) {
    throw new Error('Area-session integrity transform did not wire exact session tracking.')
  }
  if (assignmentCode.includes('{ from: currentArea, to: nextArea, at: timestamp }')) {
    throw new Error('Area-session integrity transform left the legacy movement-shaped areaHistory record in place.')
  }
  return next
}

export function areaSessionIntegrityPlugin() {
  return {
    name: 'staffboard-area-session-integrity',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      const next = injectAreaSessionIntegrity(code)
      return next === code ? null : { code: next, map: null }
    },
  }
}

export const __test = { injectAreaSessionIntegrity }
