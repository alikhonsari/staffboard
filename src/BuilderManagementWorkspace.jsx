import React, { useEffect, useMemo, useRef, useState } from 'react'

export const DEFAULT_BUILDER_SKILLS = [
  { id: 'tdr', name: 'TDR', shortLabel: 'TDR', category: 'Equipment', legacyField: 'trainedTdr', expirationEnabled: true, isActive: true },
  { id: 'forklift', name: 'Forklift', shortLabel: 'Forklift', category: 'Equipment', legacyField: 'trainedForklift', expirationEnabled: true, isActive: true },
  { id: 'center-rider', name: 'Center Rider', shortLabel: 'Center Rider', category: 'Equipment', legacyField: 'trainedCenterRider', expirationEnabled: true, isActive: true },
  { id: 'clamp-truck', name: 'Clamp Truck', shortLabel: 'Clamp', category: 'Equipment', legacyField: 'trainedClampTruck', expirationEnabled: true, isActive: true },
  { id: 'rack-mover', name: 'Rack Mover', shortLabel: 'Rack Mover', category: 'Equipment', legacyField: 'trainedRackMover', expirationEnabled: true, isActive: true },
  { id: 'reach-truck', name: 'Reach Truck', shortLabel: 'Reach Truck', category: 'Equipment', legacyField: 'trainedReachTruck', expirationEnabled: true, isActive: true },
  { id: 'trainer', name: 'Trainer', shortLabel: 'Trainer', category: 'Role', legacyField: 'isTrainer', expirationEnabled: false, isActive: true },
  { id: 'safety', name: 'Safety Member', shortLabel: 'Safety', category: 'Role', legacyField: 'isSafetyMember', expirationEnabled: false, isActive: true },
  { id: 'line-lead', name: 'Line Lead', shortLabel: 'Line Lead', category: 'Role', legacyField: 'isLineLead', expirationEnabled: false, isActive: true },
]

const VIEW_OPTIONS = [
  ['today', 'Today’s Roster', 'Today'],
  ['master', 'Master Builder List', 'Master'],
  ['lists', 'Saved Lists', 'Lists'],
  ['groups', 'Builder Groups', 'Groups'],
  ['skills', 'Skills & Certifications', 'Skills'],
  ['archived', 'Archived Builders', 'Archived'],
  ['import', 'Import / Export', 'Import'],
  ['history', 'Builder Change History', 'History'],
]

const STATUS_OPTIONS = ['Present', 'Training', 'Indirect', 'PTO', 'LOA', 'VTO', 'Absent']
const SMART_LIST_PRESETS = [
  ['tdr', 'All TDR-trained builders'],
  ['night', 'All Night Shift builders'],
  ['line-leads', 'All active Line Leads'],
  ['green', 'All Green Badges'],
  ['not-today', 'Builders not assigned today'],
  ['under-32', 'Builders under 32 weekly hours'],
  ['rack-prep', 'Builders who worked Rack Prep this week'],
  ['labor-share', 'Builders labor-shared today'],
]

const clean = (value) => String(value ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
const lower = (value) => clean(value).toLocaleLowerCase()
const clone = (value) => JSON.parse(JSON.stringify(value))
const userSlug = (value) => lower(value || 'local-user').replace(/[^a-z0-9_-]+/g, '-') || 'local-user'
const makeLocalId = (prefix = 'item') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const formatDateTime = (value) => value ? new Date(value).toLocaleString() : '—'

function parseTime(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ''))) return null
  const [hour, minute] = value.split(':').map(Number)
  return hour + minute / 60
}

