export function laborShareCorePlugin() {
  return {
    name: 'staffboard-labor-share-core',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/App.jsx')) return null
      let next = code

      if (!next.includes("{ name: 'FA', areaType: 'labor_share' }")) {
        next = next.replace(
          "  { name: 'Network Rack Prep' },\n]",
          "  { name: 'Network Rack Prep' },\n  { name: 'FA', areaType: 'labor_share', note: 'Labor share outside SPEED production' },\n  { name: 'FA Metal Removal', areaType: 'labor_share', note: 'Labor share outside SPEED production' },\n]"
        )
      }

      if (!next.includes('const AREA_TYPE_OPTIONS =')) {
        const marker = 'function clone(value) {'
        const helper = `const LABOR_SHARE_MIGRATION_VERSION = 1
const AREA_TYPE_OPTIONS = [
  { value: 'production', label: 'SPEED Production' },
  { value: 'support', label: 'Support / Indirect' },
  { value: 'labor_share', label: 'Labor Share' },
  { value: 'unassigned', label: 'Unassigned' },
]

function inferredAreaType(name, boardId = 'speed_day') {
  const normalized = String(name || '').trim().toLowerCase()
  if (!normalized || normalized === 'unassigned') return 'unassigned'
  if (normalized === 'fa' || normalized === 'fa metal removal') return 'labor_share'
  const supportNames = new Set(['shipping', 'eos pull racks', 'projects', 'learning', '1:1'])
  if (supportNames.has(normalized)) return 'support'
  return 'production'
}

function normalizeAreaDefinition(area, boardId = 'speed_day') {
  const source = area && typeof area === 'object' ? area : { name: String(area || '') }
  const allowed = new Set(AREA_TYPE_OPTIONS.map((option) => option.value))
  const areaType = allowed.has(source.areaType) ? source.areaType : inferredAreaType(source.name, boardId)
  return {
    ...source,
    areaType,
    capacity: source.capacity ?? '',
    note: source.note || '',
  }
}

function normalizeAreaDefinitions(areaDefs, boardId = 'speed_day') {
  const source = Array.isArray(areaDefs) ? areaDefs : []
  const normalized = source.map((area) => normalizeAreaDefinition(area, boardId))
  if (String(boardId).startsWith('speed_')) {
    const names = new Set(normalized.map((area) => String(area.name || '').trim().toLowerCase()))
    if (!names.has('fa')) normalized.push(normalizeAreaDefinition({ name: 'FA', areaType: 'labor_share', note: 'Labor share outside SPEED production' }, boardId))
    if (!names.has('fa metal removal')) normalized.push(normalizeAreaDefinition({ name: 'FA Metal Removal', areaType: 'labor_share', note: 'Labor share outside SPEED production' }, boardId))
  }
  return normalized
}

function areaTypeLabel(areaType) {
  return AREA_TYPE_OPTIONS.find((option) => option.value === areaType)?.label || 'SPEED Production'
}

`
        next = next.replace(marker, helper + marker)
      }

      next = next.replaceAll(
        "    isLineLead: false,\n",
        "    isLineLead: false,\n    countsAsProductionLabor: false,\n"
      )

      next = next.replace(
        "  if (builder.isLineLead) flags.push('Line Lead')",
        "  if (builder.isLineLead) flags.push('Line Lead')\n  if (builder.countsAsProductionLabor) flags.push('Production Labor')"
      )

      next = next.replace(
        "  currentBoardId: 'speed_day',",
        "  currentBoardId: 'speed_day',\n  laborShareMigrationVersion: LABOR_SHARE_MIGRATION_VERSION,"
      )

      next = next.replace(
        "  state.areaDefs = Array.isArray(saved?.areaDefs) && saved?.areaDefs.length ? saved.areaDefs : activePreset.areaDefs",
        "  state.areaDefs = normalizeAreaDefinitions(Array.isArray(saved?.areaDefs) && saved?.areaDefs.length ? saved.areaDefs : activePreset.areaDefs, state.currentBoardId)\n  state.laborShareMigrationVersion = Math.max(Number(saved?.laborShareMigrationVersion || 0), LABOR_SHARE_MIGRATION_VERSION)"
      )

      next = next.replace(
        "       areaDefs: stored.areaDefs || preset.areaDefs,",
        "       areaDefs: normalizeAreaDefinitions(stored.areaDefs || preset.areaDefs, boardId),"
      )

      next = next.replace(
        "      areaDefs: [...(prev.areaDefs || AREA_DEFS), { name, capacity: '', note: '' }],",
        "      areaDefs: [...normalizeAreaDefinitions(prev.areaDefs || AREA_DEFS, prev.currentBoardId), normalizeAreaDefinition({ name, areaType: document.getElementById('newAreaType')?.value || 'production', capacity: '', note: '' }, prev.currentBoardId)],"
      )

      return next === code ? null : { code: next, map: null }
    },
  }
}