function fallbackAssignmentHours(assignment) {
  const history = Array.isArray(assignment?.areaHistory) ? assignment.areaHistory : []
  if (history.length) {
    return history.reduce((sum, entry) => {
      const start = entry.startIso ? new Date(entry.startIso) : null
      const end = entry.endIso ? new Date(entry.endIso) : new Date()
      if (!start || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return sum
      return sum + Math.max(0, Math.min(12, (end - start) / 3600000))
    }, 0)
  }
  const start = parseTime(assignment?.clockInTime) ?? 8
  const end = parseTime(assignment?.leaveTime) ?? 16.5
  return Math.max(0, end - start)
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function downloadCsv(filename, rows) {
  const content = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function normalizeProfile(profile = {}) {
  return {
    id: profile.id || makeLocalId('builder'),
    name: clean(profile.name),
    employeeId: clean(profile.employeeId),
    badgeType: profile.badgeType || 'day',
    defaultShift: profile.defaultShift || '',
    defaultBoardId: profile.defaultBoardId || '',
    defaultArea: profile.defaultArea || '',
    defaultStatus: profile.defaultStatus || 'Present',
    defaultClockIn: profile.defaultClockIn || '',
    defaultClockOut: profile.defaultClockOut || '',
    startDate: profile.startDate || '',
    notes: profile.notes || '',
    trainingNotes: profile.trainingNotes || '',
    restrictions: profile.restrictions || '',
    trainedTdr: !!profile.trainedTdr,
    trainedForklift: !!profile.trainedForklift,
    trainedCenterRider: !!profile.trainedCenterRider,
    trainedClampTruck: !!profile.trainedClampTruck,
    trainedRackMover: !!profile.trainedRackMover,
    trainedReachTruck: !!profile.trainedReachTruck,
    isTrainer: !!profile.isTrainer,
    isSafetyMember: !!profile.isSafetyMember,
    isLineLead: !!profile.isLineLead,
    countsAsProductionLabor: !!profile.countsAsProductionLabor,
    skills: Array.isArray(profile.skills) ? profile.skills : [],
    skillRecords: Array.isArray(profile.skillRecords) ? profile.skillRecords : [],
    isArchived: !!profile.isArchived,
    archivedAt: profile.archivedAt || '',
    archivedBy: profile.archivedBy || '',
    archiveReason: profile.archiveReason || '',
    createdAt: profile.createdAt || '',
    createdBy: profile.createdBy || '',
    updatedAt: profile.updatedAt || '',
    updatedBy: profile.updatedBy || '',
    ...profile,
  }
}

function profileHasSkill(profile, skill) {
  if (!profile || !skill) return false
  if (skill.legacyField) return !!profile[skill.legacyField]
  return (profile.skills || []).includes(skill.id)
}

function skillRecord(profile, skillId) {
  return (profile?.skillRecords || []).find((record) => record.skillId === skillId) || {}
}

function expirationState(record) {
  if (!record?.expirationDate) return 'none'
  const expiration = new Date(`${record.expirationDate}T23:59:59`)
  if (Number.isNaN(expiration.getTime())) return 'none'
  const days = Math.ceil((expiration - new Date()) / 86400000)
  if (days < 0) return 'expired'
  if (days <= 30) return 'expiring'
  return 'valid'
}

function similarityWarning(name, profiles) {
  const target = lower(name)
  const targetParts = target.split(' ').filter(Boolean)
  return profiles.find((profile) => {
    const candidate = lower(profile.name)
    if (!candidate || candidate === target) return false
    const parts = candidate.split(' ').filter(Boolean)
    const sameLast = targetParts.length > 1 && parts.length > 1 && targetParts.at(-1) === parts.at(-1)
    const sameFirst = targetParts[0] && targetParts[0] === parts[0]
    return candidate.includes(target) || target.includes(candidate) || (sameFirst && sameLast)
  })
}

function auditEntry(state, admin, entry, nowLabel) {
  return {
    timestamp: nowLabel,
    admin,
    board: state.currentBoardId || state.boardTitle || '',
    shift: state.boardShift || '',
    week: state.weekStartDate || '',
    day: state.selectedDay || '',
    builder: entry.builder || '',
    action: entry.action || 'Builder Update',
    oldValue: entry.oldValue || '',
    newValue: entry.newValue || '',
    batchId: entry.batchId || '',
  }
}

function defaultAssignment(profile, blankAssignment) {
  return {
    ...(typeof blankAssignment === 'function' ? blankAssignment() : {}),
    status: profile.defaultStatus || 'Present',
    area: profile.defaultArea || '',
    clockInTime: profile.defaultClockIn || '',
    leaveTime: profile.defaultClockOut || '',
  }
}

function findAssignmentsForBuilder(state, builderId) {
  const found = []
  const visitWeek = (boardId, week, weeklyData) => {
    Object.entries(weeklyData || {}).forEach(([day, dayData]) => {
      const assignment = dayData?.assignments?.[builderId]
      if (assignment) found.push({ boardId, week, day, assignment })
    })
  }
  visitWeek(state.currentBoardId, state.weekStartDate, state.weeklyData)
  Object.entries(state.weeklyBoards || {}).forEach(([week, weeklyData]) => visitWeek(state.currentBoardId, week, weeklyData))
  Object.entries(state.boardStore || {}).forEach(([boardId, scoped]) => {
    visitWeek(boardId, scoped.weekStartDate || '', scoped.weeklyData)
    Object.entries(scoped.weeklyBoards || {}).forEach(([week, weeklyData]) => visitWeek(boardId, week, weeklyData))
  })
  return found
}

export default function BuilderManagementWorkspace(props) {
  const {
    state,
    saveState,
    user,
    dayState,
    activeBuilders,
    effectiveAreaDefs,
    updateBuilderAssignment,
    getAssignment,
    computeHoursForAssignment,
    blankAssignment,
    builderFlags,
    badgeTypeClass,
    boardPresets,
    weekdays,
    nowString,
    makeId,
  } = props

  const admin = user?.username || state.adminName || 'Unknown admin'
  const prefRoot = `staffboard.builders.v3.${userSlug(admin)}`
  const [view, setView] = useState(() => localStorage.getItem(`${prefRoot}.view`) || 'today')
  const [search, setSearch] = useState('')
  const [badgeFilter, setBadgeFilter] = useState('all')
  const [shiftFilter, setShiftFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [availabilityFilter, setAvailabilityFilter] = useState('all')
  const [sortKey, setSortKey] = useState('name')
  const [sortDirection, setSortDirection] = useState('asc')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState([])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const [profileId, setProfileId] = useState('')
  const [profileDraft, setProfileDraft] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [quickAddText, setQuickAddText] = useState('')
  const [quickAddSelection, setQuickAddSelection] = useState([])
  const [selectedListId, setSelectedListId] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [toast, setToast] = useState(null)
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`${prefRoot}.favorites`) || '[]') } catch { return [] }
  })
  const [recentIds, setRecentIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`${prefRoot}.recent`) || '[]') } catch { return [] }
  })
  const [addForm, setAddForm] = useState({
    name: '', employeeId: '', badgeType: 'day', defaultShift: '', defaultBoardId: '', defaultArea: '',
    isLineLead: false, countsAsProductionLabor: false, isTrainer: false, isSafetyMember: false,
    notes: '', startDate: '', addToToday: false, listId: '', groupId: '',
  })
  const [listDraft, setListDraft] = useState({ name: '', description: '', type: 'static', preset: 'tdr' })
  const [groupDraft, setGroupDraft] = useState({ name: '', description: '', defaultArea: '', defaultStatus: 'Present' })
  const [customSkillDraft, setCustomSkillDraft] = useState({ name: '', shortLabel: '', category: 'Other', expirationEnabled: false })
  const [bulkStatus, setBulkStatus] = useState('Present')
  const [bulkArea, setBulkArea] = useState('')
  const [bulkSkill, setBulkSkill] = useState('tdr')
  const [bulkListId, setBulkListId] = useState('')
  const [bulkGroupId, setBulkGroupId] = useState('')
  const [importRows, setImportRows] = useState([])
  const [importMode, setImportMode] = useState('add')
  const undoRef = useRef(null)
  const toastTimerRef = useRef(null)

  const allProfiles = useMemo(() => (state.builderPool || []).map(normalizeProfile), [state.builderPool])
  const activeProfiles = useMemo(() => allProfiles.filter((profile) => !profile.isArchived), [allProfiles])
  const archivedProfiles = useMemo(() => allProfiles.filter((profile) => profile.isArchived), [allProfiles])
  const lists = useMemo(() => Array.isArray(state.builderLists) ? state.builderLists : [], [state.builderLists])
  const groups = useMemo(() => Array.isArray(state.builderGroups) ? state.builderGroups : [], [state.builderGroups])
  const skills = useMemo(() => {
    const source = Array.isArray(state.skillDefinitions) && state.skillDefinitions.length ? state.skillDefinitions : DEFAULT_BUILDER_SKILLS
    const byId = new Map(DEFAULT_BUILDER_SKILLS.map((skill) => [skill.id, skill]))
    source.forEach((skill) => byId.set(skill.id, { ...byId.get(skill.id), ...skill }))
    return Array.from(byId.values()).filter((skill) => skill.isActive !== false)
  }, [state.skillDefinitions])

  const weeklyHoursMap = useMemo(() => {
    const result = {}
    allProfiles.forEach((profile) => { result[profile.id] = 0 })
    ;(weekdays || []).forEach((day) => {
      const source = state.weeklyData?.[day]?.assignments || {}
      Object.entries(source).forEach(([builderId, assignment]) => {
        let hours = 0
        try {
          if (typeof computeHoursForAssignment === 'function') {
            const totals = computeHoursForAssignment(assignment, day, state.weekStartDate)
            hours = Object.values(totals || {}).reduce((sum, value) => sum + Number(value || 0), 0)
          } else hours = fallbackAssignmentHours(assignment)
        } catch { hours = fallbackAssignmentHours(assignment) }
        result[builderId] = (result[builderId] || 0) + hours
      })
    })
    return result
  }, [allProfiles, weekdays, state.weeklyData, state.weekStartDate, computeHoursForAssignment])

  const lastActiveMap = useMemo(() => {
    const map = {}
    const capture = (week, weeklyData) => {
      Object.entries(weeklyData || {}).forEach(([day, dayData]) => {
        Object.keys(dayData?.assignments || {}).forEach((builderId) => {
          const value = `${week || ''} ${day || ''}`
          if (!map[builderId] || value > map[builderId]) map[builderId] = value
        })
      })
    }
    capture(state.weekStartDate, state.weeklyData)
    Object.entries(state.weeklyBoards || {}).forEach(([week, weeklyData]) => capture(week, weeklyData))
    Object.values(state.boardStore || {}).forEach((scope) => {
      capture(scope.weekStartDate, scope.weeklyData)
      Object.entries(scope.weeklyBoards || {}).forEach(([week, weeklyData]) => capture(week, weeklyData))
    })
    return map
  }, [state.weekStartDate, state.weeklyData, state.weeklyBoards, state.boardStore])

  const teamNameByBuilder = useMemo(() => {
    const teams = Array.isArray(dayState?.speedLiteTeams) ? dayState.speedLiteTeams : []
    const map = {}
    Object.entries(dayState?.assignments || {}).forEach(([builderId, assignment]) => {
      const team = teams.find((item) => item.id === assignment.speedLiteTeamId)
      map[builderId] = team?.name || ''
    })
    return map
  }, [dayState])

  const expiredSkillCount = useMemo(() => activeProfiles.reduce((total, profile) => total + (profile.skillRecords || []).filter((record) => expirationState(record) === 'expired').length, 0), [activeProfiles])
  const expiringSkillCount = useMemo(() => activeProfiles.reduce((total, profile) => total + (profile.skillRecords || []).filter((record) => expirationState(record) === 'expiring').length, 0), [activeProfiles])

  const resolveSmartListMembers = (list) => {
    if (!list) return []
    if (list.type !== 'smart') return activeProfiles.filter((profile) => (list.builderIds || []).includes(profile.id))
    const preset = list.filters?.preset || list.preset
    if (preset === 'tdr') return activeProfiles.filter((profile) => profile.trainedTdr)
    if (preset === 'night') return activeProfiles.filter((profile) => profile.defaultShift === 'night' || profile.badgeType === 'night')
    if (preset === 'line-leads') return activeProfiles.filter((profile) => profile.isLineLead)
    if (preset === 'green') return activeProfiles.filter((profile) => profile.badgeType === 'green')
    if (preset === 'not-today') return activeProfiles.filter((profile) => !dayState?.assignments?.[profile.id])
    if (preset === 'under-32') return activeProfiles.filter((profile) => Number(weeklyHoursMap[profile.id] || 0) < 32)
    if (preset === 'rack-prep') return activeProfiles.filter((profile) => (weekdays || []).some((day) => {
      const assignment = state.weeklyData?.[day]?.assignments?.[profile.id]
      return assignment?.area === 'Rack Prep' || (assignment?.areaHistory || []).some((entry) => entry.area === 'Rack Prep' || entry.to === 'Rack Prep')
    }))
    if (preset === 'labor-share') return activeProfiles.filter((profile) => {
      const assignment = dayState?.assignments?.[profile.id]
      const area = (effectiveAreaDefs || []).find((item) => item.name === assignment?.area)
      return area?.areaType === 'labor_share'
    })
    return []
  }

  const listMembershipNames = (builderId) => lists.filter((list) => !list.isArchived && resolveSmartListMembers(list).some((profile) => profile.id === builderId)).map((list) => list.name)
  const groupMembershipNames = (builderId) => groups.filter((group) => !group.isArchived && (group.builderIds || []).includes(builderId)).map((group) => group.name)

  const filteredProfiles = useMemo(() => {
    const source = view === 'archived' ? archivedProfiles : activeProfiles
    const query = lower(search)
    const result = source.filter((profile) => {
      const assignment = dayState?.assignments?.[profile.id]
      const flags = typeof builderFlags === 'function' ? builderFlags(profile) : []
      const searchable = [profile.name, profile.employeeId, profile.badgeType, profile.defaultShift, profile.defaultArea, profile.notes, ...flags, ...groupMembershipNames(profile.id), ...listMembershipNames(profile.id)].join(' ').toLowerCase()
      if (query && !searchable.includes(query)) return false
      if (badgeFilter !== 'all' && profile.badgeType !== badgeFilter) return false
      if (shiftFilter !== 'all' && profile.defaultShift !== shiftFilter && profile.badgeType !== shiftFilter) return false
      if (roleFilter === 'line-lead' && !profile.isLineLead) return false
      if (roleFilter === 'trainer' && !profile.isTrainer) return false
      if (roleFilter === 'safety' && !profile.isSafetyMember) return false
      if (roleFilter === 'skilled' && !skills.some((skill) => profileHasSkill(profile, skill))) return false
      if (availabilityFilter === 'today' && !assignment) return false
      if (availabilityFilter === 'not-today' && assignment) return false
      if (availabilityFilter === 'unassigned' && (!assignment || (assignment.area || 'Unassigned') !== 'Unassigned')) return false
      if (availabilityFilter === 'away' && (!assignment || !['PTO', 'LOA', 'VTO', 'Absent'].includes(assignment.status))) return false
      return true
    })
    result.sort((a, b) => {
      let left = a.name
      let right = b.name
      if (sortKey === 'badge') { left = a.badgeType; right = b.badgeType }
      if (sortKey === 'shift') { left = a.defaultShift; right = b.defaultShift }
      if (sortKey === 'hours') { left = weeklyHoursMap[a.id] || 0; right = weeklyHoursMap[b.id] || 0 }
      if (sortKey === 'last-active') { left = lastActiveMap[a.id] || ''; right = lastActiveMap[b.id] || '' }
      const compared = typeof left === 'number' ? left - right : String(left || '').localeCompare(String(right || ''))
      return sortDirection === 'asc' ? compared : -compared
    })
    return result
  }, [view, archivedProfiles, activeProfiles, search, badgeFilter, shiftFilter, roleFilter, availabilityFilter, sortKey, sortDirection, dayState, builderFlags, skills, weeklyHoursMap, lastActiveMap, lists, groups])

  const pageSize = 50
  const maxPage = Math.max(1, Math.ceil(filteredProfiles.length / pageSize))
  const pagedProfiles = filteredProfiles.slice((page - 1) * pageSize, page * pageSize)

  const quickAddPreview = useMemo(() => {
    const existingNames = new Map(allProfiles.map((profile) => [lower(profile.name), profile]))
    const seen = new Set()
    return quickAddText.split(/\r?\n/).map((line, index) => {
      const raw = line.trim()
      if (!raw) return null
      const parts = raw.includes('\t') ? raw.split('\t') : raw.split(',')
      const name = clean(parts[0])
      const badgeType = lower(parts[1]) || 'day'
      const defaultShift = lower(parts[2]) || ''
      let status = 'valid'
      let message = 'Ready to add'
      if (!name) { status = 'invalid'; message = 'Missing name' }
      else if (existingNames.has(lower(name))) { status = 'duplicate'; message = existingNames.get(lower(name)).isArchived ? 'Archived match exists' : 'Builder already exists' }
      else if (seen.has(lower(name))) { status = 'duplicate'; message = 'Duplicate in pasted rows' }
      seen.add(lower(name))
      return { key: `${index}-${lower(name)}`, line: index + 1, name, badgeType: ['day', 'night', 'green'].includes(badgeType) ? badgeType : 'day', defaultShift: ['day', 'night'].includes(defaultShift) ? defaultShift : '', status, message }
    }).filter(Boolean)
  }, [quickAddText, allProfiles])

  useEffect(() => {
    localStorage.setItem(`${prefRoot}.view`, view)
    window.dispatchEvent(new CustomEvent('staffboard:builder-view-changed', { detail: { view } }))
  }, [prefRoot, view])

  useEffect(() => { localStorage.setItem(`${prefRoot}.favorites`, JSON.stringify(favorites)) }, [prefRoot, favorites])
  useEffect(() => { localStorage.setItem(`${prefRoot}.recent`, JSON.stringify(recentIds)) }, [prefRoot, recentIds])
  useEffect(() => { setPage(1) }, [search, badgeFilter, shiftFilter, roleFilter, availabilityFilter, view])
  useEffect(() => { if (page > maxPage) setPage(maxPage) }, [page, maxPage])
  useEffect(() => {
    setQuickAddSelection(quickAddPreview.filter((row) => row.status === 'valid').map((row) => row.key))
  }, [quickAddText])

  useEffect(() => {
    const onView = (event) => {
      const next = event?.detail?.view
      if (VIEW_OPTIONS.some(([id]) => id === next)) setView(next)
    }
    const onCommand = (event) => {
      const command = event?.detail?.command
      if (command === 'add') { setView('master'); setShowAdd(true) }
      if (command === 'quick-add') { setView('master'); setShowQuickAdd(true) }
      if (command === 'archived') setView('archived')
    }
    window.addEventListener('staffboard:builder-view', onView)
    window.addEventListener('staffboard:builder-command', onCommand)
    return () => {
      window.removeEventListener('staffboard:builder-view', onView)
      window.removeEventListener('staffboard:builder-command', onCommand)
    }
  }, [])

  useEffect(() => {
    if (!profileId) { setProfileDraft(null); return }
    const profile = allProfiles.find((item) => item.id === profileId)
    setProfileDraft(profile ? clone(profile) : null)
    if (profile) setRecentIds((current) => [profile.id, ...current.filter((id) => id !== profile.id)].slice(0, 8))
  }, [profileId, allProfiles])

  const nowLabel = () => typeof nowString === 'function' ? nowString() : new Date().toLocaleString()
  const newId = (prefix) => typeof makeId === 'function' && prefix === 'builder' ? makeId() : makeLocalId(prefix)

  const showUndo = (message, undoAction) => {
    clearTimeout(toastTimerRef.current)
    undoRef.current = undoAction
    setToast({ message, undo: !!undoAction })
    toastTimerRef.current = setTimeout(() => { setToast(null); undoRef.current = null }, 15000)
  }

  const runUndo = () => {
    const action = undoRef.current
    undoRef.current = null
    setToast(null)
    if (typeof action === 'function') action()
  }

  const appendAudits = (next, entries, batchId = '') => {
    const rows = entries.map((entry) => auditEntry(next, admin, { ...entry, batchId: entry.batchId || batchId }, nowLabel()))
    return { ...next, auditLog: [...rows, ...((next.auditLog || []).slice(0, Math.max(0, 1000 - rows.length)))] }
  }

  const addBuildersToSelectedDay = (builderIds, options = {}) => {
    const uniqueIds = Array.from(new Set(builderIds))
    const archived = uniqueIds.filter((id) => allProfiles.find((profile) => profile.id === id)?.isArchived)
    if (archived.length && !confirm(`${archived.length} selected builder(s) are archived. Restore them before adding?`)) return
    const beforeAssignments = clone(dayState?.assignments || {})
    saveState((prev) => {
      const currentDay = prev.weeklyData?.[prev.selectedDay] || { assignments: {} }
      const assignments = { ...(currentDay.assignments || {}) }
      const removedAssignments = { ...(currentDay.removedAssignments || {}) }
      const profiles = (prev.builderPool || []).map(normalizeProfile)
      const added = []
      uniqueIds.forEach((builderId) => {
        if (assignments[builderId]) return
        const profile = profiles.find((item) => item.id === builderId)
        if (!profile || profile.isArchived) return
        assignments[builderId] = removedAssignments[builderId] || { ...defaultAssignment(profile, blankAssignment), ...(options.assignment || {}) }
        delete removedAssignments[builderId]
        added.push(profile)
      })
      const next = { ...prev, weeklyData: { ...prev.weeklyData, [prev.selectedDay]: { ...currentDay, assignments, removedAssignments } } }
      return appendAudits(next, added.map((profile) => ({ builder: profile.name, action: 'Added to selected day', oldValue: 'Not on roster', newValue: `${prev.selectedDay} · ${assignments[profile.id].status || 'Present'} · ${assignments[profile.id].area || 'Unassigned'}` })), options.batchId)
    })
    showUndo(`${uniqueIds.length} builder(s) added to ${state.selectedDay}.`, () => {
      saveState((prev) => {
        const currentDay = prev.weeklyData?.[prev.selectedDay] || { assignments: {} }
        return { ...prev, weeklyData: { ...prev.weeklyData, [prev.selectedDay]: { ...currentDay, assignments: beforeAssignments } } }
      })
    })
  }

  const removeBuildersFromSelectedDay = (builderIds) => {
    const current = builderIds.filter((id) => dayState?.assignments?.[id])
    if (!current.length) return
    if (!confirm(`Remove ${current.length} builder(s) from ${state.selectedDay}? Their profiles and a recovery copy of the day assignment will be preserved.`)) return
    const snapshots = Object.fromEntries(current.map((id) => [id, clone(dayState.assignments[id])]))
    saveState((prev) => {
      const currentDay = prev.weeklyData?.[prev.selectedDay] || { assignments: {} }
      const assignments = { ...(currentDay.assignments || {}) }
      const removedAssignments = { ...(currentDay.removedAssignments || {}) }
      current.forEach((id) => { if (assignments[id]) removedAssignments[id] = assignments[id]; delete assignments[id] })
      const entries = current.map((id) => ({ builder: prev.builderPool.find((profile) => profile.id === id)?.name || id, action: 'Removed from selected day', oldValue: prev.selectedDay, newValue: 'Master profile preserved' }))
      return appendAudits({ ...prev, weeklyData: { ...prev.weeklyData, [prev.selectedDay]: { ...currentDay, assignments, removedAssignments } } }, entries, makeLocalId('batch'))
    })
    showUndo(`${current.length} builder(s) removed from ${state.selectedDay}.`, () => {
      saveState((prev) => {
        const currentDay = prev.weeklyData?.[prev.selectedDay] || { assignments: {} }
        const assignments = { ...(currentDay.assignments || {}), ...snapshots }
        const removedAssignments = { ...(currentDay.removedAssignments || {}) }
        current.forEach((id) => delete removedAssignments[id])
        return { ...prev, weeklyData: { ...prev.weeklyData, [prev.selectedDay]: { ...currentDay, assignments, removedAssignments } } }
      })
    })
  }

  const validateBuilder = (draft, excludingId = '') => {
    const name = clean(draft.name)
    const employeeId = clean(draft.employeeId)
    if (!name) return { ok: false, message: 'Full name is required.' }
    const duplicateName = allProfiles.find((profile) => profile.id !== excludingId && lower(profile.name) === lower(name))
    if (duplicateName) return { ok: false, message: `A builder named ${duplicateName.name} already exists${duplicateName.isArchived ? ' in Archived Builders' : ''}.` }
    const duplicateId = employeeId && allProfiles.find((profile) => profile.id !== excludingId && lower(profile.employeeId) === lower(employeeId))
    if (duplicateId) return { ok: false, message: `Employee or badge ID ${employeeId} is already assigned to ${duplicateId.name}.` }
    const similar = similarityWarning(name, allProfiles.filter((profile) => profile.id !== excludingId))
    return { ok: true, similar }
  }

  const createBuilder = (keepOpen = false) => {
    const validation = validateBuilder(addForm)
    if (!validation.ok) return alert(validation.message)
    if (validation.similar && !confirm(`A similar builder, ${validation.similar.name}, already exists. Create ${clean(addForm.name)} anyway?`)) return
    const builderId = newId('builder')
    const createdAt = new Date().toISOString()
    const profile = normalizeProfile({
      id: builderId,
      ...addForm,
      name: clean(addForm.name),
      employeeId: clean(addForm.employeeId),
      createdAt,
      createdBy: admin,
      updatedAt: createdAt,
      updatedBy: admin,
    })
    saveState((prev) => {
      let next = { ...prev, builderPool: [...(prev.builderPool || []), profile] }
      if (addForm.listId) next.builderLists = (next.builderLists || []).map((list) => list.id === addForm.listId && list.type !== 'smart' ? { ...list, builderIds: Array.from(new Set([...(list.builderIds || []), builderId])), updatedAt: createdAt } : list)
      if (addForm.groupId) next.builderGroups = (next.builderGroups || []).map((group) => group.id === addForm.groupId ? { ...group, builderIds: Array.from(new Set([...(group.builderIds || []), builderId])) } : group)
      if (addForm.addToToday) {
        const currentDay = next.weeklyData?.[next.selectedDay] || { assignments: {} }
        next = { ...next, weeklyData: { ...next.weeklyData, [next.selectedDay]: { ...currentDay, assignments: { ...(currentDay.assignments || {}), [builderId]: defaultAssignment(profile, blankAssignment) } } } }
      }
      return appendAudits(next, [{ builder: profile.name, action: 'Builder created', oldValue: '', newValue: `Badge ${profile.badgeType}${addForm.addToToday ? ` · Added to ${next.selectedDay}` : ''}` }])
    })
    setProfileId(builderId)
    setAddForm({ name: '', employeeId: '', badgeType: 'day', defaultShift: '', defaultBoardId: '', defaultArea: '', isLineLead: false, countsAsProductionLabor: false, isTrainer: false, isSafetyMember: false, notes: '', startDate: '', addToToday: false, listId: '', groupId: '' })
    setShowAdd(keepOpen)
    showUndo(`${profile.name} created${addForm.addToToday ? ` and added to ${state.selectedDay}` : ''}.`, null)
  }

  const addQuickRows = () => {
    const rows = quickAddPreview.filter((row) => row.status === 'valid' && quickAddSelection.includes(row.key))
    if (!rows.length) return alert('Select at least one valid row.')
    const batchId = makeLocalId('batch')
    const createdAt = new Date().toISOString()
    saveState((prev) => {
      const created = rows.map((row) => normalizeProfile({ id: newId('builder'), name: row.name, badgeType: row.badgeType, defaultShift: row.defaultShift, createdAt, createdBy: admin, updatedAt: createdAt, updatedBy: admin }))
      const next = { ...prev, builderPool: [...(prev.builderPool || []), ...created] }
      return appendAudits(next, created.map((profile) => ({ builder: profile.name, action: 'Builder created by Quick Add', newValue: `${profile.badgeType} · ${profile.defaultShift || 'No default shift'}` })), batchId)
    })
    setQuickAddText('')
    setShowQuickAdd(false)
    showUndo(`${rows.length} builders added from Quick Add.`, null)
  }

  const archiveBuilder = (builderId) => {
    const profile = allProfiles.find((item) => item.id === builderId)
    if (!profile || profile.isArchived) return
    const reason = prompt(`Archive ${profile.name}? Historical staffing, hours, reports, teams, and Labor Share records will be preserved.\n\nOptional archive reason:`, '')
    if (reason === null) return
    if (!confirm(`Archive ${profile.name}?`)) return
    const previous = clone(profile)
    const timestamp = new Date().toISOString()
    saveState((prev) => appendAudits({ ...prev, builderPool: (prev.builderPool || []).map((item) => item.id === builderId ? { ...item, isArchived: true, archivedAt: timestamp, archivedBy: admin, archiveReason: clean(reason), updatedAt: timestamp, updatedBy: admin } : item) }, [{ builder: profile.name, action: 'Builder archived', oldValue: 'Active', newValue: clean(reason) || 'Archived' }]))
    if (profileId === builderId) setProfileId('')
    setSelectedIds((current) => current.filter((id) => id !== builderId))
    showUndo(`${profile.name} archived.`, () => {
      saveState((prev) => appendAudits({ ...prev, builderPool: (prev.builderPool || []).map((item) => item.id === builderId ? previous : item) }, [{ builder: profile.name, action: 'Archive undone', oldValue: 'Archived', newValue: 'Active' }]))
    })
  }

  const restoreBuilder = (builderId) => {
    const profile = allProfiles.find((item) => item.id === builderId)
    if (!profile || !profile.isArchived) return
    const previous = clone(profile)
    const timestamp = new Date().toISOString()
    saveState((prev) => appendAudits({ ...prev, builderPool: (prev.builderPool || []).map((item) => item.id === builderId ? { ...item, isArchived: false, archivedAt: '', archivedBy: '', archiveReason: '', updatedAt: timestamp, updatedBy: admin } : item) }, [{ builder: profile.name, action: 'Builder restored', oldValue: 'Archived', newValue: 'Active' }]))
    showUndo(`${profile.name} restored.`, () => {
      saveState((prev) => appendAudits({ ...prev, builderPool: (prev.builderPool || []).map((item) => item.id === builderId ? previous : item) }, [{ builder: profile.name, action: 'Restore undone', oldValue: 'Active', newValue: 'Archived' }]))
    })
  }

  const permanentlyDeleteBuilder = (builderId) => {
    const profile = allProfiles.find((item) => item.id === builderId)
    if (!profile?.isArchived) return
    const assignments = findAssignmentsForBuilder(state, builderId)
    const audits = (state.auditLog || []).filter((row) => row.builder === profile.name)
    const memberships = groups.some((group) => (group.builderIds || []).includes(builderId)) || lists.some((list) => (list.builderIds || []).includes(builderId))
    if (assignments.length || audits.length || memberships) {
      return alert(`Permanent deletion is blocked. ${profile.name} has historical assignments, audits, team/list memberships, or other retained records.`)
    }
    if (!confirm(`Permanently delete ${profile.name}? This cannot be undone.`)) return
    saveState((prev) => ({ ...prev, builderPool: (prev.builderPool || []).filter((item) => item.id !== builderId) }))
    showUndo(`${profile.name} permanently deleted.`, null)
  }

  const saveProfile = () => {
    if (!profileDraft) return
    const validation = validateBuilder(profileDraft, profileDraft.id)
    if (!validation.ok) return alert(validation.message)
    if (validation.similar && !confirm(`A similar builder, ${validation.similar.name}, exists. Save changes anyway?`)) return
    const original = allProfiles.find((profile) => profile.id === profileDraft.id)
    const nextProfile = normalizeProfile({ ...profileDraft, name: clean(profileDraft.name), employeeId: clean(profileDraft.employeeId), updatedAt: new Date().toISOString(), updatedBy: admin })
    saveState((prev) => appendAudits({ ...prev, builderPool: (prev.builderPool || []).map((profile) => profile.id === nextProfile.id ? nextProfile : profile) }, [{ builder: nextProfile.name, action: 'Builder profile edited', oldValue: original ? `${original.name} · ${original.badgeType}` : '', newValue: `${nextProfile.name} · ${nextProfile.badgeType}` }]))
    showUndo(`${nextProfile.name} profile saved.`, null)
  }

  const updateProfileSkill = (skill, checked) => {
    setProfileDraft((current) => {
      if (!current) return current
      if (skill.legacyField) return { ...current, [skill.legacyField]: checked }
      const values = new Set(current.skills || [])
      if (checked) values.add(skill.id)
      else values.delete(skill.id)
      return { ...current, skills: Array.from(values) }
    })
  }

  const updateSkillRecord = (skillId, patch) => {
    setProfileDraft((current) => {
      if (!current) return current
      const records = [...(current.skillRecords || [])]
      const index = records.findIndex((record) => record.skillId === skillId)
      const next = { ...(index >= 0 ? records[index] : { skillId }), ...patch }
      if (index >= 0) records[index] = next
      else records.push(next)
      return { ...current, skillRecords: records }
    })
  }

  const toggleFavorite = (builderId) => setFavorites((current) => current.includes(builderId) ? current.filter((id) => id !== builderId) : [builderId, ...current])
  const toggleSelected = (builderId) => setSelectedIds((current) => current.includes(builderId) ? current.filter((id) => id !== builderId) : [...current, builderId])
  const selectVisible = () => setSelectedIds((current) => Array.from(new Set([...current, ...pagedProfiles.map((profile) => profile.id)])))

  const createList = () => {
    const name = clean(listDraft.name)
    if (!name) return alert('Enter a list name.')
    if (lists.some((list) => lower(list.name) === lower(name))) return alert('A saved list with this name already exists.')
    const timestamp = new Date().toISOString()
    const list = { id: newId('list'), name, description: clean(listDraft.description), type: listDraft.type, builderIds: [], filters: listDraft.type === 'smart' ? { preset: listDraft.preset } : {}, isArchived: false, createdAt: timestamp, createdBy: admin, updatedAt: timestamp }
    saveState((prev) => appendAudits({ ...prev, builderLists: [...(prev.builderLists || []), list] }, [{ action: 'Saved builder list created', newValue: `${list.name} · ${list.type}` }]))
    setSelectedListId(list.id)
    setListDraft({ name: '', description: '', type: 'static', preset: 'tdr' })
  }

  const updateList = (listId, patch) => saveState((prev) => ({ ...prev, builderLists: (prev.builderLists || []).map((list) => list.id === listId ? { ...list, ...patch, updatedAt: new Date().toISOString() } : list) }))

  const addSelectedToList = (listId) => {
    const list = lists.find((item) => item.id === listId)
    if (!list || list.type === 'smart') return alert('Smart Lists update from filters and cannot accept manual membership.')
    const validIds = selectedIds.filter((id) => !allProfiles.find((profile) => profile.id === id)?.isArchived)
    updateList(listId, { builderIds: Array.from(new Set([...(list.builderIds || []), ...validIds])) })
    showUndo(`${validIds.length} builder(s) added to ${list.name}.`, () => updateList(listId, { builderIds: list.builderIds || [] }))
  }

  const removeFromList = (listId, builderId) => {
    const list = lists.find((item) => item.id === listId)
    if (!list || list.type === 'smart') return
    updateList(listId, { builderIds: (list.builderIds || []).filter((id) => id !== builderId) })
    showUndo(`Builder removed from ${list.name}.`, () => updateList(listId, { builderIds: list.builderIds || [] }))
  }

  const addListToToday = (list) => {
    const members = resolveSmartListMembers(list)
    const already = members.filter((profile) => dayState?.assignments?.[profile.id]).length
    const archived = members.filter((profile) => profile.isArchived).length
    const addable = members.length - already - archived
    if (!confirm(`${members.length} builders selected:\n${addable} will be added\n${already} already exist today\n${archived} archived builders will be skipped`)) return
    addBuildersToSelectedDay(members.map((profile) => profile.id), { batchId: makeLocalId('batch') })
  }

  const duplicateList = (list) => {
    const timestamp = new Date().toISOString()
    const copy = { ...clone(list), id: newId('list'), name: `${list.name} Copy`, createdAt: timestamp, createdBy: admin, updatedAt: timestamp, isArchived: false }
    saveState((prev) => ({ ...prev, builderLists: [...(prev.builderLists || []), copy] }))
    setSelectedListId(copy.id)
  }

  const deleteEmptyList = (list) => {
    if ((list.builderIds || []).length && list.type !== 'smart') return alert('Only empty static lists can be permanently deleted. Archive or remove members first.')
    if (!confirm(`Delete empty list ${list.name}?`)) return
    saveState((prev) => ({ ...prev, builderLists: (prev.builderLists || []).filter((item) => item.id !== list.id) }))
    if (selectedListId === list.id) setSelectedListId('')
  }

  const moveListMember = (list, builderId, direction) => {
    if (list.type === 'smart') return
    const ids = [...(list.builderIds || [])]
    const index = ids.indexOf(builderId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    updateList(list.id, { builderIds: ids })
  }

  const createGroup = () => {
    const name = clean(groupDraft.name)
    if (!name) return alert('Enter a group name.')
    if (groups.some((group) => lower(group.name) === lower(name))) return alert('A group with this name already exists.')
    const group = { id: newId('group'), name, description: clean(groupDraft.description), color: '#64748b', icon: '◉', builderIds: [], defaultBoardId: '', defaultShift: '', defaultArea: groupDraft.defaultArea, defaultStatus: groupDraft.defaultStatus, notes: '', isArchived: false }
    saveState((prev) => appendAudits({ ...prev, builderGroups: [...(prev.builderGroups || []), group] }, [{ action: 'Builder group created', newValue: group.name }]))
    setSelectedGroupId(group.id)
    setGroupDraft({ name: '', description: '', defaultArea: '', defaultStatus: 'Present' })
  }

  const updateGroup = (groupId, patch) => saveState((prev) => ({ ...prev, builderGroups: (prev.builderGroups || []).map((group) => group.id === groupId ? { ...group, ...patch } : group) }))

  const addSelectedToGroup = (groupId) => {
    const group = groups.find((item) => item.id === groupId)
    if (!group) return
    updateGroup(groupId, { builderIds: Array.from(new Set([...(group.builderIds || []), ...selectedIds.filter((id) => !allProfiles.find((profile) => profile.id === id)?.isArchived)])) })
    showUndo(`${selectedIds.length} builder(s) added to ${group.name}.`, () => updateGroup(groupId, { builderIds: group.builderIds || [] }))
  }

  const addGroupToToday = (group) => addBuildersToSelectedDay(group.builderIds || [], { assignment: { status: group.defaultStatus || 'Present', area: group.defaultArea || '' }, batchId: makeLocalId('batch') })

  const convertGroupToList = (group) => {
    const timestamp = new Date().toISOString()
    const list = { id: newId('list'), name: group.name, description: group.description || 'Converted from Builder Group', type: 'static', builderIds: [...(group.builderIds || [])], filters: {}, isArchived: false, createdAt: timestamp, createdBy: admin, updatedAt: timestamp }
    saveState((prev) => ({ ...prev, builderLists: [...(prev.builderLists || []), list] }))
    setView('lists')
    setSelectedListId(list.id)
  }

  const createCustomSkill = () => {
    const name = clean(customSkillDraft.name)
    const shortLabel = clean(customSkillDraft.shortLabel) || name
    if (!name) return alert('Enter a skill name.')
    if (skills.some((skill) => lower(skill.name) === lower(name))) return alert('This skill already exists.')
    const skill = { id: newId('skill'), name, shortLabel, description: '', category: customSkillDraft.category || 'Other', expirationEnabled: !!customSkillDraft.expirationEnabled, isActive: true }
    saveState((prev) => appendAudits({ ...prev, skillDefinitions: [...(prev.skillDefinitions || DEFAULT_BUILDER_SKILLS), skill] }, [{ action: 'Skill definition created', newValue: skill.name }]))
    setCustomSkillDraft({ name: '', shortLabel: '', category: 'Other', expirationEnabled: false })
  }

  const applyBulk = (action) => {
    if (!selectedIds.length) return alert('Select one or more builders first.')
    const batchId = makeLocalId('batch')
    if (action === 'add-today') return addBuildersToSelectedDay(selectedIds, { batchId })
    if (action === 'remove-today') return removeBuildersFromSelectedDay(selectedIds)
    if (action === 'status') {
      const ids = selectedIds.filter((id) => dayState?.assignments?.[id])
      ids.forEach((id) => updateBuilderAssignment(id, { status: bulkStatus }))
      saveState((prev) => appendAudits(prev, [{ action: 'Bulk daily status update', oldValue: `${ids.length} builders`, newValue: bulkStatus }], batchId))
      return showUndo(`${ids.length} builder status values updated.`, null)
    }
    if (action === 'area') {
      const ids = selectedIds.filter((id) => dayState?.assignments?.[id])
      ids.forEach((id) => updateBuilderAssignment(id, { area: bulkArea }))
      saveState((prev) => appendAudits(prev, [{ action: 'Bulk area update', oldValue: `${ids.length} builders`, newValue: bulkArea || 'Unassigned' }], batchId))
      return showUndo(`${ids.length} builders moved to ${bulkArea || 'Unassigned'}.`, null)
    }
    if (action === 'skill') {
      const skill = skills.find((item) => item.id === bulkSkill)
      if (!skill) return
      const previous = clone(state.builderPool)
      saveState((prev) => appendAudits({ ...prev, builderPool: (prev.builderPool || []).map((profile) => {
        if (!selectedSet.has(profile.id)) return profile
        if (skill.legacyField) return { ...profile, [skill.legacyField]: true, updatedAt: new Date().toISOString(), updatedBy: admin }
        return { ...profile, skills: Array.from(new Set([...(profile.skills || []), skill.id])), updatedAt: new Date().toISOString(), updatedBy: admin }
      }) }, [{ action: 'Bulk skill update', oldValue: `${selectedIds.length} builders`, newValue: skill.name }], batchId))
      return showUndo(`${skill.name} added to ${selectedIds.length} builders.`, () => saveState((prev) => ({ ...prev, builderPool: previous })))
    }
    if (action === 'list') return addSelectedToList(bulkListId)
    if (action === 'group') return addSelectedToGroup(bulkGroupId)
    if (action === 'archive') {
      if (!confirm(`Archive ${selectedIds.length} selected builders? Historical data will be preserved.`)) return
      const previous = clone(state.builderPool)
      const timestamp = new Date().toISOString()
      saveState((prev) => appendAudits({ ...prev, builderPool: (prev.builderPool || []).map((profile) => selectedSet.has(profile.id) ? { ...profile, isArchived: true, archivedAt: timestamp, archivedBy: admin, archiveReason: 'Bulk archive', updatedAt: timestamp, updatedBy: admin } : profile) }, [{ action: 'Bulk builder archive', oldValue: `${selectedIds.length} active builders`, newValue: 'Archived' }], batchId))
      setSelectedIds([])
      return showUndo(`${selectedIds.length} builders archived.`, () => saveState((prev) => ({ ...prev, builderPool: previous })))
    }
    if (action === 'restore') {
      const previous = clone(state.builderPool)
      saveState((prev) => appendAudits({ ...prev, builderPool: (prev.builderPool || []).map((profile) => selectedSet.has(profile.id) ? { ...profile, isArchived: false, archivedAt: '', archivedBy: '', archiveReason: '' } : profile) }, [{ action: 'Bulk builder restore', oldValue: `${selectedIds.length} archived builders`, newValue: 'Active' }], batchId))
      setSelectedIds([])
      return showUndo(`${selectedIds.length} builders restored.`, () => saveState((prev) => ({ ...prev, builderPool: previous })))
    }
  }

  const exportProfiles = (filename, profiles) => downloadCsv(filename, [
    ['Name', 'Employee ID', 'Badge', 'Default Shift', 'Default Board', 'Default Area', 'Line Lead', 'Production Labor', 'Trainer', 'Safety', 'Skills', 'Weekly Hours', 'Archived', 'Notes'],
    ...profiles.map((profile) => [profile.name, profile.employeeId, profile.badgeType, profile.defaultShift, profile.defaultBoardId, profile.defaultArea, profile.isLineLead, profile.countsAsProductionLabor, profile.isTrainer, profile.isSafetyMember, skills.filter((skill) => profileHasSkill(profile, skill)).map((skill) => skill.name).join('; '), Number(weeklyHoursMap[profile.id] || 0).toFixed(2), profile.isArchived, profile.notes]),
  ])

  const exportTodayRoster = () => downloadCsv(`today-roster-${state.currentBoardId}-${state.weekStartDate}-${state.selectedDay}.csv`, [
    ['Builder', 'Status', 'Area', 'Speed Lite Team', 'Clock In', 'Clock Out', 'Hours', 'Role', 'Skills', 'Notes'],
    ...activeBuilders.map((builder) => {
      const profile = allProfiles.find((item) => item.id === builder.id) || normalizeProfile(builder)
      const assignment = typeof getAssignment === 'function' ? getAssignment(builder.id) : dayState.assignments?.[builder.id] || {}
      let hours = fallbackAssignmentHours(assignment)
      try {
        if (typeof computeHoursForAssignment === 'function') hours = Object.values(computeHoursForAssignment(assignment, state.selectedDay, state.weekStartDate) || {}).reduce((sum, value) => sum + Number(value || 0), 0)
      } catch {}
      return [profile.name, assignment.status || 'Present', assignment.area || 'Unassigned', teamNameByBuilder[profile.id] || '', assignment.clockInTime || '', assignment.leaveTime || '', hours.toFixed(2), assignment.role || '', skills.filter((skill) => profileHasSkill(profile, skill)).map((skill) => skill.name).join('; '), assignment.builderNotes || '']
    }),
  ])

  const exportSkillsMatrix = () => downloadCsv('builder-skills-matrix.csv', [
    ['Builder', 'Employee ID', ...skills.map((skill) => skill.shortLabel || skill.name), 'Expired Certifications', 'Expiring Within 30 Days'],
    ...activeProfiles.map((profile) => [profile.name, profile.employeeId, ...skills.map((skill) => profileHasSkill(profile, skill) ? 'Yes' : ''), (profile.skillRecords || []).filter((record) => expirationState(record) === 'expired').map((record) => skills.find((skill) => skill.id === record.skillId)?.name || record.skillId).join('; '), (profile.skillRecords || []).filter((record) => expirationState(record) === 'expiring').map((record) => skills.find((skill) => skill.id === record.skillId)?.name || record.skillId).join('; ')])
  ])

  const parseImportFile = async (file) => {
    const text = await file.text()
    const lines = text.split(/\r?\n/).filter(Boolean)
    if (!lines.length) return setImportRows([])
    const header = lines[0].split(',').map((value) => lower(value.replace(/^"|"$/g, '')))
    const nameIndex = header.indexOf('name') >= 0 ? header.indexOf('name') : header.indexOf('builder')
    if (nameIndex < 0) return alert('CSV must contain a Name column.')
    const index = (label) => header.indexOf(label)
    const rows = lines.slice(1).map((line, rowIndex) => {
      const values = line.match(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g)?.map((value) => value.replace(/,$/, '').replace(/^"|"$/g, '').replaceAll('""', '"')) || []
      const name = clean(values[nameIndex])
      const employeeId = index('employee id') >= 0 ? clean(values[index('employee id')]) : index('employeeid') >= 0 ? clean(values[index('employeeid')]) : ''
      const existing = allProfiles.find((profile) => lower(profile.name) === lower(name) || (employeeId && lower(profile.employeeId) === lower(employeeId)))
      return { key: `import-${rowIndex}`, name, employeeId, badgeType: index('badge') >= 0 ? lower(values[index('badge')]) : index('badgetype') >= 0 ? lower(values[index('badgetype')]) : 'day', defaultShift: index('default shift') >= 0 ? lower(values[index('default shift')]) : '', existingId: existing?.id || '', status: !name ? 'invalid' : existing ? (existing.isArchived ? 'archived' : 'existing') : 'new' }
    })
    setImportRows(rows)
  }

  const applyImport = () => {
    const valid = importRows.filter((row) => row.status !== 'invalid')
    if (!valid.length) return alert('No valid import rows.')
    if (!confirm(`Apply ${valid.length} import rows using ${importMode === 'add' ? 'Add new only' : importMode === 'update' ? 'Update existing only' : 'Add and update'} mode?`)) return
    const batchId = makeLocalId('batch')
    const timestamp = new Date().toISOString()
    saveState((prev) => {
      let pool = [...(prev.builderPool || [])]
      const entries = []
      valid.forEach((row) => {
        const index = pool.findIndex((profile) => profile.id === row.existingId)
        if (index >= 0 && importMode !== 'add') {
          const existing = normalizeProfile(pool[index])
          pool[index] = { ...existing, employeeId: row.employeeId || existing.employeeId, badgeType: ['day', 'night', 'green'].includes(row.badgeType) ? row.badgeType : existing.badgeType, defaultShift: ['day', 'night'].includes(row.defaultShift) ? row.defaultShift : existing.defaultShift, updatedAt: timestamp, updatedBy: admin }
          entries.push({ builder: existing.name, action: 'Builder updated by import', oldValue: existing.badgeType, newValue: pool[index].badgeType })
        } else if (index < 0 && importMode !== 'update') {
          const profile = normalizeProfile({ id: newId('builder'), name: row.name, employeeId: row.employeeId, badgeType: ['day', 'night', 'green'].includes(row.badgeType) ? row.badgeType : 'day', defaultShift: ['day', 'night'].includes(row.defaultShift) ? row.defaultShift : '', createdAt: timestamp, createdBy: admin, updatedAt: timestamp, updatedBy: admin })
          pool.push(profile)
          entries.push({ builder: profile.name, action: 'Builder created by import', newValue: profile.badgeType })
        }
      })
      return appendAudits({ ...prev, builderPool: pool }, entries, batchId)
    })
    setImportRows([])
    showUndo('Roster import completed.', null)
  }

  const selectedList = lists.find((list) => list.id === selectedListId) || null
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || null
  const favoriteProfiles = favorites.map((id) => activeProfiles.find((profile) => profile.id === id)).filter(Boolean)
  const recentProfiles = recentIds.map((id) => allProfiles.find((profile) => profile.id === id)).filter(Boolean)
  const profileAudit = profileDraft ? (state.auditLog || []).filter((row) => row.builder === profileDraft.name).slice(0, 20) : []
  const duplicateEmployeeIds = useMemo(() => {
    const seen = new Map()
    const duplicates = new Set()
    activeProfiles.forEach((profile) => {
      const id = lower(profile.employeeId)
      if (!id) return
      if (seen.has(id)) { duplicates.add(seen.get(id)); duplicates.add(profile.id) }
      else seen.set(id, profile.id)
    })
    return duplicates
  }, [activeProfiles])

  const renderFilters = () => (
    <div className="builder-filter-bar">
      <div className="builder-search-field"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, ID, skill, role, group, or list" aria-label="Search builders" /></div>
      <select value={badgeFilter} onChange={(event) => setBadgeFilter(event.target.value)} aria-label="Badge filter"><option value="all">All badges</option><option value="day">Day</option><option value="night">Night</option><option value="green">Green</option></select>
      <select value={shiftFilter} onChange={(event) => setShiftFilter(event.target.value)} aria-label="Default shift filter"><option value="all">All shifts</option><option value="day">Day shift</option><option value="night">Night shift</option></select>
      <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Role filter"><option value="all">All roles</option><option value="line-lead">Line Leads</option><option value="trainer">Trainers</option><option value="safety">Safety</option><option value="skilled">Any skill</option></select>
      <select value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value)} aria-label="Availability filter"><option value="all">Any availability</option><option value="today">On today’s roster</option><option value="not-today">Not staffed today</option><option value="unassigned">Unassigned today</option><option value="away">Away today</option></select>
      <button className="secondary builder-clear-filter" onClick={() => { setSearch(''); setBadgeFilter('all'); setShiftFilter('all'); setRoleFilter('all'); setAvailabilityFilter('all') }}>Clear</button>
    </div>
  )

  const renderBulkToolbar = () => selectedIds.length ? (
    <div className="builder-bulk-toolbar" role="region" aria-live="polite" aria-label="Builder bulk actions">
      <strong>{selectedIds.length} selected</strong>
      <button className="secondary" onClick={() => applyBulk('add-today')}>Add to Today</button>
      <button className="secondary" onClick={() => applyBulk('remove-today')}>Remove Today</button>
      <select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)}>{STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}</select>
      <button className="secondary" onClick={() => applyBulk('status')}>Set Status</button>
      <select value={bulkArea} onChange={(event) => setBulkArea(event.target.value)}><option value="">Unassigned</option>{(effectiveAreaDefs || []).filter((area) => area.name !== 'Unassigned').map((area) => <option key={area.name} value={area.name}>{area.name}</option>)}</select>
      <button className="secondary" onClick={() => applyBulk('area')}>Set Area</button>
      <select value={bulkSkill} onChange={(event) => setBulkSkill(event.target.value)}>{skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select>
      <button className="secondary" onClick={() => applyBulk('skill')}>Add Skill</button>
      <select value={bulkListId} onChange={(event) => setBulkListId(event.target.value)}><option value="">Choose list</option>{lists.filter((list) => !list.isArchived && list.type !== 'smart').map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select>
      <button className="secondary" disabled={!bulkListId} onClick={() => applyBulk('list')}>Add to List</button>
      <select value={bulkGroupId} onChange={(event) => setBulkGroupId(event.target.value)}><option value="">Choose group</option>{groups.filter((group) => !group.isArchived).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
      <button className="secondary" disabled={!bulkGroupId} onClick={() => applyBulk('group')}>Add to Group</button>
      <button className="danger-lite" onClick={() => applyBulk(view === 'archived' ? 'restore' : 'archive')}>{view === 'archived' ? 'Restore' : 'Archive'}</button>
      <button className="secondary" onClick={() => exportProfiles('selected-builders.csv', allProfiles.filter((profile) => selectedSet.has(profile.id)))}>Export</button>
      <button className="secondary" onClick={() => setSelectedIds([])}>Clear Selection</button>
    </div>
  ) : null

  const openProfile = (profile) => setProfileId(profile.id)

  const renderToday = () => (
    <div className="builder-view-panel">
      <div className="builder-view-head"><div><h2>Today’s Roster</h2><p>{state.currentBoardId} · {state.boardShift} · Week {state.weekStartDate} · {state.selectedDay}</p></div><div className="builder-head-actions"><button className="primary" onClick={() => { setView('master'); setAvailabilityFilter('not-today') }}>Add from Master</button><button className="secondary" onClick={exportTodayRoster}>Export Today</button></div></div>
      {renderFilters()}
      {renderBulkToolbar()}
      <div className="builder-table-wrap">
        <table className="builder-management-table"><thead><tr><th><input type="checkbox" checked={activeBuilders.length > 0 && activeBuilders.every((builder) => selectedSet.has(builder.id))} onChange={(event) => setSelectedIds(event.target.checked ? activeBuilders.map((builder) => builder.id) : [])} aria-label="Select all today" /></th><th>Builder</th><th>Status</th><th>Area</th><th>Speed Lite Team</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Role / Skills</th><th>Notes</th><th>Actions</th></tr></thead>
          <tbody>{activeBuilders.length ? activeBuilders.filter((builder) => {
            const profile = allProfiles.find((item) => item.id === builder.id) || normalizeProfile(builder)
            const searchable = `${profile.name} ${profile.employeeId} ${(typeof builderFlags === 'function' ? builderFlags(profile) : []).join(' ')}`.toLowerCase()
            return !search || searchable.includes(lower(search))
          }).map((builder) => {
            const profile = allProfiles.find((item) => item.id === builder.id) || normalizeProfile(builder)
            const assignment = typeof getAssignment === 'function' ? getAssignment(builder.id) : dayState.assignments?.[builder.id] || {}
            let hours = fallbackAssignmentHours(assignment)
            try { if (typeof computeHoursForAssignment === 'function') hours = Object.values(computeHoursForAssignment(assignment, state.selectedDay, state.weekStartDate) || {}).reduce((sum, value) => sum + Number(value || 0), 0) } catch {}
            return <tr key={builder.id} className={profile.isArchived ? 'builder-row-archived' : ''}><td><input type="checkbox" checked={selectedSet.has(builder.id)} onChange={() => toggleSelected(builder.id)} aria-label={`Select ${profile.name}`} /></td><td><button className="builder-name-button" onClick={() => openProfile(profile)}>{favorites.includes(profile.id) ? '★ ' : ''}{profile.name}</button>{profile.isArchived ? <span className="builder-state-badge archived">Archived</span> : null}<div className="builder-cell-sub">{profile.employeeId || 'No employee ID'}</div></td><td><select value={assignment.status || 'Present'} onChange={(event) => updateBuilderAssignment(builder.id, { status: event.target.value })}>{STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}</select></td><td><select value={assignment.area || ''} onChange={(event) => updateBuilderAssignment(builder.id, { area: event.target.value })}><option value="">Unassigned</option>{(effectiveAreaDefs || []).filter((area) => area.name !== 'Unassigned').map((area) => <option key={area.name} value={area.name}>{area.name}</option>)}</select></td><td>{teamNameByBuilder[builder.id] || '—'}</td><td><input type="time" value={assignment.clockInTime || ''} onChange={(event) => updateBuilderAssignment(builder.id, { clockInTime: event.target.value })} /></td><td><input type="time" value={assignment.leaveTime || ''} onChange={(event) => updateBuilderAssignment(builder.id, { leaveTime: event.target.value })} /></td><td>{hours.toFixed(2)}</td><td><div className="builder-chip-wrap">{(typeof builderFlags === 'function' ? builderFlags(profile) : []).slice(0, 5).map((flag) => <span className="builder-skill-chip" key={flag}>{flag}</span>)}</div></td><td>{assignment.builderNotes || assignment.comment || '—'}</td><td><div className="builder-row-actions"><button className="mini-btn" onClick={() => openProfile(profile)}>Profile</button><button className="mini-btn danger-lite" onClick={() => removeBuildersFromSelectedDay([builder.id])}>Remove Today</button></div></td></tr>
          }) : <tr><td colSpan="11"><div className="builder-empty-state"><strong>No builders on today’s roster.</strong><span>Add builders from the Master List or a Saved List.</span><button className="primary" onClick={() => { setView('master'); setAvailabilityFilter('not-today') }}>Add Builders</button></div></td></tr>}</tbody></table>
      </div>
    </div>
  )

  const renderMaster = () => (
    <div className="builder-view-panel">
      <div className="builder-view-head"><div><h2>Master Builder List</h2><p>Permanent profiles are shared across boards. Daily assignments remain board, shift, week, and day scoped.</p></div><div className="builder-head-actions"><button className="primary" onClick={() => setShowAdd(true)}>Add Builder</button><button className="secondary" onClick={() => setShowQuickAdd(true)}>Quick Add</button><button className="secondary" onClick={() => exportProfiles('active-master-builders.csv', activeProfiles)}>Export Active</button></div></div>
      {(favoriteProfiles.length || recentProfiles.length) ? <div className="builder-quick-access"><div><strong>Favorites</strong><div className="builder-chip-wrap">{favoriteProfiles.map((profile) => <button key={profile.id} className="builder-person-chip" onClick={() => openProfile(profile)}>★ {profile.name}</button>)}</div></div><div><strong>Recent</strong><div className="builder-chip-wrap">{recentProfiles.slice(0, 5).map((profile) => <button key={profile.id} className="builder-person-chip" onClick={() => openProfile(profile)}>{profile.name}</button>)}</div></div></div> : null}
      {renderFilters()}
      {renderBulkToolbar()}
      <div className="builder-table-tools"><span>{filteredProfiles.length} matching active builders</span><div><label>Sort <select value={sortKey} onChange={(event) => setSortKey(event.target.value)}><option value="name">Name</option><option value="badge">Badge</option><option value="shift">Shift</option><option value="hours">Weekly hours</option><option value="last-active">Last active</option></select></label><button className="secondary mini-btn" onClick={() => setSortDirection((value) => value === 'asc' ? 'desc' : 'asc')}>{sortDirection === 'asc' ? '↑ Asc' : '↓ Desc'}</button><button className="secondary mini-btn" onClick={selectVisible}>Select Page</button></div></div>
      <div className="builder-table-wrap"><table className="builder-management-table master"><thead><tr><th></th><th>Builder</th><th>Badge</th><th>Default Shift / Board</th><th>Today</th><th>Roles</th><th>Equipment Skills</th><th>Groups / Lists</th><th>Weekly Hours</th><th>Last Active</th><th>Actions</th></tr></thead><tbody>{pagedProfiles.length ? pagedProfiles.map((profile) => {
        const assignment = dayState?.assignments?.[profile.id]
        const flags = typeof builderFlags === 'function' ? builderFlags(profile) : []
        return <tr key={profile.id}><td><input type="checkbox" checked={selectedSet.has(profile.id)} onChange={() => toggleSelected(profile.id)} aria-label={`Select ${profile.name}`} /></td><td><button className="builder-name-button" onClick={() => openProfile(profile)}>{favorites.includes(profile.id) ? '★ ' : ''}{profile.name}</button><div className="builder-cell-sub">{profile.employeeId || 'No employee ID'}{duplicateEmployeeIds.has(profile.id) ? <span className="builder-warning-inline"> Duplicate ID</span> : ''}</div></td><td><span className={`badge-chip ${typeof badgeTypeClass === 'function' ? badgeTypeClass(profile.badgeType) : ''}`}>{(profile.badgeType || 'day').toUpperCase()}</span></td><td>{profile.defaultShift || '—'}<div className="builder-cell-sub">{boardPresets?.[profile.defaultBoardId]?.label || profile.defaultBoardId || 'No default board'}</div></td><td>{assignment ? <><span className={`builder-state-badge ${lower(assignment.status)}`}>{assignment.status || 'Present'}</span><div className="builder-cell-sub">{assignment.area || 'Unassigned'}</div></> : <span className="builder-state-badge neutral">Not staffed</span>}</td><td><div className="builder-chip-wrap">{flags.filter((flag) => /lead|trainer|safety|production/i.test(flag)).map((flag) => <span className="builder-role-chip" key={flag}>{flag}</span>)}</div></td><td><div className="builder-chip-wrap">{flags.filter((flag) => !/lead|trainer|safety|production/i.test(flag)).slice(0, 6).map((flag) => <span className="builder-skill-chip" key={flag}>{flag}</span>)}</div></td><td><div className="builder-cell-sub">{groupMembershipNames(profile.id).join(', ') || 'No groups'}</div><div className="builder-cell-sub">{listMembershipNames(profile.id).join(', ') || 'No lists'}</div></td><td>{Number(weeklyHoursMap[profile.id] || 0).toFixed(2)}</td><td>{lastActiveMap[profile.id] || 'Never'}</td><td><div className="builder-row-actions"><button className="mini-btn" onClick={() => openProfile(profile)}>Profile</button><button className="mini-btn" disabled={!!assignment} onClick={() => addBuildersToSelectedDay([profile.id])}>{assignment ? 'On Today' : 'Add Today'}</button><button className="mini-btn danger-lite" onClick={() => archiveBuilder(profile.id)}>Archive</button></div></td></tr>
      }) : <tr><td colSpan="11"><div className="builder-empty-state"><strong>{activeProfiles.length ? 'No builders match these filters.' : 'Add your first builder or import a roster.'}</strong>{!activeProfiles.length ? <button className="primary" onClick={() => setShowAdd(true)}>Add Builder</button> : null}</div></td></tr>}</tbody></table></div>
      <div className="builder-pagination"><button className="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {maxPage}</span><button className="secondary" disabled={page >= maxPage} onClick={() => setPage((value) => value + 1)}>Next</button></div>
    </div>
  )

  const renderLists = () => (
    <div className="builder-view-panel">
      <div className="builder-view-head"><div><h2>Saved Builder Lists</h2><p>Lists are reusable selections. They do not become staffing assignments until you add them to a day.</p></div></div>
      <div className="builder-two-column"><div className="builder-card"><h3>Create List</h3><label>Name<input value={listDraft.name} onChange={(event) => setListDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Rack Prep Trained" /></label><label>Description<textarea value={listDraft.description} onChange={(event) => setListDraft((current) => ({ ...current, description: event.target.value }))} /></label><label>List Type<select value={listDraft.type} onChange={(event) => setListDraft((current) => ({ ...current, type: event.target.value }))}><option value="static">Static List</option><option value="smart">Smart List</option></select></label>{listDraft.type === 'smart' ? <label>Smart Filter<select value={listDraft.preset} onChange={(event) => setListDraft((current) => ({ ...current, preset: event.target.value }))}>{SMART_LIST_PRESETS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label> : null}<button className="primary" onClick={createList}>Create List</button><div className="builder-list-stack">{lists.filter((list) => !list.isArchived).map((list) => <button key={list.id} className={selectedListId === list.id ? 'builder-list-select active' : 'builder-list-select'} onClick={() => setSelectedListId(list.id)}><span>{list.name}</span><small>{list.type === 'smart' ? 'Smart' : 'Static'} · {resolveSmartListMembers(list).length}</small></button>)}{!lists.filter((list) => !list.isArchived).length ? <div className="builder-empty-state compact">Create a reusable list for faster staffing.</div> : null}</div></div>
      <div className="builder-card">{selectedList ? <><div className="builder-card-head"><div><h3>{selectedList.name}</h3><p>{selectedList.description || 'No description'} · {selectedList.type === 'smart' ? 'Smart List' : 'Static List'}</p></div><div className="builder-head-actions"><button className="primary" onClick={() => addListToToday(selectedList)}>Add List to Today</button><button className="secondary" onClick={() => duplicateList(selectedList)}>Duplicate</button><button className="secondary" onClick={() => exportProfiles(`${selectedList.name.replace(/\s+/g, '-').toLowerCase()}.csv`, resolveSmartListMembers(selectedList))}>Export</button></div></div>{selectedList.type !== 'smart' ? <div className="builder-inline-editor"><select value={bulkListId} onChange={(event) => setBulkListId(event.target.value)}><option value={selectedList.id}>{selectedList.name}</option></select><button className="secondary" disabled={!selectedIds.length} onClick={() => addSelectedToList(selectedList.id)}>Add Selected Builders ({selectedIds.length})</button></div> : <div className="builder-info-banner">Smart List membership updates automatically from its filter.</div>}<div className="builder-member-list">{resolveSmartListMembers(selectedList).map((profile, index) => <div className="builder-member-row" key={profile.id}><button className="builder-name-button" onClick={() => openProfile(profile)}>{profile.name}</button><span>{profile.badgeType} · {Number(weeklyHoursMap[profile.id] || 0).toFixed(1)}h</span><div>{selectedList.type !== 'smart' ? <><button className="mini-btn" onClick={() => moveListMember(selectedList, profile.id, -1)} disabled={index === 0}>↑</button><button className="mini-btn" onClick={() => moveListMember(selectedList, profile.id, 1)} disabled={index === resolveSmartListMembers(selectedList).length - 1}>↓</button><button className="mini-btn danger-lite" onClick={() => removeFromList(selectedList.id, profile.id)}>Remove</button></> : null}</div></div>)}{!resolveSmartListMembers(selectedList).length ? <div className="builder-empty-state compact">This list is empty.</div> : null}</div><div className="builder-danger-row"><button className="danger-lite" onClick={() => updateList(selectedList.id, { isArchived: true })}>Archive List</button><button className="danger-lite" onClick={() => deleteEmptyList(selectedList)}>Delete Empty List</button></div></> : <div className="builder-empty-state"><strong>Select a list.</strong><span>Static Lists store chosen builder IDs. Smart Lists update from filters.</span></div>}</div></div>
      <div className="builder-selection-source"><h3>Choose Builders for Static Lists</h3>{renderFilters()}<div className="builder-picker-grid">{filteredProfiles.slice(0, 100).map((profile) => <label key={profile.id} className={selectedSet.has(profile.id) ? 'builder-picker-card selected' : 'builder-picker-card'}><input type="checkbox" checked={selectedSet.has(profile.id)} onChange={() => toggleSelected(profile.id)} /><span><strong>{profile.name}</strong><small>{profile.badgeType} · {(typeof builderFlags === 'function' ? builderFlags(profile) : []).join(', ') || 'No skills'}</small></span></label>)}</div></div>
    </div>
  )

  const renderGroups = () => (
    <div className="builder-view-panel"><div className="builder-view-head"><div><h2>Builder Groups</h2><p>Groups represent an operational identity or classification. Saved Lists are reusable staffing selections.</p></div></div><div className="builder-two-column"><div className="builder-card"><h3>Create Group</h3><label>Name<input value={groupDraft.name} onChange={(event) => setGroupDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>Description<textarea value={groupDraft.description} onChange={(event) => setGroupDraft((current) => ({ ...current, description: event.target.value }))} /></label><label>Default Area<select value={groupDraft.defaultArea} onChange={(event) => setGroupDraft((current) => ({ ...current, defaultArea: event.target.value }))}><option value="">Unassigned</option>{(effectiveAreaDefs || []).filter((area) => area.name !== 'Unassigned').map((area) => <option key={area.name} value={area.name}>{area.name}</option>)}</select></label><label>Default Daily Status<select value={groupDraft.defaultStatus} onChange={(event) => setGroupDraft((current) => ({ ...current, defaultStatus: event.target.value }))}>{STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}</select></label><button className="primary" onClick={createGroup}>Create Group</button><div className="builder-list-stack">{groups.filter((group) => !group.isArchived).map((group) => <button key={group.id} className={selectedGroupId === group.id ? 'builder-list-select active' : 'builder-list-select'} onClick={() => setSelectedGroupId(group.id)}><span>{group.icon || '◉'} {group.name}</span><small>{(group.builderIds || []).length} builders</small></button>)}</div></div><div className="builder-card">{selectedGroup ? <><div className="builder-card-head"><div><h3>{selectedGroup.name}</h3><p>{selectedGroup.description || 'Operational builder group'}</p></div><div className="builder-head-actions"><button className="primary" onClick={() => addGroupToToday(selectedGroup)}>Add Group to Today</button><button className="secondary" onClick={() => convertGroupToList(selectedGroup)}>Convert to Saved List</button><button className="secondary" onClick={() => exportProfiles(`${selectedGroup.name.replace(/\s+/g, '-').toLowerCase()}-group.csv`, activeProfiles.filter((profile) => (selectedGroup.builderIds || []).includes(profile.id)))}>Export</button></div></div><div className="builder-inline-editor"><input value={selectedGroup.name} onChange={(event) => updateGroup(selectedGroup.id, { name: event.target.value })} /><input value={selectedGroup.description || ''} onChange={(event) => updateGroup(selectedGroup.id, { description: event.target.value })} placeholder="Description" /><button className="secondary" disabled={!selectedIds.length} onClick={() => addSelectedToGroup(selectedGroup.id)}>Add Selected ({selectedIds.length})</button></div><div className="builder-member-list">{activeProfiles.filter((profile) => (selectedGroup.builderIds || []).includes(profile.id)).map((profile) => <div className="builder-member-row" key={profile.id}><button className="builder-name-button" onClick={() => openProfile(profile)}>{profile.name}</button><span>{profile.badgeType}</span><button className="mini-btn danger-lite" onClick={() => updateGroup(selectedGroup.id, { builderIds: (selectedGroup.builderIds || []).filter((id) => id !== profile.id) })}>Remove</button></div>)}</div><div className="builder-danger-row"><button className="danger-lite" onClick={() => updateGroup(selectedGroup.id, { isArchived: true })}>Archive Group</button></div></> : <div className="builder-empty-state">Select or create a group.</div>}</div></div><div className="builder-selection-source"><h3>Select Builders for Groups</h3>{renderFilters()}<div className="builder-picker-grid">{filteredProfiles.slice(0, 100).map((profile) => <label key={profile.id} className={selectedSet.has(profile.id) ? 'builder-picker-card selected' : 'builder-picker-card'}><input type="checkbox" checked={selectedSet.has(profile.id)} onChange={() => toggleSelected(profile.id)} /><span><strong>{profile.name}</strong><small>{profile.badgeType} · {profile.defaultShift || 'No default shift'}</small></span></label>)}</div></div></div>
  )

  const renderSkills = () => (
    <div className="builder-view-panel"><div className="builder-view-head"><div><h2>Skills & Certifications</h2><p>Expired skills remain recorded and are marked for action instead of being removed automatically.</p></div><div className="builder-head-actions"><button className="secondary" onClick={exportSkillsMatrix}>Export Skills Matrix</button></div></div><div className="builder-health-grid"><div className="builder-health-card"><span>Skill Definitions</span><strong>{skills.length}</strong></div><div className="builder-health-card warning"><span>Expiring ≤30 days</span><strong>{expiringSkillCount}</strong></div><div className="builder-health-card danger"><span>Expired</span><strong>{expiredSkillCount}</strong></div><div className="builder-health-card"><span>Builders with any skill</span><strong>{activeProfiles.filter((profile) => skills.some((skill) => profileHasSkill(profile, skill))).length}</strong></div></div><div className="builder-two-column"><div className="builder-card"><h3>Add Configurable Skill</h3><label>Name<input value={customSkillDraft.name} onChange={(event) => setCustomSkillDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>Short Label<input value={customSkillDraft.shortLabel} onChange={(event) => setCustomSkillDraft((current) => ({ ...current, shortLabel: event.target.value }))} /></label><label>Category<select value={customSkillDraft.category} onChange={(event) => setCustomSkillDraft((current) => ({ ...current, category: event.target.value }))}><option>Equipment</option><option>Role</option><option>Process</option><option>Other</option></select></label><label className="builder-check"><input type="checkbox" checked={customSkillDraft.expirationEnabled} onChange={(event) => setCustomSkillDraft((current) => ({ ...current, expirationEnabled: event.target.checked }))} /> Track expiration</label><button className="primary" onClick={createCustomSkill}>Add Skill</button></div><div className="builder-card"><h3>Skill Definitions</h3><div className="builder-member-list">{skills.map((skill) => { const assigned = activeProfiles.filter((profile) => profileHasSkill(profile, skill)).length; return <div className="builder-member-row" key={skill.id}><span><strong>{skill.name}</strong><small>{skill.category} · {skill.expirationEnabled ? 'Expiration tracked' : 'No expiration'}</small></span><span>{assigned} assigned</span>{!skill.legacyField ? <button className="mini-btn danger-lite" onClick={() => saveState((prev) => ({ ...prev, skillDefinitions: (prev.skillDefinitions || []).map((item) => item.id === skill.id ? { ...item, isActive: false } : item) }))}>Deactivate</button> : <span className="builder-state-badge neutral">Core</span>}</div> })}</div></div></div><div className="builder-card"><h3>Skills Matrix</h3><div className="builder-table-wrap"><table className="builder-management-table skills"><thead><tr><th>Builder</th>{skills.map((skill) => <th key={skill.id}>{skill.shortLabel || skill.name}</th>)}</tr></thead><tbody>{activeProfiles.slice(0, 200).map((profile) => <tr key={profile.id}><td><button className="builder-name-button" onClick={() => openProfile(profile)}>{profile.name}</button></td>{skills.map((skill) => { const record = skillRecord(profile, skill.id); const status = expirationState(record); return <td key={skill.id}><span className={`builder-skill-state ${profileHasSkill(profile, skill) ? 'yes' : 'no'} ${status}`}>{profileHasSkill(profile, skill) ? status === 'expired' ? 'Expired' : status === 'expiring' ? 'Expiring' : '✓' : '—'}</span></td> })}</tr>)}</tbody></table></div></div></div>
  )

  const renderArchived = () => (
    <div className="builder-view-panel"><div className="builder-view-head"><div><h2>Archived Builders</h2><p>Historical assignments, hours, reports, Speed Lite teams, Labor Share history, and audits remain preserved.</p></div><button className="secondary" onClick={() => exportProfiles('archived-builders.csv', archivedProfiles)}>Export Archived</button></div>{renderFilters()}{renderBulkToolbar()}<div className="builder-table-wrap"><table className="builder-management-table"><thead><tr><th></th><th>Builder</th><th>Badge</th><th>Archived By</th><th>Archived At</th><th>Reason</th><th>Historical Assignments</th><th>Actions</th></tr></thead><tbody>{pagedProfiles.length ? pagedProfiles.map((profile) => <tr key={profile.id}><td><input type="checkbox" checked={selectedSet.has(profile.id)} onChange={() => toggleSelected(profile.id)} /></td><td><button className="builder-name-button" onClick={() => openProfile(profile)}>{profile.name}</button><div className="builder-cell-sub">{profile.employeeId || 'No employee ID'}</div></td><td>{profile.badgeType}</td><td>{profile.archivedBy || '—'}</td><td>{formatDateTime(profile.archivedAt)}</td><td>{profile.archiveReason || '—'}</td><td>{findAssignmentsForBuilder(state, profile.id).length}</td><td><div className="builder-row-actions"><button className="primary mini-btn" onClick={() => restoreBuilder(profile.id)}>Restore</button><button className="mini-btn" onClick={() => openProfile(profile)}>Profile</button><button className="danger-lite mini-btn" onClick={() => permanentlyDeleteBuilder(profile.id)}>Permanent Delete</button></div></td></tr>) : <tr><td colSpan="8"><div className="builder-empty-state"><strong>No archived builders.</strong></div></td></tr>}</tbody></table></div></div>
  )

  const renderImport = () => (
    <div className="builder-view-panel"><div className="builder-view-head"><div><h2>Import / Export</h2><p>Preview every import before changing the master list. Existing skills, notes, and defaults are preserved unless a provided column is explicitly applied.</p></div></div><div className="builder-two-column"><div className="builder-card"><h3>Import Roster CSV</h3><label className="builder-file-button">Choose CSV<input type="file" accept=".csv,text/csv" onChange={(event) => event.target.files?.[0] && parseImportFile(event.target.files[0])} /></label><label>Import Mode<select value={importMode} onChange={(event) => setImportMode(event.target.value)}><option value="add">Add new only</option><option value="update">Update existing only</option><option value="both">Add and update</option></select></label><button className="primary" disabled={!importRows.length} onClick={applyImport}>Apply Confirmed Import</button><button className="secondary" onClick={() => downloadCsv('staffboard-builder-import-template.csv', [['Name', 'Employee ID', 'Badge', 'Default Shift'], ['John Smith', '12345', 'green', 'day']])}>Download Template</button></div><div className="builder-card"><h3>Builder Management Exports</h3><div className="builder-export-grid"><button className="secondary" onClick={() => exportProfiles('full-master-builders.csv', allProfiles)}>Full Master List</button><button className="secondary" onClick={() => exportProfiles('active-builders.csv', activeProfiles)}>Active Builders</button><button className="secondary" onClick={() => exportProfiles('archived-builders.csv', archivedProfiles)}>Archived Builders</button><button className="secondary" onClick={exportTodayRoster}>Today’s Roster</button><button className="secondary" onClick={exportSkillsMatrix}>Skills Matrix</button><button className="secondary" onClick={() => downloadCsv('training-expiration-report.csv', [['Builder', 'Skill', 'Expiration', 'Status'], ...activeProfiles.flatMap((profile) => (profile.skillRecords || []).filter((record) => ['expired', 'expiring'].includes(expirationState(record))).map((record) => [profile.name, skills.find((skill) => skill.id === record.skillId)?.name || record.skillId, record.expirationDate, expirationState(record)]))])}>Expiration Report</button></div></div></div>{importRows.length ? <div className="builder-card"><h3>Import Preview</h3><div className="builder-import-summary"><span>New {importRows.filter((row) => row.status === 'new').length}</span><span>Existing {importRows.filter((row) => row.status === 'existing').length}</span><span>Archived matches {importRows.filter((row) => row.status === 'archived').length}</span><span>Invalid {importRows.filter((row) => row.status === 'invalid').length}</span></div><div className="builder-table-wrap"><table className="builder-management-table"><thead><tr><th>Name</th><th>Employee ID</th><th>Badge</th><th>Default Shift</th><th>Preview Result</th></tr></thead><tbody>{importRows.map((row) => <tr key={row.key}><td>{row.name || '—'}</td><td>{row.employeeId || '—'}</td><td>{row.badgeType}</td><td>{row.defaultShift || '—'}</td><td><span className={`builder-state-badge ${row.status}`}>{row.status}</span></td></tr>)}</tbody></table></div></div> : null}</div>
  )

  const renderHistory = () => (
    <div className="builder-view-panel"><div className="builder-view-head"><div><h2>Builder Change History</h2><p>Builder creation, edits, archive/restore actions, daily roster changes, lists, groups, skills, and imports.</p></div></div><div className="builder-card"><div className="builder-filter-bar"><div className="builder-search-field"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search admin, builder, action, old value, or new value" /></div></div><div className="builder-table-wrap"><table className="builder-management-table"><thead><tr><th>Time</th><th>Admin</th><th>Builder</th><th>Action</th><th>Previous</th><th>New</th><th>Board / Shift</th><th>Week / Day</th><th>Batch</th></tr></thead><tbody>{(state.auditLog || []).filter((row) => !search || [row.admin, row.builder, row.action, row.oldValue, row.newValue].join(' ').toLowerCase().includes(lower(search))).slice(0, 500).map((row, index) => <tr key={`${row.timestamp}-${index}`}><td>{row.timestamp}</td><td>{row.admin || '—'}</td><td>{row.builder || '—'}</td><td>{row.action}</td><td>{row.oldValue || '—'}</td><td>{row.newValue || '—'}</td><td>{row.board || '—'} / {row.shift || '—'}</td><td>{row.week || '—'} / {row.day || '—'}</td><td>{row.batchId || '—'}</td></tr>)}</tbody></table></div></div></div>
  )

  const renderCurrentView = () => {
    if (view === 'today') return renderToday()
    if (view === 'master') return renderMaster()
    if (view === 'lists') return renderLists()
    if (view === 'groups') return renderGroups()
    if (view === 'skills') return renderSkills()
    if (view === 'archived') return renderArchived()
    if (view === 'import') return renderImport()
    return renderHistory()
  }

  return (
    <div className="board-shell builder-management-shell" data-builder-management-v3 data-builder-view={view}>
      <div className="builder-management-header">
        <div><div className="builder-breadcrumb">Builders › {VIEW_OPTIONS.find(([id]) => id === view)?.[1] || 'Workspace'}</div><div className="title">Builder Management</div><div className="builder-context-line">{boardPresets?.[state.currentBoardId]?.label || state.currentBoardId} · Week {state.weekStartDate} · {state.selectedDay} · Admin {admin}</div></div>
        <div className="builder-header-actions"><button className="primary" onClick={() => setShowAdd(true)}>＋ Add Builder</button><button className="secondary" onClick={() => setShowQuickAdd(true)}>Quick Add</button></div>
      </div>

      <div className="builder-health-grid">
        <button className="builder-health-card" onClick={() => setView('master')}><span>Active Builders</span><strong>{activeProfiles.length}</strong></button>
        <button className="builder-health-card" onClick={() => setView('today')}><span>On Today’s Roster</span><strong>{activeBuilders.length}</strong></button>
        <button className="builder-health-card" onClick={() => { setView('master'); setAvailabilityFilter('not-today') }}><span>Not Staffed Today</span><strong>{activeProfiles.filter((profile) => !dayState?.assignments?.[profile.id]).length}</strong></button>
        <button className="builder-health-card" onClick={() => setView('archived')}><span>Archived</span><strong>{archivedProfiles.length}</strong></button>
        <div className="builder-health-card"><span>Line Leads / Trainers</span><strong>{activeProfiles.filter((profile) => profile.isLineLead).length} / {activeProfiles.filter((profile) => profile.isTrainer).length}</strong></div>
        <div className={`builder-health-card ${expiredSkillCount ? 'danger' : ''}`}><span>Expired Skills</span><strong>{expiredSkillCount}</strong></div>
      </div>

      <div className="builder-workspace-layout">
        <nav className="builder-subnav" aria-label="Builder management sections">
          {VIEW_OPTIONS.map(([id, label, shortLabel]) => <button key={id} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => { setView(id); setSelectedIds([]) }}><span className="builder-subnav-icon" aria-hidden="true">{id === 'today' ? '◷' : id === 'master' ? '♙' : id === 'lists' ? '☷' : id === 'groups' ? '◎' : id === 'skills' ? '✓' : id === 'archived' ? '⌫' : id === 'import' ? '⇅' : '≡'}</span><span>{label}</span><small>{id === 'today' ? activeBuilders.length : id === 'master' ? activeProfiles.length : id === 'lists' ? lists.filter((list) => !list.isArchived).length : id === 'groups' ? groups.filter((group) => !group.isArchived).length : id === 'archived' ? archivedProfiles.length : shortLabel}</small></button>)}
        </nav>
        <main className="builder-workspace-content">{renderCurrentView()}</main>
      </div>

      {showAdd ? <div className="builder-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAdd(false) }}><div className="builder-modal" role="dialog" aria-modal="true" aria-labelledby="add-builder-title"><div className="builder-modal-head"><div><h2 id="add-builder-title">Add Builder</h2><p>Create a permanent profile and optionally add it to today, a list, or a group.</p></div><button className="builder-icon-button" aria-label="Close Add Builder" onClick={() => setShowAdd(false)}>×</button></div><div className="builder-form-grid"><label className="span-two">Full Name *<input autoFocus value={addForm.name} onChange={(event) => setAddForm((current) => ({ ...current, name: event.target.value }))} /></label><label>Employee / Badge ID<input value={addForm.employeeId} onChange={(event) => setAddForm((current) => ({ ...current, employeeId: event.target.value }))} /></label><label>Badge Type<select value={addForm.badgeType} onChange={(event) => setAddForm((current) => ({ ...current, badgeType: event.target.value }))}><option value="day">Day</option><option value="night">Night</option><option value="green">Green</option></select></label><label>Default Shift<select value={addForm.defaultShift} onChange={(event) => setAddForm((current) => ({ ...current, defaultShift: event.target.value }))}><option value="">None</option><option value="day">Day</option><option value="night">Night</option></select></label><label>Default Board<select value={addForm.defaultBoardId} onChange={(event) => setAddForm((current) => ({ ...current, defaultBoardId: event.target.value }))}><option value="">None</option>{Object.entries(boardPresets || {}).map(([id, preset]) => <option key={id} value={id}>{preset.label}</option>)}</select></label><label>Default Area<select value={addForm.defaultArea} onChange={(event) => setAddForm((current) => ({ ...current, defaultArea: event.target.value }))}><option value="">Unassigned</option>{(effectiveAreaDefs || []).filter((area) => area.name !== 'Unassigned').map((area) => <option key={area.name} value={area.name}>{area.name}</option>)}</select></label><label>Start Date<input type="date" value={addForm.startDate} onChange={(event) => setAddForm((current) => ({ ...current, startDate: event.target.value }))} /></label><label>Saved List<select value={addForm.listId} onChange={(event) => setAddForm((current) => ({ ...current, listId: event.target.value }))}><option value="">None</option>{lists.filter((list) => !list.isArchived && list.type !== 'smart').map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label><label>Group<select value={addForm.groupId} onChange={(event) => setAddForm((current) => ({ ...current, groupId: event.target.value }))}><option value="">None</option>{groups.filter((group) => !group.isArchived).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label className="span-two">Notes<textarea value={addForm.notes} onChange={(event) => setAddForm((current) => ({ ...current, notes: event.target.value }))} /></label></div><div className="builder-check-grid"><label><input type="checkbox" checked={addForm.isLineLead} onChange={(event) => setAddForm((current) => ({ ...current, isLineLead: event.target.checked }))} /> Line Lead</label><label><input type="checkbox" checked={addForm.countsAsProductionLabor} onChange={(event) => setAddForm((current) => ({ ...current, countsAsProductionLabor: event.target.checked }))} /> Counts as Production Labor</label><label><input type="checkbox" checked={addForm.isTrainer} onChange={(event) => setAddForm((current) => ({ ...current, isTrainer: event.target.checked }))} /> Trainer</label><label><input type="checkbox" checked={addForm.isSafetyMember} onChange={(event) => setAddForm((current) => ({ ...current, isSafetyMember: event.target.checked }))} /> Safety Member</label><label><input type="checkbox" checked={addForm.addToToday} onChange={(event) => setAddForm((current) => ({ ...current, addToToday: event.target.checked }))} /> Add directly to {state.selectedDay}</label></div><div className="builder-modal-actions"><button className="secondary" onClick={() => setShowAdd(false)}>Cancel</button><button className="secondary" onClick={() => createBuilder(true)}>Add & Add Another</button><button className="primary" onClick={() => createBuilder(false)}>Add & Close</button></div></div></div> : null}

      {showQuickAdd ? <div className="builder-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowQuickAdd(false) }}><div className="builder-modal large" role="dialog" aria-modal="true" aria-labelledby="quick-add-title"><div className="builder-modal-head"><div><h2 id="quick-add-title">Quick Add Builders</h2><p>Paste one name per line, or tab-separated: Name, Badge, Shift.</p></div><button className="builder-icon-button" onClick={() => setShowQuickAdd(false)} aria-label="Close Quick Add">×</button></div><textarea className="builder-quick-add-input" rows="9" value={quickAddText} onChange={(event) => setQuickAddText(event.target.value)} placeholder={'John Smith\nMaria Lopez\nDavid Brown\n\nJohn Smith\tGreen\tDay'} /><div className="builder-import-summary"><span>Valid {quickAddPreview.filter((row) => row.status === 'valid').length}</span><span>Duplicates {quickAddPreview.filter((row) => row.status === 'duplicate').length}</span><span>Invalid {quickAddPreview.filter((row) => row.status === 'invalid').length}</span></div><div className="builder-quick-preview">{quickAddPreview.map((row) => <label key={row.key} className={`builder-quick-row ${row.status}`}><input type="checkbox" disabled={row.status !== 'valid'} checked={quickAddSelection.includes(row.key)} onChange={() => setQuickAddSelection((current) => current.includes(row.key) ? current.filter((key) => key !== row.key) : [...current, row.key])} /><span><strong>{row.name || `Line ${row.line}`}</strong><small>{row.badgeType} · {row.defaultShift || 'No shift'} · {row.message}</small></span></label>)}</div><div className="builder-modal-actions"><button className="secondary" onClick={() => setShowQuickAdd(false)}>Cancel</button><button className="primary" onClick={addQuickRows}>Add Selected Valid Rows</button></div></div></div> : null}

      {profileDraft ? <div className="builder-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileId('') }}><aside className="builder-profile-drawer" role="dialog" aria-modal="true" aria-labelledby="builder-profile-title"><div className="builder-modal-head sticky"><div><div className="builder-breadcrumb">Builders › {profileDraft.name}</div><h2 id="builder-profile-title">Builder Profile</h2></div><button className="builder-icon-button" onClick={() => setProfileId('')} aria-label="Close profile">×</button></div><div className="builder-profile-actions"><button className="secondary" onClick={() => toggleFavorite(profileDraft.id)}>{favorites.includes(profileDraft.id) ? '★ Favorite' : '☆ Add Favorite'}</button>{dayState?.assignments?.[profileDraft.id] ? <button className="secondary" onClick={() => removeBuildersFromSelectedDay([profileDraft.id])}>Remove Today</button> : <button className="primary" onClick={() => addBuildersToSelectedDay([profileDraft.id])}>Add to Today</button>}{profileDraft.isArchived ? <button className="primary" onClick={() => restoreBuilder(profileDraft.id)}>Restore</button> : <button className="danger-lite" onClick={() => archiveBuilder(profileDraft.id)}>Archive</button>}</div><section className="builder-profile-section"><h3>Identity</h3><div className="builder-form-grid"><label className="span-two">Name<input value={profileDraft.name || ''} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>Employee / Badge ID<input value={profileDraft.employeeId || ''} onChange={(event) => setProfileDraft((current) => ({ ...current, employeeId: event.target.value }))} /></label><label>Badge Type<select value={profileDraft.badgeType || 'day'} onChange={(event) => setProfileDraft((current) => ({ ...current, badgeType: event.target.value }))}><option value="day">Day</option><option value="night">Night</option><option value="green">Green</option></select></label><label>Start Date<input type="date" value={profileDraft.startDate || ''} onChange={(event) => setProfileDraft((current) => ({ ...current, startDate: event.target.value }))} /></label><label>Permanent State<input value={profileDraft.isArchived ? 'Archived' : 'Active'} disabled /></label></div></section><section className="builder-profile-section"><h3>Operational Defaults</h3><div className="builder-form-grid"><label>Default Shift<select value={profileDraft.defaultShift || ''} onChange={(event) => setProfileDraft((current) => ({ ...current, defaultShift: event.target.value }))}><option value="">None</option><option value="day">Day</option><option value="night">Night</option></select></label><label>Default Board<select value={profileDraft.defaultBoardId || ''} onChange={(event) => setProfileDraft((current) => ({ ...current, defaultBoardId: event.target.value }))}><option value="">None</option>{Object.entries(boardPresets || {}).map(([id, preset]) => <option key={id} value={id}>{preset.label}</option>)}</select></label><label>Default Area<select value={profileDraft.defaultArea || ''} onChange={(event) => setProfileDraft((current) => ({ ...current, defaultArea: event.target.value }))}><option value="">Unassigned</option>{(effectiveAreaDefs || []).filter((area) => area.name !== 'Unassigned').map((area) => <option key={area.name} value={area.name}>{area.name}</option>)}</select></label><label>Default Status<select value={profileDraft.defaultStatus || 'Present'} onChange={(event) => setProfileDraft((current) => ({ ...current, defaultStatus: event.target.value }))}>{STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}</select></label><label>Default Clock In<input type="time" value={profileDraft.defaultClockIn || ''} onChange={(event) => setProfileDraft((current) => ({ ...current, defaultClockIn: event.target.value }))} /></label><label>Default Clock Out<input type="time" value={profileDraft.defaultClockOut || ''} onChange={(event) => setProfileDraft((current) => ({ ...current, defaultClockOut: event.target.value }))} /></label></div></section><section className="builder-profile-section"><h3>Roles</h3><div className="builder-check-grid"><label><input type="checkbox" checked={!!profileDraft.isLineLead} onChange={(event) => setProfileDraft((current) => ({ ...current, isLineLead: event.target.checked }))} /> Line Lead</label><label><input type="checkbox" checked={!!profileDraft.countsAsProductionLabor} onChange={(event) => setProfileDraft((current) => ({ ...current, countsAsProductionLabor: event.target.checked }))} /> Counts as Production Labor</label><label><input type="checkbox" checked={!!profileDraft.isTrainer} onChange={(event) => setProfileDraft((current) => ({ ...current, isTrainer: event.target.checked }))} /> Trainer</label><label><input type="checkbox" checked={!!profileDraft.isSafetyMember} onChange={(event) => setProfileDraft((current) => ({ ...current, isSafetyMember: event.target.checked }))} /> Safety Member</label></div></section><section className="builder-profile-section"><h3>Skills & Certifications</h3><div className="builder-profile-skill-list">{skills.map((skill) => { const record = skillRecord(profileDraft, skill.id); const status = expirationState(record); return <div className={`builder-profile-skill ${status}`} key={skill.id}><label><input type="checkbox" checked={profileHasSkill(profileDraft, skill)} onChange={(event) => updateProfileSkill(skill, event.target.checked)} /><span><strong>{skill.name}</strong><small>{skill.category}{status === 'expired' ? ' · Expired' : status === 'expiring' ? ' · Expires soon' : ''}</small></span></label>{skill.expirationEnabled && profileHasSkill(profileDraft, skill) ? <div className="builder-skill-record-grid"><input type="date" value={record.certifiedDate || ''} onChange={(event) => updateSkillRecord(skill.id, { certifiedDate: event.target.value })} aria-label={`${skill.name} certified date`} /><input type="date" value={record.expirationDate || ''} onChange={(event) => updateSkillRecord(skill.id, { expirationDate: event.target.value })} aria-label={`${skill.name} expiration date`} /><input value={record.verifiedBy || ''} onChange={(event) => updateSkillRecord(skill.id, { verifiedBy: event.target.value })} placeholder="Verified by" /></div> : null}</div> })}</div></section><section className="builder-profile-section"><h3>Notes</h3><label>Admin Notes<textarea value={profileDraft.notes || ''} onChange={(event) => setProfileDraft((current) => ({ ...current, notes: event.target.value }))} /></label><label>Training Notes<textarea value={profileDraft.trainingNotes || ''} onChange={(event) => setProfileDraft((current) => ({ ...current, trainingNotes: event.target.value }))} /></label><label>Restrictions / Temporary Notes<textarea value={profileDraft.restrictions || ''} onChange={(event) => setProfileDraft((current) => ({ ...current, restrictions: event.target.value }))} /></label></section><section className="builder-profile-section"><h3>History</h3><div className="builder-health-grid compact"><div className="builder-health-card"><span>This Week</span><strong>{Number(weeklyHoursMap[profileDraft.id] || 0).toFixed(2)}h</strong></div><div className="builder-health-card"><span>Historical Assignments</span><strong>{findAssignmentsForBuilder(state, profileDraft.id).length}</strong></div><div className="builder-health-card"><span>Groups</span><strong>{groupMembershipNames(profileDraft.id).length}</strong></div><div className="builder-health-card"><span>Lists</span><strong>{listMembershipNames(profileDraft.id).length}</strong></div></div><div className="builder-history-list">{profileAudit.length ? profileAudit.map((row, index) => <div key={`${row.timestamp}-${index}`}><strong>{row.action}</strong><span>{row.timestamp} · {row.admin}</span><small>{row.oldValue || '—'} → {row.newValue || '—'}</small></div>) : <div className="builder-empty-state compact">No builder-specific audit entries yet.</div>}</div></section><div className="builder-drawer-footer"><button className="primary" onClick={saveProfile}>Save Profile</button>{profileDraft.isArchived ? <button className="danger-lite" onClick={() => permanentlyDeleteBuilder(profileDraft.id)}>Advanced Permanent Delete</button> : null}</div></aside></div> : null}

      {toast ? <div className="builder-toast" role="status"><span>{toast.message}</span>{toast.undo ? <button onClick={runUndo}>Undo</button> : null}<button aria-label="Dismiss notification" onClick={() => setToast(null)}>×</button></div> : null}
    </div>
  )
}
