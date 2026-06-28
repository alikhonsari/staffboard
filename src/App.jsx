
import React, { useEffect, useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { loadRemoteState, loadState, saveRemoteState, saveState as persistState } from './storageAdapter'
import { exportEndOfShiftExcel, exportWeeklyExcel } from './reporting'

const RACK_WEIGHT = 6.4
const SHIFT_START_HOUR = 8
const SHIFT_HOURS = 8
const SHIFT_END_MINUTE = 30
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

const AREA_DEFS = [
  { name: 'Unassigned' },
  { name: 'Rack Prep' },
  { name: 'OB1' },
  { name: 'OB2' },
  { name: 'Speed Lite', capacity: 8, note: '8 teams area' },
  { name: 'Speed Line 1', capacity: 8, note: 'Include feed the line role' },
  { name: 'Speed Line 2', capacity: 8, note: 'Include feed the line role' },
  { name: 'Speed Line 3', capacity: 8, note: 'Include feed the line role' },
  { name: 'Shipping' },
  { name: 'EOS Pull Racks' },
  { name: 'Projects' },
  { name: 'Learning' },
  { name: '1:1' },
  { name: 'Media Destruction' },
  { name: 'Network Rack Recovery' },
  { name: 'Network Rack Prep' },
]

const FA_LAB_AREA_DEFS = [
  { name: 'Unassigned' },
  { name: 'FA Intake' },
  { name: 'Diagnostics' },
  { name: 'Failure Analysis' },
  { name: 'Repair' },
  { name: 'QA / Audit' },
  { name: 'Shipping' },
  { name: 'Projects' },
  { name: 'Learning' },
  { name: '1:1' },
]

const BODEGA_AREA_DEFS = [
  { name: 'Unassigned' },
  { name: 'Inbound' },
  { name: 'Picking' },
  { name: 'Packing' },
  { name: 'Inventory' },
  { name: 'Staging' },
  { name: 'Shipping' },
  { name: 'Projects' },
  { name: 'Learning' },
  { name: '1:1' },
]

const BOARD_PRESETS = {
  speed_day: { label: 'SPEED · Day Shift', title: 'SPEED Staffing Board', shift: 'Day Shift', areaDefs: AREA_DEFS },
  speed_night: { label: 'SPEED · Night Shift', title: 'SPEED Staffing Board', shift: 'Night Shift', areaDefs: AREA_DEFS },
  fa_day: { label: 'FA Lab · Day Shift', title: 'FA Lab Staffing Board', shift: 'Day Shift', areaDefs: FA_LAB_AREA_DEFS },
  fa_night: { label: 'FA Lab · Night Shift', title: 'FA Lab Staffing Board', shift: 'Night Shift', areaDefs: FA_LAB_AREA_DEFS },
  bodega_day: { label: 'Bodega · Day Shift', title: 'Bodega Staffing Board', shift: 'Day Shift', areaDefs: BODEGA_AREA_DEFS },
  bodega_night: { label: 'Bodega · Night Shift', title: 'Bodega Staffing Board', shift: 'Night Shift', areaDefs: BODEGA_AREA_DEFS },
}

const BOARD_SCOPED_KEYS = ['boardTitle', 'boardShift', 'selectedDay', 'areaDefs', 'weeklyData', 'weeklyBoards', 'weeklyHistory', 'lockedWeeks', 'commentsBoard']

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function takeBoardScopedState(state) {
  const snapshot = {}
  BOARD_SCOPED_KEYS.forEach((key) => {
    snapshot[key] = clone(state[key])
  })
  return snapshot
}

function syncCurrentBoardStore(state) {
  const boardId = state.currentBoardId || 'speed_day'
  return {
    ...state,
    boardStore: {
      ...(state.boardStore || {}),
      [boardId]: takeBoardScopedState(state),
    },
  }
}

function blankWeekData() {
  return Object.fromEntries(WEEKDAYS.map((d) => [d, defaultDay()]))
}

const defaultDay = () => ({
  updatedAt: '',
  assignments: {},
  movementLog: [],
  attendanceLog: [],
  snapshots: { q1: null, q2: null, q3: null },
  opsMetrics: {
    targetRackMediaRecovery: '',
    racksProcessed: '',
    targetRackPrep: '',
    racksPrepped: '',
    recoveredRackPrep: '',
    totalMediaCount: '',
    mediaProcessed: '',
    manualHeadCount: '',
  },
  rackLists: {
    prepped: '',
    processed: '',
  },
})

const defaultState = {
  boardTitle: 'Weekly Staffing Board',
  weekStartDate: getMondayDate(),
  boardShift: 'Day Shift',
  currentBoardId: 'speed_day',
  boardStore: {},
  adminName: 'Ali',
  boardLead: '',
  selectedDay: 'Monday',
  updatedAt: '',
  builderPool: [],
  builderGroups: [],
  areaDefs: AREA_DEFS,
  weeklyData: Object.fromEntries(WEEKDAYS.map((d) => [d, defaultDay()])),
  weeklyBoards: {},
  weeklyHistory: {},
  lockedWeeks: {},
  commentsBoard: {
    safetyObservations: '',
    performanceShoutouts: '',
    concerns: '',
    builderVoice: '',
    suggestions: '',
  },
  storageConfig: {
    mode: 'spaces-auto',
    s3Bucket: '',
    s3Region: '',
    s3KeyPrefix: 'staffing-board/',
  },
  darkMode: false,
}

function toMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}
function getMondayDate() {
  return toMonday(new Date().toISOString().slice(0, 10))
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
function getIsoWeekInfo(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const target = new Date(d.valueOf())
  const dayNr = (d.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  const firstDayNr = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstDayNr + 3)
  const week = 1 + Math.round((target - firstThursday) / 604800000)
  return { year: target.getFullYear(), week }
}
function nowString() {
  return new Date().toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function nowIso() {
  return new Date().toISOString()
}
function timeNowHM() {
  return new Date().toTimeString().slice(0, 5)
}
function makeId() {
  return 'b-' + Math.random().toString(36).slice(2, 10)
}
function clean(v) {
  return String(v || '').replace(/[<>]/g, '').trim()
}
function numVal(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
function staffedStatuses() {
  return ['Present', 'Training', 'Indirect']
}
function blankAssignment() {
  return {
    status: 'Present',
    area: '',
    subArea: '',
    role: '',
    leaveTime: '',
    clockInTime: '',
    comment: '',
    builderNotes: '',
    createdAt: nowString(),
    updatedAt: nowString(),
    sessionStartIso: '',
    areaHistory: [],
  }
}

function blankBuilderProfile(id, name) {
  return {
    id,
    name,
    badgeType: 'day',
    trainedTdr: false,
    trainedForklift: false,
    trainedCenterRider: false,
    trainedClampTruck: false,
    isTrainer: false,
    isSafetyMember: false,
    isLineLead: false,
  }
}
function normalizeBuilderProfile(builder) {
  return {
    badgeType: 'day',
    trainedTdr: false,
    trainedForklift: false,
    trainedCenterRider: false,
    trainedClampTruck: false,
    isTrainer: false,
    isSafetyMember: false,
    isLineLead: false,
    ...builder,
  }
}
function badgeTypeClass(type) {
  if (type === 'night') return 'badge-night'
  if (type === 'green') return 'badge-green'
  return 'badge-day'
}
function builderFlags(builder) {
  const flags = []
  if (builder.trainedTdr) flags.push('TDR')
  if (builder.trainedForklift) flags.push('Forklift')
  if (builder.trainedCenterRider) flags.push('Center Rider')
  if (builder.trainedClampTruck) flags.push('Clamp Truck')
  if (builder.isTrainer) flags.push('Trainer')
  if (builder.isSafetyMember) flags.push('Safety')
  if (builder.isLineLead) flags.push('Line Lead')
  return flags
}
function statusClass(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'present') return 'present'
  if (s === 'pto' || s === 'vto') return s
  if (s === 'loa' || s === 'absent') return s
  return 'other'
}
function parseCSV(text) {
  const rows = []
  let row = []
  let cell = ''
  let i = 0
  let inQuotes = false
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue }
      if (ch === '"') { inQuotes = false; i += 1; continue }
      cell += ch
      i += 1
      continue
    }
    if (ch === '"') { inQuotes = true; i += 1; continue }
    if (ch === ',') { row.push(cell); cell = ''; i += 1; continue }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i += 1; continue }
    if (ch === '\r') { i += 1; continue }
    cell += ch
    i += 1
  }
  row.push(cell)
  if (row.length > 1 || row[0] !== '') rows.push(row)
  return rows
}
function toCSV(rows) {
  return rows.map((row) => row.map((value) => {
    const s = String(value ?? '')
    return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s
  }).join(',')).join('\n')
}
function downloadText(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
function parseRackList(text) {
  return String(text || '')
    .split(/\r?\n|,|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/)
      return { id: parts[0] || '', materialType: parts.slice(1).join(' ') || 'Unspecified', raw: line }
    })
}

function normalizeState(saved) {
  const state = { ...defaultState, ...saved }
  state.builderPool = Array.isArray(saved?.builderPool) ? saved.builderPool.map(normalizeBuilderProfile) : []
  state.builderGroups = Array.isArray(saved?.builderGroups) ? saved.builderGroups : []
  state.currentBoardId = BOARD_PRESETS[saved?.currentBoardId] ? saved.currentBoardId : 'speed_day'
  state.boardStore = saved?.boardStore && typeof saved.boardStore === 'object' ? saved.boardStore : {}
  const activePreset = BOARD_PRESETS[state.currentBoardId] || BOARD_PRESETS.speed_day
  state.boardTitle = saved?.boardTitle || activePreset.title
  state.boardShift = saved?.boardShift || activePreset.shift
  state.areaDefs = Array.isArray(saved?.areaDefs) && saved?.areaDefs.length ? saved.areaDefs : activePreset.areaDefs
  state.weekStartDate = typeof toMonday === 'function' ? toMonday(saved?.weekStartDate || defaultState.weekStartDate) : (saved?.weekStartDate || defaultState.weekStartDate)
  state.selectedDay = WEEKDAYS.includes(saved?.selectedDay) ? saved.selectedDay : 'Monday'

  const rawHistory = saved?.weeklyHistory && typeof saved.weeklyHistory === 'object' ? saved.weeklyHistory : {}
  const normalizedHistory = {}
  Object.entries(rawHistory).forEach(([k, v]) => {
    normalizedHistory[typeof toMonday === 'function' ? toMonday(k) : k] = v
  })
  state.weeklyHistory = normalizedHistory

  state.lockedWeeks = saved?.lockedWeeks && typeof saved.lockedWeeks === 'object' ? saved.lockedWeeks : {}
  state.commentsBoard = { ...defaultState.commentsBoard, ...(saved?.commentsBoard || {}) }

  const normalizeWeekData = (weekData) => Object.fromEntries(
    WEEKDAYS.map((day) => {
      const s = weekData?.[day] || {}
      return [day, {
        ...defaultDay(),
        ...s,
        assignments: s.assignments || {},
        movementLog: s.movementLog || [],
        attendanceLog: s.attendanceLog || [],
        snapshots: { q1: null, q2: null, q3: null, ...(s.snapshots || {}) },
        opsMetrics: { ...defaultDay().opsMetrics, ...(s.opsMetrics || {}) },
        rackLists: { ...defaultDay().rackLists, ...(s.rackLists || {}) },
      }]
    })
  )

  state.weeklyData = normalizeWeekData(saved?.weeklyData || {})

  const rawBoards = saved?.weeklyBoards && typeof saved.weeklyBoards === 'object'
    ? saved.weeklyBoards
    : { [state.weekStartDate]: saved?.weeklyData || {} }

  const normalizedBoards = {}
  Object.entries(rawBoards).forEach(([k, v]) => {
    normalizedBoards[typeof toMonday === 'function' ? toMonday(k) : k] = normalizeWeekData(v || {})
  })
  normalizedBoards[state.weekStartDate] = normalizeWeekData(saved?.weeklyData || normalizedBoards[state.weekStartDate] || {})
  state.weeklyBoards = normalizedBoards

  state.storageConfig = { ...defaultState.storageConfig, ...(saved?.storageConfig || {}) }
  return state
}
function parseTimeToHours(hm) {
  if (!hm || !/^\d{2}:\d{2}$/.test(hm)) return null
  const [h, m] = hm.split(':').map(Number)
  return h + m / 60
}
function isNightShiftLabel(label) {
  return String(label || '').toLowerCase().includes('night')
}
function shiftStartForDay(dayName, weekStartDate, boardShift = 'Day Shift') {
  const monday = new Date(weekStartDate + 'T00:00:00')
  const idx = WEEKDAYS.indexOf(dayName)
  const d = new Date(monday)
  d.setDate(monday.getDate() + idx)
  if (isNightShiftLabel(boardShift)) d.setHours(20, 0, 0, 0)
  else d.setHours(SHIFT_START_HOUR, 0, 0, 0)
  return d
}
function shiftEndForDay(dayName, weekStartDate, boardShift = 'Day Shift') {
  const d = shiftStartForDay(dayName, weekStartDate, boardShift)
  if (isNightShiftLabel(boardShift)) {
    d.setDate(d.getDate() + 1)
    d.setHours(4, SHIFT_END_MINUTE, 0, 0)
  } else {
    d.setHours(16, SHIFT_END_MINUTE, 0, 0)
  }
  return d
}
function isoToHours(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.getHours() + d.getMinutes() / 60
}
function computeHoursForAssignment(assignment, dayName, weekStartDate) {
  const hist = Array.isArray(assignment.areaHistory) ? assignment.areaHistory : []
  const totals = {}
  hist.forEach((session) => {
    if (!session?.area || session.area === 'Unassigned') return
    const startHours = isoToHours(session.startIso)
    const endHours = session.endIso ? isoToHours(session.endIso) : 16.5
    if (startHours == null || endHours == null) return
    const hours = Math.max(0, endHours - startHours)
    totals[session.area] = (totals[session.area] || 0) + hours
  })
  if (!hist.length) {
    const area = assignment.area || ''
    if (area && area !== 'Unassigned' && staffedStatuses().includes(assignment.status || 'Present')) {
      const startHours = parseTimeToHours(assignment.clockInTime) ?? SHIFT_START_HOUR
      const endHours = parseTimeToHours(assignment.leaveTime) ?? 16.5
      totals[area] = Math.max(0, endHours - startHours)
    }
  }
  return totals
}
function sumWeeklyBuilderHours(state) {
  const rows = []
  state.builderPool.forEach((builder) => {
    const byArea = {}
    WEEKDAYS.forEach((day) => {
      const assignment = state.weeklyData?.[day]?.assignments?.[builder.id]
      if (!assignment) return
      const totals = computeHoursForAssignment(assignment, day, state.weekStartDate)
      Object.entries(totals).forEach(([area, hours]) => {
        byArea[area] = (byArea[area] || 0) + hours
      })
    })
    Object.entries(byArea).forEach(([area, hours]) => {
      rows.push({ builder: builder.name, area, hours: Number(hours.toFixed(2)) })
    })
  })
  return rows
}
function closeOpenSession(assignment, closeIso) {
  const hist = Array.isArray(assignment.areaHistory) ? [...assignment.areaHistory] : []
  if (!hist.length) return hist
  const last = hist[hist.length - 1]
  if (last && !last.endIso) hist[hist.length - 1] = { ...last, endIso: closeIso }
  return hist
}
function syncAreaSession(before, after, timestampIso) {
  const prevArea = (before.area || 'Unassigned')
  const nextArea = (after.area || 'Unassigned')
  const prevStaffed = staffedStatuses().includes(before.status || 'Present') && prevArea !== 'Unassigned'
  const nextStaffed = staffedStatuses().includes(after.status || 'Present') && nextArea !== 'Unassigned'
  let hist = Array.isArray(before.areaHistory) ? [...before.areaHistory] : []

  if (prevStaffed && (!nextStaffed || prevArea !== nextArea)) {
    hist = closeOpenSession({ areaHistory: hist }, timestampIso)
  }
  if (nextStaffed && (!prevStaffed || prevArea !== nextArea)) {
    hist.push({ area: nextArea, startIso: timestampIso, endIso: '' })
  }
  return hist
}


function safePctChange(current, previous) {
  const c = Number(current || 0)
  const p = Number(previous || 0)
  if (p === 0) return c === 0 ? 0 : 100
  return ((c - p) / p) * 100
}
function trendArrow(value) {
  return value > 0 ? '▲' : value < 0 ? '▼' : '•'
}
function metricStatusClass(value, good = 100, warn = 80) {
  if (value >= good) return 'status-good'
  if (value >= warn) return 'status-warn'
  return 'status-bad'
}

function buildWeekSnapshotFromState(state) {
  const snapshot = {
    weekStartDate: state.weekStartDate,
    generatedAt: nowString(),
    totals: {
      recoveryProcessed: 0,
      rackPrepDone: 0,
      totalMediaCount: 0,
      mediaProcessed: 0,
      staffedHours: 0,
    },
    byDay: [],
    areaHours: {},
  }

  WEEKDAYS.forEach((day) => {
    const dayState = state.weeklyData?.[day] || defaultDay()
    const ops = dayState.opsMetrics || {}
    const recoveryProcessed = numVal(ops.racksProcessed)
    const rackPrepDone = numVal(ops.racksPrepped) + numVal(ops.recoveredRackPrep)
    const totalMediaCount = numVal(ops.totalMediaCount)
    const mediaProcessed = numVal(ops.mediaProcessed)
    let staffedHours = 0

    ;(state.builderPool || []).forEach((builder) => {
      const assignment = dayState.assignments?.[builder.id]
      if (!assignment) return
      const totals = computeHoursForAssignment(assignment, day, state.weekStartDate)
      Object.entries(totals).forEach(([area, hours]) => {
        snapshot.areaHours[area] = (snapshot.areaHours[area] || 0) + hours
        staffedHours += hours
      })
    })

    snapshot.totals.recoveryProcessed += recoveryProcessed
    snapshot.totals.rackPrepDone += rackPrepDone
    snapshot.totals.totalMediaCount += totalMediaCount
    snapshot.totals.mediaProcessed += mediaProcessed
    snapshot.totals.staffedHours += staffedHours

    snapshot.byDay.push({
      day,
      recoveryProcessed,
      rackPrepDone,
      totalMediaCount,
      mediaProcessed,
      staffedHours: Number(staffedHours.toFixed(2)),
    })
  })

  Object.keys(snapshot.areaHours).forEach((k) => {
    snapshot.areaHours[k] = Number(snapshot.areaHours[k].toFixed(2))
  })
  snapshot.totals.staffedHours = Number(snapshot.totals.staffedHours.toFixed(2))
  return snapshot
}


function hasSnapshotData(snapshot) {
  if (!snapshot) return false
  const totals = snapshot.totals || {}
  if (Number(totals.recoveryProcessed || 0) > 0) return true
  if (Number(totals.rackPrepDone || 0) > 0) return true
  if (Number(totals.totalMediaCount || 0) > 0) return true
  if (Number(totals.mediaProcessed || 0) > 0) return true
  if (Number(totals.staffedHours || 0) > 0) return true
  return false
}

function applyWeekHistory(state) {
  const mondayKey = toMonday(state.weekStartDate)
  const current = buildWeekSnapshotFromState({ ...state, weekStartDate: mondayKey })
  const history = { ...(state.weeklyHistory || {}) }
  if (hasSnapshotData(current)) {
    history[mondayKey] = current
  }
  const keys = Object.keys(history).sort((a, b) => b.localeCompare(a)).slice(0, 4)
  const trimmed = {}
  keys.forEach((k) => { trimmed[k] = history[k] })
  return { ...state, weeklyHistory: trimmed }
}

function BarChartCard({ title, subtitle, data, format = (v) => String(v), tone = 'blue' }) {
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0))
  return (
    <div className="summary-card-block card">
      <div className="table-title-row">
        <div>
          <div className="table-kicker">{title}</div>
          <div className="small">{subtitle}</div>
        </div>
      </div>
      <div className="chart-list">
        {data.length ? data.map((item) => (
          <div className="chart-row" key={item.label}>
            <div className="chart-label">{item.label}</div>
            <div className="chart-bar-wrap">
              <div className={`chart-bar tone-${tone}`} style={{ width: `${Math.max(4, (Number(item.value) || 0) / max * 100)}%` }} />
            </div>
            <div className="chart-value">{format(item.value)}</div>
          </div>
        )) : <div className="small">No data yet.</div>}
      </div>
    </div>
  )
}

function SimpleBarChart({ title, subtitle = '', data = [], format = (v) => String(v), tone = 'blue' }) {
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0))
  return (
    <div className="pdf-chart-card">
      <div className="pdf-chart-title">{title}</div>
      {subtitle ? <div className="pdf-chart-subtitle">{subtitle}</div> : null}
      <div className="pdf-chart-list">
        {data.map((item) => (
          <div className="pdf-chart-row" key={item.label}>
            <div className="pdf-chart-label">{item.label}</div>
            <div className="pdf-chart-track">
              <div className={`pdf-chart-fill tone-${tone}`} style={{ width: `${Math.max(4, ((Number(item.value) || 0) / max) * 100)}%` }} />
            </div>
            <div className="pdf-chart-value">{format(item.value)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StaffBoardApp({ user, onLogout }) {
  const [state, setState] = useState(() => normalizeState(loadState(defaultState)))
  const [selectedBuilderId, setSelectedBuilderId] = useState('')
  const [selectedPoolBuilderId, setSelectedPoolBuilderId] = useState('')
  const [draggedBuilderId, setDraggedBuilderId] = useState(null)
  const [newAreaName, setNewAreaName] = useState('')
  const [builderListFilter, setBuilderListFilter] = useState('')
  const [mainTab, setMainTab] = useState('board')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [newGroupName, setNewGroupName] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [historyWeekChoice, setHistoryWeekChoice] = useState('')
  const [tick, setTick] = useState(Date.now())
  const [syncStatus, setSyncStatus] = useState('Loading...')
  const captureRef = useRef(null)
  const analysisCaptureRef = useRef(null)
  const tphCaptureRef = useRef(null)
  const dailyPdfRef = useRef(null)
  const weeklyPdfRef = useRef(null)

  const dayState = state.weeklyData[state.selectedDay] || defaultDay()
  const preppedRackRows = parseRackList(dayState.rackLists?.prepped)
  const processedRackRows = parseRackList(dayState.rackLists?.processed)
  const activeBuilders = state.builderPool.filter((b) => dayState.assignments[b.id])
  const weekInfo = getIsoWeekInfo(state.weekStartDate)
  const availableWeeks = Array.from(new Set([
    ...Object.entries(state.weeklyBoards || {})
      .filter(([, weekData]) => hasSnapshotData(buildWeekSnapshotFromState({ ...state, weeklyData: weekData, weekStartDate: '2000-01-03' })))
      .map(([k]) => toMonday(k)),
    ...Object.keys(state.weeklyHistory || {}).map(toMonday),
    ...(hasSnapshotData(buildWeekSnapshotFromState(state)) ? [toMonday(state.weekStartDate)] : []),
  ])).sort((a, b) => b.localeCompare(a))

  const switchToWeek = (targetWeek) => {
    if (!targetWeek) return
    const mondayTarget = toMonday(targetWeek)
    setState((prev) => {
      const currentWeekKey = toMonday(prev.weekStartDate)
      const allBoards = {
        ...(prev.weeklyBoards || {}),
        [currentWeekKey]: prev.weeklyData,
      }
      const snapPrev = applyWeekHistory({
        ...prev,
        weeklyBoards: allBoards,
      })
      const storedWeek = allBoards[mondayTarget]
      const targetWeekData = storedWeek
        ? JSON.parse(JSON.stringify(storedWeek))
        : Object.fromEntries(WEEKDAYS.map((d) => [d, defaultDay()]))

      return {
        ...snapPrev,
        weeklyBoards: allBoards,
        weekStartDate: mondayTarget,
        weeklyData: targetWeekData,
        selectedDay: 'Monday',
        updatedAt: nowString(),
      }
    })
  }

  const goToWeek = (offsetWeeks) => {
    switchToWeek(addDays(toMonday(state.weekStartDate), offsetWeeks * 7))
  }

  const switchBoard = (boardId) => {
    if (!BOARD_PRESETS[boardId] || boardId === state.currentBoardId) return
    setState((prev) => {
      const currentBoardId = prev.currentBoardId || 'speed_day'
      const nextStore = {
        ...(prev.boardStore || {}),
        [currentBoardId]: takeBoardScopedState(prev),
      }
      const preset = BOARD_PRESETS[boardId] || BOARD_PRESETS.speed_day
      const stored = nextStore[boardId] || {}
      return normalizeState({
        ...prev,
        ...stored,
        currentBoardId: boardId,
        boardStore: nextStore,
        boardTitle: stored.boardTitle || preset.title,
        boardShift: stored.boardShift || preset.shift,
        areaDefs: stored.areaDefs || preset.areaDefs,
        selectedDay: stored.selectedDay || prev.selectedDay || 'Monday',
        weekStartDate: stored.weekStartDate || prev.weekStartDate,
        weeklyData: stored.weeklyData || blankWeekData(),
        weeklyBoards: stored.weeklyBoards || {},
        weeklyHistory: stored.weeklyHistory || {},
        lockedWeeks: stored.lockedWeeks || {},
        commentsBoard: stored.commentsBoard || defaultState.commentsBoard,
      })
    })
  }

  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const remote = await loadRemoteState(defaultState)
        setState((prev) => normalizeState({ ...prev, ...remote }))
        setSyncStatus('Synced')
      } catch {
        setSyncStatus('Offline fallback')
      }
    })()
  }, [])

  useEffect(() => {
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
  }, [state])

  useEffect(() => {
    document.body.dataset.theme = state.darkMode ? 'dark' : 'light'
  }, [state.darkMode])

  useEffect(() => {
    if (!selectedPoolBuilderId && state.builderPool[0]) setSelectedPoolBuilderId(state.builderPool[0].id)
    if (selectedPoolBuilderId && !state.builderPool.find((b) => b.id === selectedPoolBuilderId)) {
      setSelectedPoolBuilderId(state.builderPool[0]?.id || '')
    }
  }, [state.builderPool, selectedPoolBuilderId])

  useEffect(() => {
    if (!selectedBuilderId && activeBuilders[0]) setSelectedBuilderId(activeBuilders[0].id)
    if (selectedBuilderId && !activeBuilders.find((b) => b.id === selectedBuilderId)) {
      setSelectedBuilderId(activeBuilders[0]?.id || '')
    }
  }, [activeBuilders, selectedBuilderId])

  useEffect(() => {
    if (!selectedGroupId && state.builderGroups[0]) setSelectedGroupId(state.builderGroups[0].id)
    if (selectedGroupId && !state.builderGroups.find((g) => g.id === selectedGroupId)) {
      setSelectedGroupId(state.builderGroups[0]?.id || '')
    }
  }, [state.builderGroups, selectedGroupId])

  const getAssignment = (builderId) => dayState.assignments[builderId] || blankAssignment()

  const saveState = (updater) => {
    setState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      const currentWeekKey = toMonday(prev.weekStartDate)
      const isLocked = !!prev.lockedWeeks?.[currentWeekKey]
      const weeklyChanged = JSON.stringify(next.weeklyData) !== JSON.stringify(prev.weeklyData)
      if (isLocked && weeklyChanged) {
        alert('This week is locked. Unlock it before editing.')
        return prev
      }
      const withBoards = {
        ...next,
        weeklyBoards: {
          ...(prev.weeklyBoards || {}),
          ...(next.weeklyBoards || {}),
          [currentWeekKey]: next.weeklyData,
        },
        updatedAt: nowString(),
      }
      return syncCurrentBoardStore(applyWeekHistory(withBoards))
    })
  }

  const updateDay = (updater) => {
    saveState((prev) => {
      const current = prev.weeklyData[prev.selectedDay] || defaultDay()
      const nextDay = typeof updater === 'function' ? updater(current) : updater
      return {
        ...prev,
        weeklyData: {
          ...prev.weeklyData,
          [prev.selectedDay]: { ...nextDay, updatedAt: nowString() },
        },
      }
    })
  }

    const updateBuilderAssignment = (builderId, patch) => {
    if (!builderId) return
    updateDay((prev) => {
      const currentAssignment = prev.assignments?.[builderId] || blankAssignment()
      const builder = state.builderPool.find((b) => b.id === builderId) || activeBuilders.find((b) => b.id === builderId) || { name: builderId }
      const timestamp = nowString()
      const currentStatus = currentAssignment.status || 'Present'
      const currentArea = currentAssignment.area || 'Unassigned'
      const nextAssignment = {
        ...currentAssignment,
        ...patch,
        updatedAt: timestamp,
      }
      const nextStatus = nextAssignment.status || 'Present'
      const nextArea = nextAssignment.area || 'Unassigned'

      let movementLog = Array.isArray(prev.movementLog) ? [...prev.movementLog] : []

      if (patch.area !== undefined && nextArea !== currentArea) {
        const history = Array.isArray(currentAssignment.areaHistory) ? currentAssignment.areaHistory : []
        nextAssignment.areaHistory = [
          ...history,
          { from: currentArea, to: nextArea, at: timestamp },
        ]
        movementLog.unshift({
          timestamp,
          builder: builder.name,
          from: `${currentArea} / ${currentStatus}`,
          to: `${nextArea} / ${nextStatus}`,
          note: `Area changed from ${currentArea} to ${nextArea}`,
        })
      } else {
        nextAssignment.areaHistory = Array.isArray(currentAssignment.areaHistory) ? currentAssignment.areaHistory : []
      }

      if (patch.status !== undefined && nextStatus !== currentStatus) {
        movementLog.unshift({
          timestamp,
          builder: builder.name,
          from: `${nextArea} / ${currentStatus}`,
          to: `${nextArea} / ${nextStatus}`,
          note: `Status changed from ${currentStatus} to ${nextStatus}`,
        })
      }

      if (patch.clockInTime !== undefined && patch.clockInTime && !currentAssignment.sessionStartIso) {
        nextAssignment.sessionStartIso = timestamp
      }

      return {
        ...prev,
        movementLog,
        assignments: {
          ...(prev.assignments || {}),
          [builderId]: nextAssignment,
        },
      }
    })
  }


  const saveCurrentWeekSnapshot = () => {
    setState((prev) => {
      const mondayKey = toMonday(prev.weekStartDate)
      const snapshot = buildWeekSnapshotFromState({ ...prev, weekStartDate: mondayKey })
      if (!hasSnapshotData(snapshot)) {
        alert('This week has no data yet to save.')
        return prev
      }
      const history = { ...(prev.weeklyHistory || {}), [mondayKey]: snapshot }
      const keys = Object.keys(history).sort((a, b) => b.localeCompare(a)).slice(0, 4)
      const trimmed = {}
      keys.forEach((k) => { trimmed[k] = history[k] })
      return {
        ...prev,
        weeklyHistory: trimmed,
        updatedAt: nowString(),
      }
    })
  }


  const toggleWeekLock = () => {
    saveState((prev) => ({
      ...prev,
      lockedWeeks: {
        ...(prev.lockedWeeks || {}),
        [prev.weekStartDate]: !prev.lockedWeeks?.[prev.weekStartDate],
      },
    }))
  }

  const recordAttendanceEvent = (builderId, event, note = '') => {
    const builder = state.builderPool.find((b) => b.id === builderId)
    if (!builder) return
    updateDay((prev) => ({
      ...prev,
      attendanceLog: [{
        timestamp: nowString(),
        clock_time: timeNowHM(),
        builder: builder.name,
        event,
        note,
      }, ...(prev.attendanceLog || [])].slice(0, 1000),
    }))
  }

  const logMovement = (builderId, before, after, source = 'edit') => {
    const builder = state.builderPool.find((b) => b.id === builderId)
    if (!builder) return
    const changed = JSON.stringify({
      area: before.area, status: before.status, subArea: before.subArea, role: before.role,
      leaveTime: before.leaveTime, clockInTime: before.clockInTime, comment: before.comment, builderNotes: before.builderNotes,
    }) !== JSON.stringify({
      area: after.area, status: after.status, subArea: after.subArea, role: after.role,
      leaveTime: after.leaveTime, clockInTime: after.clockInTime, comment: after.comment, builderNotes: after.builderNotes,
    })
    if (!changed) return

    updateDay((prev) => ({
      ...prev,
      movementLog: [{
        timestamp: nowString(),
        builder: builder.name,
        fromArea: before.area || 'Unassigned',
        toArea: after.area || 'Unassigned',
        fromStatus: before.status || 'Present',
        toStatus: after.status || 'Present',
        notes: source,
      }, ...(prev.movementLog || [])].slice(0, 500),
    }))
  }

  const addPoolBuilder = () => {
    const input = document.getElementById('newBuilderName')
    const name = clean(input?.value)
    if (!name) return alert('Enter a builder name.')
    if (state.builderPool.some((b) => b.name.toLowerCase() === name.toLowerCase())) return alert('Builder already exists in master list.')
    const id = makeId()
    saveState((prev) => ({ ...prev, builderPool: [...prev.builderPool, blankBuilderProfile(id, name)] }))
    if (input) input.value = ''
    setSelectedPoolBuilderId(id)
  }

  const updatePoolBuilder = (builderId, patch) => {
    if (!builderId) return
    saveState((prev) => ({
      ...prev,
      builderPool: prev.builderPool.map((b) => b.id === builderId ? normalizeBuilderProfile({ ...b, ...patch }) : b),
    }))
  }

  const renamePoolBuilder = (builderId, name) => {
    const cleanName = clean(name)
    if (!builderId || !cleanName) return
    saveState((prev) => ({
      ...prev,
      builderPool: prev.builderPool.map((b) => b.id === builderId ? normalizeBuilderProfile({ ...b, name: cleanName }) : b),
    }))
  }

  const removePoolBuilder = (builderId) => {
    const builder = state.builderPool.find((b) => b.id === builderId)
    if (!builder) return
    if (!confirm(`Remove ${builder.name} from the permanent master list and all weekly days?`)) return
    saveState((prev) => {
      const nextWeekly = { ...prev.weeklyData }
      WEEKDAYS.forEach((day) => {
        const dayData = nextWeekly[day] || defaultDay()
        const assignments = { ...dayData.assignments }
        delete assignments[builderId]
        nextWeekly[day] = { ...dayData, assignments }
      })
      return {
        ...prev,
        builderPool: prev.builderPool.filter((b) => b.id !== builderId),
        weeklyData: nextWeekly,
      }
    })
    if (selectedPoolBuilderId === builderId) setSelectedPoolBuilderId('')
    if (selectedBuilderId === builderId) setSelectedBuilderId('')
  }

  const addGroup = () => {
    const name = clean(newGroupName)
    if (!name) return alert('Enter a group name.')
    if (state.builderGroups.some((g) => g.name.toLowerCase() === name.toLowerCase())) return alert('Group already exists.')
    const id = makeId()
    saveState((prev) => ({
      ...prev,
      builderGroups: [...(prev.builderGroups || []), { id, name, builderIds: [] }],
    }))
    setNewGroupName('')
    setSelectedGroupId(id)
  }

  const renameGroup = (groupId, name) => {
    const groupName = clean(name)
    if (!groupId || !groupName) return
    saveState((prev) => ({
      ...prev,
      builderGroups: (prev.builderGroups || []).map((g) => g.id === groupId ? { ...g, name: groupName } : g),
    }))
  }

  const deleteGroup = (groupId) => {
    const group = state.builderGroups.find((g) => g.id === groupId)
    if (!group) return
    if (!confirm(`Delete group "${group.name}"?`)) return
    saveState((prev) => ({
      ...prev,
      builderGroups: (prev.builderGroups || []).filter((g) => g.id !== groupId),
    }))
    if (selectedGroupId === groupId) setSelectedGroupId('')
  }

  const toggleBuilderInGroup = (groupId, builderId) => {
    if (!groupId || !builderId) return
    saveState((prev) => ({
      ...prev,
      builderGroups: (prev.builderGroups || []).map((g) => {
        if (g.id !== groupId) return g
        const ids = new Set(g.builderIds || [])
        if (ids.has(builderId)) ids.delete(builderId)
        else ids.add(builderId)
        return { ...g, builderIds: Array.from(ids) }
      }),
    }))
  }

  const addGroupToDay = (groupId) => {
    const group = state.builderGroups.find((g) => g.id === groupId)
    if (!group) return
    updateDay((prev) => {
      const assignments = { ...prev.assignments }
      ;(group.builderIds || []).forEach((id) => {
        if (!assignments[id]) assignments[id] = blankAssignment()
      })
      return { ...prev, assignments }
    })
  }

  const addArea = () => {
    const name = clean(newAreaName)
    if (!name) return alert('Enter an area name.')
    if (name.toLowerCase() === 'unassigned') return alert('Unassigned already exists.')
    if (effectiveAreaDefs.some((a) => a.name.toLowerCase() === name.toLowerCase())) return alert('Area already exists.')
    saveState((prev) => ({
      ...prev,
      areaDefs: [...(prev.areaDefs || AREA_DEFS), { name, capacity: '', note: '' }],
    }))
    setNewAreaName('')
  }

  const deleteArea = (areaName) => {
    if (!areaName || areaName === 'Unassigned') return
    if (!confirm(`Delete area "${areaName}"? Anyone in it will move to Unassigned.`)) return
    saveState((prev) => {
      const nextWeekly = { ...prev.weeklyData }
      WEEKDAYS.forEach((day) => {
        const dayData = nextWeekly[day] || defaultDay()
        const nextAssignments = { ...dayData.assignments }
        Object.keys(nextAssignments).forEach((id) => {
          if ((nextAssignments[id].area || '') === areaName) {
            nextAssignments[id] = { ...nextAssignments[id], area: '', updatedAt: nowString() }
          }
        })
        nextWeekly[day] = { ...dayData, assignments: nextAssignments }
      })
      return {
        ...prev,
        areaDefs: (prev.areaDefs || AREA_DEFS).filter((a) => a.name !== areaName),
        weeklyData: nextWeekly,
      }
    })
  }

  const activateBuilderForDay = (builderId) => {
    const exists = dayState.assignments[builderId]
    if (exists) {
      setSelectedBuilderId(builderId)
      return
    }
    updateDay((prev) => ({
      ...prev,
      assignments: { ...prev.assignments, [builderId]: blankAssignment() },
    }))
    setSelectedBuilderId(builderId)
  }

  const removeBuilderFromDay = () => {
    if (!selectedBuilderId) return
    const builder = state.builderPool.find((b) => b.id === selectedBuilderId)
    if (!builder) return
    if (!confirm(`Remove ${builder.name} from ${state.selectedDay}?`)) return
    updateDay((prev) => {
      const assignments = { ...prev.assignments }
      delete assignments[selectedBuilderId]
      return { ...prev, assignments }
    })
    setSelectedBuilderId('')
  }

  const onSaveBuilder = (patch) => {
    if (!selectedBuilderId) return
    const before = getAssignment(selectedBuilderId)
    const ts = nowIso()
    const nextDraft = { ...before, ...patch, updatedAt: nowString() }
    const next = {
      ...nextDraft,
      areaHistory: syncAreaSession(before, nextDraft, ts),
      sessionStartIso: patch.clockInTime && !before.sessionStartIso ? ts : (before.sessionStartIso || ''),
    }
    updateDay((prev) => ({
      ...prev,
      assignments: { ...prev.assignments, [selectedBuilderId]: next },
    }))
    logMovement(selectedBuilderId, before, next, 'edit')
  }

  const moveBuilderBetweenAreas = (builderId, nextArea) => {
    const before = getAssignment(builderId)
    const ts = nowIso()
    const nextDraft = {
      ...before,
      area: nextArea === 'Unassigned' ? '' : nextArea,
      status: ['PTO', 'LOA', 'VTO', 'Absent'].includes(before.status) ? 'Present' : (before.status || 'Present'),
      updatedAt: nowString(),
    }
    const next = { ...nextDraft, areaHistory: syncAreaSession(before, nextDraft, ts) }
    updateDay((prev) => ({
      ...prev,
      assignments: { ...prev.assignments, [builderId]: next },
    }))
    logMovement(builderId, before, next, 'drag')
  }

  const captureSnapshot = (key, label) => {
    const byArea = areaCounts.map((a) => ({ area: a.name, count: a.count }))
    const totals = { ...counts }
    updateDay((prev) => ({ ...prev, snapshots: { ...prev.snapshots, [key]: { label, capturedAt: nowString(), totals, byArea } } }))
  }

  const resetWeek = () => {
    if (!confirm('Reset the full weekly staffing board?')) return
    const cleaned = {
      ...defaultState,
      builderPool: state.builderPool,
      storageConfig: state.storageConfig,
      darkMode: state.darkMode,
    }
    setState(cleaned)
    setSelectedBuilderId('')
  }

  const importRosterCsv = async (file) => {
    const rows = parseCSV(await file.text())
    if (!rows.length) return
    const header = rows[0].map((x) => clean(x).toLowerCase())
    const idx = {
      name: header.indexOf('name'),
      badgeType: header.indexOf('badgetype'),
      trainedTdr: header.indexOf('trainedtdr'),
      trainedForklift: header.indexOf('trainedforklift'),
      trainedCenterRider: header.indexOf('trainedcenterrider'),
      trainedClampTruck: header.indexOf('trainedclamptruck'),
      isTrainer: header.indexOf('istrainer'),
      isSafetyMember: header.indexOf('issafetymember'),
      isLineLead: header.indexOf('islinelead'),
    }
    if (idx.name < 0) return alert('Roster CSV must include a name column.')
    const toBool = (val) => ['1','true','yes','y'].includes(String(val || '').trim().toLowerCase())
    saveState((prev) => {
      const builderPool = [...prev.builderPool]
      rows.slice(1).forEach((r) => {
        const name = clean(r[idx.name])
        if (!name || builderPool.some((b) => b.name.toLowerCase() == name.toLowerCase())) return
        builderPool.push(normalizeBuilderProfile({
          id: makeId(),
          name,
          badgeType: idx.badgeType >= 0 ? clean(r[idx.badgeType]).toLowerCase() || 'day' : 'day',
          trainedTdr: idx.trainedTdr >= 0 ? toBool(r[idx.trainedTdr]) : false,
          trainedForklift: idx.trainedForklift >= 0 ? toBool(r[idx.trainedForklift]) : false,
          trainedCenterRider: idx.trainedCenterRider >= 0 ? toBool(r[idx.trainedCenterRider]) : false,
          trainedClampTruck: idx.trainedClampTruck >= 0 ? toBool(r[idx.trainedClampTruck]) : false,
          isTrainer: idx.isTrainer >= 0 ? toBool(r[idx.isTrainer]) : false,
          isSafetyMember: idx.isSafetyMember >= 0 ? toBool(r[idx.isSafetyMember]) : false,
          isLineLead: idx.isLineLead >= 0 ? toBool(r[idx.isLineLead]) : false,
        }))
      })
      return { ...prev, builderPool }
    })
  }

  const exportRosterCsv = () => downloadText(
    'staffing-master-roster.csv',
    toCSV([['name','badgeType','trainedTdr','trainedForklift','trainedCenterRider','trainedClampTruck','isTrainer','isSafetyMember','isLineLead'], ...state.builderPool.map((b) => [b.name, b.badgeType || 'day', b.trainedTdr, b.trainedForklift, b.trainedCenterRider, b.trainedClampTruck, b.isTrainer, b.isSafetyMember, b.isLineLead])]),
    'text/csv;charset=utf-8'
  )

  const exportDayAssignmentsCsv = () => downloadText(
    `staffing-assignments-${state.selectedDay}.csv`,
    toCSV([
      ['builder_name', 'status', 'area', 'clock_in_time', 'sub_area', 'role', 'leave_time', 'comment', 'builder_notes'],
      ...activeBuilders.map((b) => {
        const a = getAssignment(b.id)
        return [b.name, a.status || 'Present', a.area || 'Unassigned', a.clockInTime || '', a.subArea || '', a.role || '', a.leaveTime || '', a.comment || '', a.builderNotes || '']
      }),
    ]),
    'text/csv;charset=utf-8'
  )

  const exportWeeklyHoursCsv = () => {
    const rows = sumWeeklyBuilderHours(state)
    downloadText(
      `weekly-hours-${state.weekStartDate}.csv`,
      toCSV([['builder','area','hours'], ...rows.map((r) => [r.builder, r.area, r.hours])]),
      'text/csv;charset=utf-8'
    )
  }

  const exportBoardJson = () => downloadText(
    `weekly-staffing-board-${state.weekStartDate}.json`,
    JSON.stringify(state, null, 2),
    'application/json;charset=utf-8'
  )

  const exportAttendanceCsv = () => downloadText(
    `attendance-history-${state.selectedDay}.csv`,
    toCSV([['timestamp', 'clock_time', 'builder', 'event', 'note'], ...(dayState.attendanceLog || []).map((a) => [a.timestamp, a.clock_time, a.builder, a.event, a.note])]),
    'text/csv;charset=utf-8'
  )

  const exportPNG = async () => {
    if (!captureRef.current) return
    const canvas = await html2canvas(captureRef.current, {
      backgroundColor: state.darkMode ? '#0b1220' : '#eef3f8',
      scale: 2,
      useCORS: true,
      logging: false,
    })
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `weekly-staffing-board-${state.weekStartDate}-${state.selectedDay}.png`
    a.click()
  }

  const exportTPHBreakdownPNG = async () => {
    if (!tphCaptureRef.current) {
      alert('TPH capture section is not ready yet. Refresh once and try again.')
      return
    }
    const canvas = await html2canvas(tphCaptureRef.current, {
      backgroundColor: state.darkMode ? '#08111f' : '#eef3f8',
      scale: 2,
      useCORS: true,
      logging: false,
    })
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `tph-breakdown-${state.weekStartDate}-${state.selectedDay}.png`
    a.click()
  }

  const exportAnalysisPNG = async () => {
    if (!analysisCaptureRef.current) {
      alert('Analysis section is not ready yet. Refresh once and try again.')
      return
    }
    const canvas = await html2canvas(analysisCaptureRef.current, {
      backgroundColor: state.darkMode ? '#08111f' : '#eef3f8',
      scale: 2,
      useCORS: true,
      logging: false,
    })
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `analysis-${state.weekStartDate}.png`
    a.click()
  }

  const exportElementToPdf = async (element, filename) => {
    if (!element) return
    const { jsPDF } = await import('jspdf')
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 8
    const imgWidth = pageWidth - margin * 2
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    let heightLeft = imgHeight
    let position = margin

    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight, undefined, 'FAST')
    heightLeft -= (pageHeight - margin * 2)

    while (heightLeft > 0) {
      position = heightLeft - imgHeight + margin
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight, undefined, 'FAST')
      heightLeft -= (pageHeight - margin * 2)
    }

    pdf.save(filename)
  }

  const exportDailyPdf = async () => {
    await exportElementToPdf(dailyPdfRef.current, `daily-report-${state.weekStartDate}-${state.selectedDay}.pdf`)
  }

  const exportWeeklyPdf = async () => {
    await exportElementToPdf(weeklyPdfRef.current, `weekly-report-${state.weekStartDate}.pdf`)
  }

  const counts = useMemo(() => {
    let present = 0, pto = 0, loa = 0, vto = 0, absent = 0, training = 0, indirect = 0, unassigned = 0, lineLeads = 0
    activeBuilders.forEach((b) => {
      const a = getAssignment(b.id)
      const s = a.status || 'Present'
      const profile = normalizeBuilderProfile(state.builderPool.find((p) => p.id === b.id) || b)
      if (profile.isLineLead) lineLeads += 1
      if (s === 'Present') present++
      else if (s === 'PTO') pto++
      else if (s === 'LOA') loa++
      else if (s === 'VTO') vto++
      else if (s === 'Absent') absent++
      else if (s === 'Training') training++
      else if (s === 'Indirect') indirect++
      const effectiveArea = a.area || 'Unassigned'
      if (staffedStatuses().includes(s) && effectiveArea === 'Unassigned' && !profile.isLineLead) unassigned++
    })
    return { present, pto, loa, vto, absent, training, indirect, staffed: present + training + indirect, total: activeBuilders.length, unassigned, lineLeads }
  }, [activeBuilders, dayState, tick, state.builderPool])

  const shift = useMemo(() => {
    const now = new Date()
    const start = shiftStartForDay(state.selectedDay, state.weekStartDate, state.boardShift)
    const end = shiftEndForDay(state.selectedDay, state.weekStartDate, state.boardShift)
    const breakStart = new Date(start)
    if (isNightShiftLabel(state.boardShift)) {
      breakStart.setDate(breakStart.getDate() + 1)
      breakStart.setHours(0, 0, 0, 0)
    } else {
      breakStart.setHours(12, 0, 0, 0)
    }
    const breakEnd = new Date(breakStart)
    breakEnd.setMinutes(breakEnd.getMinutes() + 30)

    let remaining = 0
    let worked = 0

    if (now <= start) {
      remaining = SHIFT_HOURS
      worked = 0
    } else if (now >= end) {
      remaining = 0
      worked = SHIFT_HOURS
    } else {
      const minutesSinceStart = (now - start) / 60000
      const minutesToEnd = (end - now) / 60000

      let unpaidBreakElapsed = 0
      if (now >= breakEnd) unpaidBreakElapsed = 30
      else if (now > breakStart && now < breakEnd) unpaidBreakElapsed = (now - breakStart) / 60000

      let unpaidBreakRemaining = 0
      if (now < breakStart) unpaidBreakRemaining = 30
      else if (now >= breakStart && now < breakEnd) unpaidBreakRemaining = (breakEnd - now) / 60000

      worked = Math.max(0, (minutesSinceStart - unpaidBreakElapsed) / 60)
      remaining = Math.max(0, (minutesToEnd - unpaidBreakRemaining) / 60)
    }

    return {
      nowLabel: now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      endLabel: end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      remainingHours: Math.max(0, Math.min(SHIFT_HOURS, remaining)),
      hoursWorked: Math.max(0, Math.min(SHIFT_HOURS, worked)),
      shiftHours: SHIFT_HOURS,
    }
  }, [state.selectedDay, state.weekStartDate, state.boardShift, tick])

  const totalHeadCount = useMemo(() => {
    const manual = numVal(dayState.opsMetrics.manualHeadCount)
    if (manual > 0) return manual
    return activeBuilders.filter((b) => {
      const status = getAssignment(b.id).status || 'Present'
      return !['PTO', 'LOA', 'VTO', 'Absent'].includes(status)
    }).length
  }, [dayState.opsMetrics.manualHeadCount, activeBuilders, dayState])

  const metrics = useMemo(() => {
    const ops = dayState.opsMetrics
    const recoveryGoal = numVal(ops.targetRackMediaRecovery)
    const recoveryProcessed = numVal(ops.racksProcessed)
    const rackPrepGoal = numVal(ops.targetRackPrep)
    const rackPrepOutput = numVal(ops.racksPrepped) + numVal(ops.recoveredRackPrep)
    const mediaGoal = numVal(ops.totalMediaCount)
    const mediaProcessed = numVal(ops.mediaProcessed)

    const weightedTarget = ((recoveryGoal + rackPrepGoal) * RACK_WEIGHT) + mediaGoal
    const weightedCompleted = ((recoveryProcessed + rackPrepOutput) * RACK_WEIGHT) + mediaProcessed
    const remainingWork = Math.max(0, weightedTarget - weightedCompleted)

    const targetTPH = totalHeadCount > 0 ? weightedTarget / (totalHeadCount * SHIFT_HOURS) : 0
    const requiredTPH = (totalHeadCount > 0 && shift.remainingHours > 0)
      ? remainingWork / (totalHeadCount * shift.remainingHours)
      : 0

    return {
      rackPrepOutput,
      weightedTarget,
      weightedCompleted,
      remainingWork,
      targetTPH,
      requiredTPH,
      recoveryGoal,
      recoveryProcessed,
      rackPrepGoal,
      mediaGoal,
      mediaProcessed,
      totalWorkload: weightedTarget,
      completedWorkload: weightedCompleted,
    }
  }, [dayState.opsMetrics, totalHeadCount, shift.remainingHours])

  const effectiveAreaDefs = Array.isArray(state.areaDefs) && state.areaDefs.length ? state.areaDefs : AREA_DEFS
  const areaCounts = useMemo(() => effectiveAreaDefs.map((a) => ({
    ...a,
    count: activeBuilders.filter((b) => {
      const assign = getAssignment(b.id)
      const profile = normalizeBuilderProfile(state.builderPool.find((p) => p.id === b.id) || b)
      const effectiveArea = assign.area || 'Unassigned'
      return staffedStatuses().includes(assign.status || 'Present') && effectiveArea === a.name && !profile.isLineLead
    }).length,
  })), [activeBuilders, dayState, tick, state.builderPool, effectiveAreaDefs])

  const staffedAreas = areaCounts.filter((a) => a.count > 0 && a.name !== 'Unassigned').length
  const topAreas = areaCounts.filter((a) => a.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  const maxArea = Math.max(1, ...topAreas.map((a) => a.count), 1)
  const selectedAssignment = selectedBuilderId ? getAssignment(selectedBuilderId) : blankAssignment()
  const selectedPoolBuilder = selectedPoolBuilderId ? normalizeBuilderProfile(state.builderPool.find((b) => b.id === selectedPoolBuilderId) || {}) : null
  const filteredBuilderPool = state.builderPool.filter((b) => {
    const q = builderListFilter.trim().toLowerCase()
    if (!q) return true
    const flags = builderFlags(b).join(' ').toLowerCase()
    return b.name.toLowerCase().includes(q) || (b.badgeType || '').toLowerCase().includes(q) || flags.includes(q)
  })
  const selectedGroup = state.builderGroups.find((g) => g.id === selectedGroupId) || null

  const analysisWeeks = useMemo(() => {
    const map = { ...(state.weeklyHistory || {}) }
    const currentWeekKey = toMonday(state.weekStartDate)
    const currentSnapshot = buildWeekSnapshotFromState(state)
    if (hasSnapshotData(currentSnapshot)) {
      map[currentWeekKey] = currentSnapshot
    }
    return Object.values(map)
      .filter((week) => hasSnapshotData(week))
      .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))
      .slice(0, 4)
  }, [state])

  const savedWeekRows = useMemo(() => {
    const currentKey = toMonday(state.weekStartDate)
    const currentSnapshot = buildWeekSnapshotFromState(state)
    const map = { ...(state.weeklyHistory || {}) }
    if (hasSnapshotData(currentSnapshot)) {
      map[currentKey] = currentSnapshot
    }
    return Object.entries(map)
      .filter(([, snapshot]) => hasSnapshotData(snapshot))
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 4)
      .map(([wk, snapshot]) => {
        const info = getIsoWeekInfo(wk)
        return {
          weekStartDate: wk,
          year: info.year,
          week: info.week,
          hasData: true,
          recovery: snapshot?.totals?.recoveryProcessed || 0,
          prep: snapshot?.totals?.rackPrepDone || 0,
          media: snapshot?.totals?.totalMediaCount || 0,
          hours: snapshot?.totals?.staffedHours || 0,
        }
      })
  }, [state.weeklyHistory, state.weekStartDate, state.weeklyData])

  const currentWeekAnalysis = analysisWeeks.find((w) => w.weekStartDate === toMonday(state.weekStartDate)) || buildWeekSnapshotFromState(state)
  const weightedGoalWork = metrics.weightedTarget
  const weightedDoneWork = metrics.weightedCompleted

  const outputPerHour = shift.hoursWorked > 0 ? weightedDoneWork / shift.hoursWorked : 0
  const currentLiveTPH = shift.hoursWorked > 0 && totalHeadCount > 0 ? weightedDoneWork / (totalHeadCount * shift.hoursWorked) : 0
  const goalOutputPerHour = SHIFT_HOURS > 0 ? weightedGoalWork / SHIFT_HOURS : 0
  const goalTPHTotalHC = totalHeadCount > 0 && SHIFT_HOURS > 0 ? weightedGoalWork / (totalHeadCount * SHIFT_HOURS) : 0

  const activeProductionHeadcount = activeBuilders.filter((b) => {
    const a = getAssignment(b.id)
    const area = a.area || 'Unassigned'
    const status = a.status || 'Present'
    return staffedStatuses().includes(status) && area !== 'Unassigned' && !normalizeBuilderProfile(state.builderPool.find((p) => p.id === b.id) || b).isLineLead
  }).length

  const liveTPHActiveHC = shift.hoursWorked > 0 && activeProductionHeadcount > 0 ? weightedDoneWork / (activeProductionHeadcount * shift.hoursWorked) : 0
  const goalTPHActiveHC = activeProductionHeadcount > 0 && SHIFT_HOURS > 0 ? weightedGoalWork / (activeProductionHeadcount * SHIFT_HOURS) : 0

  const planningTargetTPH = 7.5
  const projectedOutputAtTargetTPH = totalHeadCount > 0 ? planningTargetTPH * totalHeadCount * SHIFT_HOURS : 0
  const projectedSurplusGap = projectedOutputAtTargetTPH - weightedGoalWork

  const performanceGap = currentLiveTPH - metrics.requiredTPH
  const performanceLabel = currentLiveTPH <= 0 && metrics.weightedCompleted <= 0
    ? 'Not started'
    : performanceGap >= 0.25
      ? 'Ahead'
      : performanceGap >= -0.25
        ? 'On Target'
        : 'Needs Recovery'
  const projectedAtCurrentPace = currentLiveTPH > 0 && totalHeadCount > 0
    ? currentLiveTPH * totalHeadCount * SHIFT_HOURS
    : metrics.weightedCompleted
  const projectedVsGoal = projectedAtCurrentPace - metrics.weightedTarget
  const recoveryProgressPct = metrics.recoveryGoal > 0 ? (metrics.recoveryProcessed / metrics.recoveryGoal) * 100 : 0
  const prepProgressPct = metrics.rackPrepGoal > 0 ? (metrics.rackPrepOutput / metrics.rackPrepGoal) * 100 : 0
  const mediaProgressPct = metrics.mediaGoal > 0 ? (metrics.mediaProcessed / metrics.mediaGoal) * 100 : 0
  const tphGapVsGoal = currentLiveTPH - metrics.targetTPH
  const efficiencyPct = weightedGoalWork > 0 ? (weightedDoneWork / weightedGoalWork) * 100 : 0
  const paceLabel = currentLiveTPH >= metrics.requiredTPH ? 'Ahead' : (weightedDoneWork > 0 ? 'Behind' : 'Not started')
  const recoveryPct = metrics.recoveryGoal > 0 ? (metrics.recoveryProcessed / metrics.recoveryGoal) * 100 : 0
  const prepPct = metrics.rackPrepGoal > 0 ? (metrics.rackPrepOutput / metrics.rackPrepGoal) * 100 : 0
  const mediaPct = metrics.mediaGoal > 0 ? (metrics.mediaProcessed / metrics.mediaGoal) * 100 : 0
  const efficiencyParts = [recoveryPct, prepPct, mediaPct].filter((n) => Number.isFinite(n) && n >= 0)
  const avgEfficiency = efficiencyParts.length ? efficiencyParts.reduce((a, b) => a + b, 0) / efficiencyParts.length : 0
  const workPerBuilder = totalHeadCount > 0 ? weightedGoalWork / totalHeadCount : 0
  const paceStatus = currentLiveTPH >= metrics.requiredTPH ? 'Ahead' : 'Behind'
  const paceGap = currentLiveTPH - metrics.requiredTPH
  const weekTotalWorkload = Number(currentWeekAnalysis.totals.staffedHours || 0) > 0 ? Number(currentWeekAnalysis.totals.staffedHours || 0) * Number(currentWeekAnalysis.totals.staffedHours || 0) * 0 + (currentWeekAnalysis.totals.recoveryProcessed + currentWeekAnalysis.totals.rackPrepDone) * RACK_WEIGHT + currentWeekAnalysis.totals.totalMediaCount : ((currentWeekAnalysis.totals.recoveryProcessed + currentWeekAnalysis.totals.rackPrepDone) * RACK_WEIGHT) + currentWeekAnalysis.totals.totalMediaCount
  const weekBuilderHours = Number(currentWeekAnalysis.totals.staffedHours || 0)
  const weekAvgTPH = weekBuilderHours > 0 ? weekTotalWorkload / weekBuilderHours : 0
  const weekComparisonRacks = analysisWeeks.map((w) => ({ label: w.weekStartDate, value: w.totals.recoveryProcessed }))
  const weekComparisonPrep = analysisWeeks.map((w) => ({ label: w.weekStartDate, value: w.totals.rackPrepDone }))
  const weekComparisonMedia = analysisWeeks.map((w) => ({ label: w.weekStartDate, value: w.totals.totalMediaCount }))
  const weekComparisonHours = analysisWeeks.map((w) => ({ label: w.weekStartDate, value: w.totals.staffedHours }))
  const currentWeekAreaHours = Object.entries(currentWeekAnalysis.areaHours || {}).sort((a, b) => b[1] - a[1]).map(([area, hours]) => ({ label: area, value: hours }))
  const currentWeekAreaEfficiency = currentWeekAreaHours.map((row) => {
    const share = weekBuilderHours > 0 ? row.value / weekBuilderHours : 0
    const estWork = weekTotalWorkload * share
    return { label: row.label, value: row.value > 0 ? estWork / row.value : 0 }
  }).sort((a, b) => b.value - a.value)
  const topArea = currentWeekAreaHours.length ? currentWeekAreaHours[0].label : '—'
  const topAreaEfficiency = currentWeekAreaEfficiency.length ? currentWeekAreaEfficiency[0].value : 0
  const currentWeekDayWork = (currentWeekAnalysis.byDay || []).map((d) => ({ label: d.day.slice(0,3), value: d.recoveryProcessed + d.rackPrepDone + (d.totalMediaCount / RACK_WEIGHT) }))

  const previousWeek = analysisWeeks.find((w) => w.weekStartDate !== toMonday(state.weekStartDate)) || null
  const recoveryTrend = previousWeek ? safePctChange(currentWeekAnalysis.totals.recoveryProcessed, previousWeek.totals.recoveryProcessed) : 0
  const prepTrend = previousWeek ? safePctChange(currentWeekAnalysis.totals.rackPrepDone, previousWeek.totals.rackPrepDone) : 0
  const mediaTrend = previousWeek ? safePctChange(currentWeekAnalysis.totals.totalMediaCount, previousWeek.totals.totalMediaCount) : 0
  const hoursTrend = previousWeek ? safePctChange(currentWeekAnalysis.totals.staffedHours, previousWeek.totals.staffedHours) : 0
  const prevWeekWork = previousWeek ? (previousWeek.byDay || []).reduce((sum, d) => sum + d.recoveryProcessed + d.rackPrepDone + (d.totalMediaCount / RACK_WEIGHT), 0) : 0
  const prevWeekTPH = previousWeek && Number(previousWeek.totals.staffedHours || 0) > 0 ? prevWeekWork / Number(previousWeek.totals.staffedHours || 0) : 0
  const tphTrend = previousWeek ? safePctChange(weekAvgTPH, prevWeekTPH) : 0

  const projectedRecovery = shift.hoursWorked > 0 ? (metrics.recoveryProcessed / shift.hoursWorked) * (shift.shiftHours || SHIFT_HOURS) : metrics.recoveryProcessed
  const projectedPrep = shift.hoursWorked > 0 ? (metrics.rackPrepOutput / shift.hoursWorked) * (shift.shiftHours || SHIFT_HOURS) : metrics.rackPrepOutput
  const projectedMedia = shift.hoursWorked > 0 ? (metrics.mediaProcessed / shift.hoursWorked) * (shift.shiftHours || SHIFT_HOURS) : metrics.mediaProcessed
  const projectedTPH = shift.hoursWorked > 0 && activeProductionHeadcount > 0 ? weightedDoneWork / activeProductionHeadcount / shift.hoursWorked : 0

  const pressureAreas = currentWeekAreaHours.map((row) => {
    const laborShare = weekBuilderHours > 0 ? (row.value / weekBuilderHours) * 100 : 0
    const eff = currentWeekAreaEfficiency.find((x) => x.label === row.label)?.value || 0
    const status = eff >= 1 ? 'Green' : eff >= 0.7 ? 'Yellow' : 'Red'
    return { ...row, laborShare, efficiency: eff, status }
  }).sort((a, b) => b.value - a.value)

  const plannedHeadcount = numVal(dayState.opsMetrics.manualHeadCount) > 0 ? numVal(dayState.opsMetrics.manualHeadCount) : activeBuilders.length
  const actualHeadcount = totalHeadCount
  const attendanceVariancePct = plannedHeadcount > 0 ? ((actualHeadcount - plannedHeadcount) / plannedHeadcount) * 100 : 0

  const lineLeadBuilders = activeBuilders.filter((b) => normalizeBuilderProfile(state.builderPool.find((p) => p.id === b.id) || b).isLineLead)

  const builderWeeklyAreaHours = useMemo(() => {
    return state.builderPool.map((builder) => {
      const areaTotals = {}
      WEEKDAYS.forEach((day) => {
        const assignment = (state.weeklyData[day] || defaultDay()).assignments[builder.id]
        if (!assignment) return
        const totals = computeHoursForAssignment(assignment, day, state.weekStartDate)
        Object.entries(totals).forEach(([area, hours]) => {
          areaTotals[area] = (areaTotals[area] || 0) + hours
        })
      })
      const totalHours = Object.values(areaTotals).reduce((sum, value) => sum + value, 0)
      return {
        builder,
        totalHours,
        areas: Object.entries(areaTotals).sort((a, b) => b[1] - a[1]),
      }
    }).filter((row) => row.totalHours > 0).sort((a, b) => b.totalHours - a.totalHours || a.builder.name.localeCompare(b.builder.name))
  }, [state.builderPool, state.weeklyData, state.weekStartDate])

  const maxBuilderWeeklyHours = useMemo(
    () => Math.max(1, ...builderWeeklyAreaHours.map((row) => row.totalHours), 1),
    [builderWeeklyAreaHours]
  )
  const areaBuilders = (areaName) => activeBuilders.filter((b) => {
    const a = getAssignment(b.id)
    const profile = normalizeBuilderProfile(state.builderPool.find((p) => p.id === b.id) || b)
    const effectiveArea = a.area || 'Unassigned'
    return staffedStatuses().includes(a.status || 'Present') && effectiveArea === areaName && !profile.isLineLead
  })

  return (
    <div className={state.darkMode ? "app dark" : "app"} style={{ gridTemplateColumns: sidebarOpen ? "320px minmax(0,1fr)" : "minmax(0,1fr)" }}>
      <button className="sidebar-toggle" onClick={() => setSidebarOpen((v) => !v)}>{sidebarOpen ? "Hide Menu" : "Show Menu"}</button>
      {sidebarOpen && (
      <aside className="sidebar">

        <h1>Weekly Staffing Board</h1>
        <div className="muted">Permanent master roster, Monday-Friday weekly board, weekly export, and staffed hours by area.</div>

        {user ? (
          <div className="section auth-section">
            <div className="small">Signed in as</div>
            <strong>{user.username}</strong>
            <button className="secondary" onClick={onLogout}>Logout</button>
          </div>
        ) : null}

        <div className="section">
          <h2>Board Header</h2>
          <div className="row two">
            <div><label>Board Title</label><input value={state.boardTitle} onChange={(e) => saveState((prev) => ({ ...prev, boardTitle: e.target.value }))} /></div>
            <div><label>Week Start (Monday)</label><input type="date" value={state.weekStartDate} onChange={(e) => saveState((prev) => ({ ...prev, weekStartDate: e.target.value }))} /></div>
          </div>
          <div className="row two">
            <div><label>Operation Board</label><select value={state.currentBoardId || 'speed_day'} onChange={(e) => switchBoard(e.target.value)}>
              {Object.entries(BOARD_PRESETS).map(([id, preset]) => <option key={id} value={id}>{preset.label}</option>)}
            </select></div>
            <div><label>Admin / Line Lead Name</label><input value={state.adminName || 'Ali'} onChange={(e) => saveState((prev) => ({ ...prev, adminName: e.target.value }))} /></div>
          </div>
          <div className="row">
            <div className="storage-badge">Sync status: {syncStatus}</div>
          </div>
        </div>

        <div className="section">
          <h2>Week Tracker</h2>
          <div className="week-tracker-box">
            <div className="week-tracker-main">Week of {state.weekStartDate}</div>
            <div className="small">Year {weekInfo.year} · Week {weekInfo.week}</div>
            <div className="small">{state.lockedWeeks?.[toMonday(state.weekStartDate)] ? 'Locked week' : 'Unlocked week'}</div>
          </div>
          <div className="row three">
            <button className="secondary mini-nav-btn" onClick={() => goToWeek(-1)}>Prev</button>
            <button className="secondary mini-nav-btn" onClick={() => switchToWeek(getMondayDate())}>Current</button>
            <button className="secondary mini-nav-btn" onClick={() => goToWeek(1)}>Next</button>
          </div>
          <div className="row">
            <select value={historyWeekChoice} onChange={(e) => { setHistoryWeekChoice(e.target.value); if (e.target.value) switchToWeek(e.target.value) }}>
              <option value="">Jump to saved week…</option>
              {availableWeeks.map((wk) => {
                const info = getIsoWeekInfo(wk)
                return <option key={wk} value={wk}>{wk} · Y{info.year} W{String(info.week).padStart(2,'0')}</option>
              })}
            </select>
          </div>
          <div className="row">
            <button className={state.lockedWeeks?.[toMonday(state.weekStartDate)] ? 'danger' : 'secondary'} onClick={toggleWeekLock}>
              {state.lockedWeeks?.[toMonday(state.weekStartDate)] ? 'Unlock Week' : 'Lock Week'}
            </button>
          </div>
        </div>

        <div className="section">
          <h2>Week Days</h2>
          <div className="row">
            <div className="day-tabs">
              {WEEKDAYS.map((day) => (
                <button key={day} className={state.selectedDay === day ? 'day-tab active' : 'day-tab'} onClick={() => saveState((prev) => ({ ...prev, selectedDay: day }))}>
                  {day}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="section view-section">
          <h2>View</h2>
          <div className="view-tab-grid">
            <button className={mainTab === 'board' ? 'primary sidebar-tab active' : 'secondary sidebar-tab'} onClick={() => setMainTab('board')}>Board</button>
            <button className={mainTab === 'analysis' ? 'primary sidebar-tab active' : 'secondary sidebar-tab'} onClick={() => setMainTab('analysis')}>Analysis</button>
            <button className={mainTab === 'builders' ? 'primary sidebar-tab active' : 'secondary sidebar-tab'} onClick={() => setMainTab('builders')}>Builders</button>
            <button className={mainTab === 'comments' ? 'primary sidebar-tab active' : 'secondary sidebar-tab'} onClick={() => setMainTab('comments')}>Comments</button>
          </div>
          <div className="view-mode-grid">
            <button className="secondary mode-toggle-btn" onClick={() => saveState((prev) => ({ ...prev, darkMode: !prev.darkMode }))}>
              {state.darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            </button>
            <div className="mode-state-pill">{state.darkMode ? 'Dark mode on' : 'Light mode on'}</div>
          </div>
        </div>

        <div className="section">
          <h2>Builder Groups</h2>
          <div className="row-inline">
            <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="New group name" />
            <button className="primary" onClick={addGroup}>Add Group</button>
          </div>
          <div className="group-list">
            {state.builderGroups.length ? state.builderGroups.map((g) => (
              <div key={g.id} className={`group-row ${selectedGroupId === g.id ? 'selected' : ''}`} onClick={() => setSelectedGroupId(g.id)}>
                <div>
                  <strong>{g.name}</strong>
                  <div className="small">{(g.builderIds || []).length} people</div>
                </div>
                <div className="pool-actions">
                  <button className="mini-btn" onClick={(e) => { e.stopPropagation(); addGroupToDay(g.id) }}>Add Whole Group</button>
                  <button className="mini-btn danger-lite" onClick={(e) => { e.stopPropagation(); deleteGroup(g.id) }}>Delete</button>
                </div>
              </div>
            )) : <div className="small">No groups yet.</div>}
          </div>
        </div>

        <div className="section">
          <h2>TPH Goals & Workload</h2>
          <div className="row two">
            <div>
              <label>Recovery Goal</label>
              <input
                type="number"
                inputMode="decimal"
                value={dayState.opsMetrics.targetRackMediaRecovery || ''}
                onChange={(e) => updateDay((prev) => ({
                  ...prev,
                  opsMetrics: { ...prev.opsMetrics, targetRackMediaRecovery: e.target.value }
                }))}
              />
            </div>
            <div>
              <label>Racks Processed</label>
              <input
                type="number"
                inputMode="decimal"
                value={dayState.opsMetrics.racksProcessed || ''}
                onChange={(e) => updateDay((prev) => ({
                  ...prev,
                  opsMetrics: { ...prev.opsMetrics, racksProcessed: e.target.value }
                }))}
              />
            </div>
          </div>

          <div className="row two">
            <div>
              <label>Prep Goal</label>
              <input
                type="number"
                inputMode="decimal"
                value={dayState.opsMetrics.targetRackPrep || ''}
                onChange={(e) => updateDay((prev) => ({
                  ...prev,
                  opsMetrics: { ...prev.opsMetrics, targetRackPrep: e.target.value }
                }))}
              />
            </div>
            <div>
              <label>Racks Prepped</label>
              <input
                type="number"
                inputMode="decimal"
                value={dayState.opsMetrics.racksPrepped || ''}
                onChange={(e) => updateDay((prev) => ({
                  ...prev,
                  opsMetrics: { ...prev.opsMetrics, racksPrepped: e.target.value }
                }))}
              />
            </div>
          </div>

          <div className="row two rack-paste-row">
            <div>
              <label>Paste Racks Prepped + Material Type</label>
              <textarea
                rows="5"
                value={dayState.rackLists?.prepped || ''}
                onChange={(e) => {
                  const rows = parseRackList(e.target.value)
                  updateDay((prev) => ({
                    ...prev,
                    rackLists: { ...prev.rackLists, prepped: e.target.value },
                    opsMetrics: { ...prev.opsMetrics, racksPrepped: String(rows.length) },
                  }))
                }}
                placeholder={'RACK123 GPU\nRACK124 SSD'}
              />
              <div className="small">Count: {preppedRackRows.length}</div>
            </div>
            <div>
              <label>Paste Racks Processed + Material Type</label>
              <textarea
                rows="5"
                value={dayState.rackLists?.processed || ''}
                onChange={(e) => {
                  const rows = parseRackList(e.target.value)
                  updateDay((prev) => ({
                    ...prev,
                    rackLists: { ...prev.rackLists, processed: e.target.value },
                    opsMetrics: { ...prev.opsMetrics, racksProcessed: String(rows.length) },
                  }))
                }}
                placeholder={'RACK555 CPU\nRACK556 HDD'}
              />
              <div className="small">Count: {processedRackRows.length}</div>
            </div>
          </div>

          <div className="row two">
            <div>
              <label>Recovered in Prep</label>
              <input
                type="number"
                inputMode="decimal"
                value={dayState.opsMetrics.recoveredRackPrep || ''}
                onChange={(e) => updateDay((prev) => ({
                  ...prev,
                  opsMetrics: { ...prev.opsMetrics, recoveredRackPrep: e.target.value }
                }))}
              />
            </div>
            <div>
              <label>Total Media Count</label>
              <input
                type="number"
                inputMode="decimal"
                value={dayState.opsMetrics.totalMediaCount || ''}
                onChange={(e) => updateDay((prev) => ({
                  ...prev,
                  opsMetrics: { ...prev.opsMetrics, totalMediaCount: e.target.value }
                }))}
              />
            </div>
          </div>

          <div className="row two">
            <div>
              <label>Media Processed</label>
              <input
                type="number"
                inputMode="decimal"
                value={dayState.opsMetrics.mediaProcessed || ''}
                onChange={(e) => updateDay((prev) => ({
                  ...prev,
                  opsMetrics: { ...prev.opsMetrics, mediaProcessed: e.target.value }
                }))}
              />
            </div>
            <div>
              <label>Manual Headcount Override</label>
              <input
                type="number"
                inputMode="decimal"
                value={dayState.opsMetrics.manualHeadCount || ''}
                onChange={(e) => updateDay((prev) => ({
                  ...prev,
                  opsMetrics: { ...prev.opsMetrics, manualHeadCount: e.target.value }
                }))}
              />
            </div>
          </div>

          <div className="small">
            TPH uses recovery goal + prep goal + media/6.4 with current headcount and remaining shift hours.
          </div>
        </div>

        <div className="section">
          <h2>Edit Selected Staff</h2>
          <div className="row">
            <div><label>Selected Builder</label><select value={selectedBuilderId} onChange={(e) => setSelectedBuilderId(e.target.value)}>
              {activeBuilders.length ? activeBuilders.map((b) => <option key={b.id} value={b.id}>{b.name}</option>) : <option value="">No builders on this day</option>}
            </select></div>
          </div>
          {selectedBuilderId ? (
            <>
              <div className="row two">
                <div><label>Status</label><select value={selectedAssignment.status || 'Present'} onChange={(e) => updateBuilderAssignment(selectedBuilderId, { status: e.target.value })}>
                  <option value="Present">Present</option>
                  <option value="Training">Training</option>
                  <option value="Indirect">Indirect</option>
                  <option value="PTO">PTO</option>
                  <option value="LOA">LOA</option>
                  <option value="VTO">VTO</option>
                  <option value="Absent">Absent</option>
                </select></div>
                <div><label>Area</label><select value={selectedAssignment.area || ''} onChange={(e) => updateBuilderAssignment(selectedBuilderId, { area: e.target.value })}>
                  <option value="">Unassigned</option>
                  {effectiveAreaDefs.filter((a) => a.name !== 'Unassigned').map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                </select></div>
              </div>
              <div className="row two">
                <div><label>Clock In</label><input type="time" value={selectedAssignment.clockInTime || ''} onChange={(e) => updateBuilderAssignment(selectedBuilderId, { clockInTime: e.target.value })} /></div>
                <div><label>Clock Out</label><input type="time" value={selectedAssignment.leaveTime || ''} onChange={(e) => updateBuilderAssignment(selectedBuilderId, { leaveTime: e.target.value })} /></div>
              </div>
              <div className="row">
                <div><label>Comment</label><input value={selectedAssignment.comment || ''} onChange={(e) => updateBuilderAssignment(selectedBuilderId, { comment: e.target.value })} /></div>
              </div>
              <div className="row">
                <div><label>Builder Notes</label><textarea rows="3" value={selectedAssignment.builderNotes || ''} onChange={(e) => updateBuilderAssignment(selectedBuilderId, { builderNotes: e.target.value })} /></div>
              </div>
            </>
          ) : <div className="small">Pick someone from the selected day to edit.</div>}
        </div>

        <div className="section">
          <h2>Manage Areas</h2>
          <div className="row">
            <div className="row-inline">
              <input value={newAreaName} onChange={(e) => setNewAreaName(e.target.value)} placeholder="Add new area" />
              <button className="primary" onClick={addArea}>Add Area</button>
            </div>
          </div>
          <div className="area-admin-list">
            {effectiveAreaDefs.map((area) => (
              <div key={area.name} className="area-admin-row">
                <div>
                  <strong>{area.name}</strong>
                  <div className="small">{area.note || 'Custom staffing area'}</div>
                </div>
                {area.name !== 'Unassigned' ? <button className="mini-btn danger-lite" onClick={() => deleteArea(area.name)}>Delete</button> : <span className="small">Locked</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="section">
          <h2>Snapshot Captures</h2>
          <div className="row three snapshot-button-row">
            <button className="secondary mini-btn" onClick={() => captureSnapshot('q1', 'Q1 Snapshot')}>Capture Q1</button>
            <button className="secondary mini-btn" onClick={() => captureSnapshot('q2', 'Q2 Snapshot')}>Capture Q2</button>
            <button className="secondary mini-btn" onClick={() => captureSnapshot('q3', 'Q3 Snapshot')}>Capture Q3</button>
          </div>
          <div className="small">Quick side-menu snapshot buttons for the current day.</div>
        </div>

        <div className="section">
          <h2>Exports</h2>
          <div className="row two">
            <button className="secondary" onClick={exportDayAssignmentsCsv}>Day CSV</button>
            <button className="secondary" onClick={exportAttendanceCsv}>Attendance CSV</button>
          </div>
          <div className="row two">
            <button className="secondary" onClick={exportWeeklyHoursCsv}>Weekly Hours CSV</button>
            <button className="secondary" onClick={exportBoardJson}>Board JSON</button>
          </div>
          <div className="row two">
            <button className="secondary" onClick={exportPNG}>Board PNG</button>
            <button className="secondary" onClick={exportTPHBreakdownPNG}>TPH PNG</button>
          </div>
          <div className="row two">
            <button className="secondary" onClick={exportAnalysisPNG}>Analysis PNG</button>
            <button className="secondary" onClick={exportDailyPdf}>Daily PDF</button>
          </div>
          <div className="row">
            <button className="secondary" onClick={exportWeeklyPdf}>Weekly PDF</button>
          </div>
          <div className="row">
            <button className="secondary" onClick={() => exportEndOfShiftExcel({
              state,
              dayState,
              metrics,
              counts,
              areaCounts,
              totalHeadCount,
              shiftHours: shift.shiftHours,
              rackWeight: RACK_WEIGHT,
              getAssignment,
              activeBuilders,
              selectedDay: state.selectedDay,
            })}>Individual Day Excel</button>
          </div>
          <div className="row">
            <button className="primary" onClick={() => exportWeeklyExcel({
              state,
              weekDays: WEEKDAYS,
              getDayData: (day) => state.weeklyData[day] || defaultDay(),
              builderPool: state.builderPool,
              computeHoursForAssignment,
              areaDefs: AREA_DEFS,
            })}>Weekly Excel (All 5 Days + Hours)</button>
          </div>
          <div className="row">
            <button className="danger" onClick={resetWeek}>Reset Week</button>
          </div>
        </div>
      </aside>
      )}
      <main className="main" ref={captureRef}>
        <div className="main-top-tabs app-nav-tabs">
          <button className={mainTab === 'board' ? 'primary nav-tab active' : 'secondary nav-tab'} onClick={() => setMainTab('board')}>Board</button>
          <button className={mainTab === 'analysis' ? 'primary nav-tab active' : 'secondary nav-tab'} onClick={() => setMainTab('analysis')}>Analysis</button>
          <button className={mainTab === 'builders' ? 'primary nav-tab active' : 'secondary nav-tab'} onClick={() => setMainTab('builders')}>Builders</button>
          <button className={mainTab === 'comments' ? 'primary nav-tab active' : 'secondary nav-tab'} onClick={() => setMainTab('comments')}>Comments</button>
        </div>

        {mainTab === 'board' ? (
        <div className="board-shell">
          <div className="board-header">
            <div>
              <div className="title">{state.boardTitle}</div>
              <div style={{ marginTop: 8 }}>
                <span className="pill">Week of {state.weekStartDate}</span>
                <span className="pill">{state.selectedDay}</span>
                <span className="pill">{BOARD_PRESETS[state.currentBoardId]?.label || state.boardShift}</span>
                <span className="pill">{state.adminName ? `Admin: ${state.adminName}` : 'Admin not set'}</span>
              </div>
            </div>
            <div className="muted">Last update: <strong>{dayState.updatedAt || '—'}</strong></div>
          </div>

          <div ref={tphCaptureRef} className="topholder">
          <div className="png-header-card">
            <div>
              <div className="table-kicker">TPH / Goal / Headcount Snapshot</div>
              <div className="small">Week of {state.weekStartDate} · {state.selectedDay} · {state.boardShift} · Generated {new Date().toLocaleString()}</div>
            </div>
            <div className="png-meta-grid">
              <div className="png-meta-pill"><span>Date</span><strong>{state.weekStartDate}</strong></div>
              <div className="png-meta-pill"><span>Day</span><strong>{state.selectedDay}</strong></div>
              <div className="png-meta-pill"><span>Time</span><strong>{new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</strong></div>
              <div className="png-meta-pill"><span>Total HC</span><strong>{totalHeadCount}</strong></div>
            </div>
          </div>
        <div className="hero-grid dashboard-hero-grid">
            <div className="card dashboard-card">
              <div className="muted strong">Shift Visual Overview</div>
              <div className="kpi-grid kpi-grid-wide">
                <div className="kpi"><div className="kpi-label">Headcount</div><div className="kpi-value">{totalHeadCount}</div></div>
                <div className="kpi"><div className="kpi-label">Weighted Weighted Goal</div><div className="kpi-value">{weightedGoalWork.toFixed(1)}</div></div>
                <div className="kpi"><div className="kpi-label">Weighted Output / Hr</div><div className="kpi-value">{outputPerHour.toFixed(1)}</div></div>
                <div className="kpi"><div className="kpi-label">Weighted TPH / Total HC</div><div className="kpi-value">{currentLiveTPH.toFixed(1)}</div></div>
                <div className="kpi"><div className="kpi-label">Weighted TPH / Active HC</div><div className="kpi-value">{currentLiveTPH.toFixed(1)}</div></div>
                <div className="kpi"><div className="kpi-label">Goal Output / Hr</div><div className="kpi-value">{goalOutputPerHour.toFixed(1)}</div></div>
                <div className="kpi"><div className="kpi-label">Goal TPH / Total HC</div><div className="kpi-value">{goalTPHTotalHC.toFixed(1)}</div></div>
                <div className="kpi"><div className="kpi-label">Goal TPH / Active HC</div><div className="kpi-value">{goalTPHActiveHC.toFixed(1)}</div></div>
                <div className="kpi"><div className="kpi-label">TPH Gap vs Goal</div><div className={`kpi-value ${tphGapVsGoal >= 0 ? 'status-good' : 'status-bad'}`}>{tphGapVsGoal >= 0 ? '+' : ''}{tphGapVsGoal.toFixed(1)}</div></div>
                <div className="kpi"><div className="kpi-label">Efficiency %</div><div className={`kpi-value ${efficiencyPct >= 100 ? 'status-good' : efficiencyPct >= 80 ? 'status-warn' : 'status-bad'}`}>{efficiencyPct.toFixed(0)}%</div></div>
                <div className="kpi"><div className="kpi-label">Projected @ 7.5 TPH</div><div className="kpi-value">{projectedOutputAtTargetTPH.toFixed(0)}</div></div>
                <div className="kpi"><div className="kpi-label">Projected Surplus / Gap</div><div className={`kpi-value ${projectedSurplusGap >= 0 ? 'status-good' : 'status-bad'}`}>{projectedSurplusGap >= 0 ? '+' : ''}{projectedSurplusGap.toFixed(0)}</div></div>
              </div>
              <div className="split">
                <div className="card">
                  <div className="small strong">Area Coverage</div>
                  <div className="list">
                    {topAreas.length ? topAreas.map((a) => (
                      <div key={a.name} className="list-row">
                        <div>{a.name}</div>
                        <div className="track"><div className="fill" style={{ width: `${Math.max(10, Math.round((a.count / maxArea) * 100))}%` }} /></div>
                        <div>{a.capacity ? `${a.count}/${a.capacity}` : a.count}</div>
                      </div>
                    )) : <div className="small">No staffed areas yet.</div>}
                  </div>
                </div>
                <div className="card">
                  <div className="small strong">Shift Notes</div>
                  <div className="chiprow">
                    <div className="chip"><span>Areas staffed</span><span className="numchip">{staffedAreas}</span></div>
                    <div className="chip"><span>Unassigned</span><span className="numchip">{counts.unassigned}</span></div>
                    <div className="chip"><span>Current time</span><span className="numchip">{shift.nowLabel}</span></div>
                    <div className="chip"><span>Shift ends</span><span className="numchip">{shift.endLabel}</span></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="muted strong">TPH Reporting</div>
              <div className="ops-grid">
                <div className="ops feature manager-tph-card">
                  <div className="ops-label">Shift TPH Status</div>
                  <div className={`ops-value ${performanceLabel === 'Ahead' ? 'status-good' : performanceLabel === 'On Target' ? 'status-warn' : performanceLabel === 'Not started' ? '' : 'status-bad'}`}>
                    {performanceLabel === 'Not started' ? '0.0' : currentLiveTPH.toFixed(1)}
                  </div>
                  <div className="ops-sub">
                    Required {metrics.requiredTPH.toFixed(1)} · Live {currentLiveTPH.toFixed(1)} · {performanceLabel}{performanceLabel !== 'Not started' ? ` ${performanceGap >= 0 ? '+' : ''}${performanceGap.toFixed(1)}` : ''}
                  </div>
                  <div className="progress-grid">
                    <div className="progress-card"><div className="progress-title">Recovery</div><div className="progress-value">{metrics.recoveryProcessed} / {metrics.recoveryGoal}</div><div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.min(100, recoveryProgressPct)}%` }} /></div><div className="small">{recoveryProgressPct.toFixed(0)}%</div></div>
                    <div className="progress-card"><div className="progress-title">Prep</div><div className="progress-value">{metrics.rackPrepOutput.toFixed(0)} / {metrics.rackPrepGoal}</div><div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.min(100, prepProgressPct)}%` }} /></div><div className="small">{prepProgressPct.toFixed(0)}%</div></div>
                    <div className="progress-card"><div className="progress-title">Media</div><div className="progress-value">{metrics.mediaProcessed} / {metrics.mediaGoal}</div><div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.min(100, mediaProgressPct)}%` }} /></div><div className="small">{mediaProgressPct.toFixed(0)}%</div></div>
                    <div className="progress-card"><div className="progress-title">Projected Finish</div><div className={`progress-value ${projectedVsGoal >= 0 ? 'status-good' : 'status-bad'}`}>{projectedVsGoal >= 0 ? '+' : ''}{projectedVsGoal.toFixed(0)}</div><div className="small">vs today's goal</div></div>
                  </div>
                </div>
                <div className="ops"><div className="ops-label">Weighted Output / Hr</div><div className="ops-value">{outputPerHour.toFixed(1)}</div></div>
                <div className="ops"><div className="ops-label">Weighted TPH / Total HC</div><div className="ops-value">{currentLiveTPH.toFixed(1)}</div></div>
                <div className="ops"><div className="ops-label">Weighted TPH / Active HC</div><div className="ops-value">{liveTPHActiveHC.toFixed(1)}</div></div>
                <div className="ops"><div className="ops-label">Goal Output / Hr</div><div className="ops-value">{goalOutputPerHour.toFixed(1)}</div></div>
                <div className="ops"><div className="ops-label">Goal TPH / Total HC</div><div className="ops-value">{goalTPHTotalHC.toFixed(1)}</div></div>
                <div className="ops"><div className="ops-label">Goal TPH / Active HC</div><div className="ops-value">{goalTPHActiveHC.toFixed(1)}</div></div>
                <div className="ops"><div className="ops-label">TPH Gap vs Goal</div><div className={`ops-value ${tphGapVsGoal >= 0 ? 'status-good' : 'status-bad'}`}>{tphGapVsGoal >= 0 ? '+' : ''}{tphGapVsGoal.toFixed(1)}</div></div>
                <div className="ops"><div className="ops-label">Efficiency %</div><div className={`ops-value ${efficiencyPct >= 100 ? 'status-good' : efficiencyPct >= 80 ? 'status-warn' : 'status-bad'}`}>{efficiencyPct.toFixed(0)}%</div></div>
                <div className="ops"><div className="ops-label">Projected @ 7.5 TPH</div><div className="ops-value">{projectedOutputAtTargetTPH.toFixed(0)}</div></div>
                <div className="ops"><div className="ops-label">Projected Surplus / Gap</div><div className={`ops-value ${projectedSurplusGap >= 0 ? 'status-good' : 'status-bad'}`}>{projectedSurplusGap >= 0 ? '+' : ''}{projectedSurplusGap.toFixed(0)}</div></div>
                <div className="ops"><div className="ops-label">Weighted Completed</div><div className="ops-value">{weightedDoneWork.toFixed(1)}</div></div>
                <div className="ops"><div className="ops-label">Weighted Goal</div><div className="ops-value">{weightedGoalWork.toFixed(1)}</div></div>
                <div className="ops"><div className="ops-label">Total Head Count</div><div className="ops-value">{totalHeadCount}</div></div>
                <div className="ops"><div className="ops-label">Hours Worked / Remaining</div><div className="ops-value">{shift.hoursWorked.toFixed(1)}h / {shift.remainingHours.toFixed(1)}h</div></div>
              </div>
            </div>
          </div>

          </div>
        <div className="summary-grid kpi-summary-grid">
            {[
              ['Present', counts.present],
              ['Training', counts.training],
              ['Indirect', counts.indirect],
              ['PTO', counts.pto],
              ['LOA', counts.loa],
              ['VTO', counts.vto],
              ['Absent', counts.absent],
              ['Unassigned', counts.unassigned],
              ['Line Leads', counts.lineLeads],
            ].map(([label, value]) => (
              <div className="summary-card kpi-highlight-card" key={label}>
                <div className="summary-label">{label}</div>
                <div className="summary-value">{value}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="table-title-row">
              <div>
                <div className="table-kicker">Rack ID Summary ({state.selectedDay})</div>
                <div className="small">Paste rack IDs with optional material type; counts feed the SPEED TPH numbers automatically.</div>
              </div>
            </div>
            <div className="ops-grid rack-summary-grid">
              <div className="ops"><div className="ops-label">Prepped Rack IDs</div><div className="ops-value">{preppedRackRows.length}</div></div>
              <div className="ops"><div className="ops-label">Processed Rack IDs</div><div className="ops-value">{processedRackRows.length}</div></div>
              <div className="ops wide"><div className="ops-label">Material Types</div><div className="ops-value small-value">{Object.entries([...preppedRackRows, ...processedRackRows].reduce((acc, row) => { acc[row.materialType] = (acc[row.materialType] || 0) + 1; return acc }, {})).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'None'}</div></div>
            </div>

            <div className="table-title-row">
              <div>
                <div className="table-kicker">Line Leads ({state.selectedDay})</div>
                <div className="small">Separate section for people flagged as line leads. They are included in total headcount.</div>
              </div>
            </div>
            <div className="areas-grid">
              <div className={`area ${lineLeadBuilders.length > 0 ? "area-active" : "area-idle"}`}>
                <div className="area-head">
                  <div className="area-head-top">
                    <div className="area-title">Line Leads</div>
                    <div className={`area-count ${lineLeadBuilders.length > 0 ? "filled" : "empty"}`}>{lineLeadBuilders.length}</div>
                  </div>
                  <div className="area-meta">Tracked separately from regular staffing areas</div>
                </div>
                <div className="area-body">
                  {lineLeadBuilders.length ? lineLeadBuilders.map((builder) => {
                    const a = getAssignment(builder.id)
                    const profile = normalizeBuilderProfile(state.builderPool.find((p) => p.id === builder.id) || builder)
                    const flags = builderFlags(profile)
                    return (
                      <div key={builder.id} className={`tag roster-item ${profile.badgeType === 'green' ? 'badge-green-tag' : profile.badgeType === 'night' ? 'badge-night-tag' : 'badge-day-tag'}`}>
                        <div className="tag-head">
                          <button className="tag-name" onClick={() => setSelectedBuilderId(builder.id)}>{builder.name}</button>
                          <div className="tag-badges">
                            <span className={`badge-chip ${badgeTypeClass(profile.badgeType)}`}>{(profile.badgeType || 'day').toUpperCase()}</span>
                            <span className={`status ${metricStatusClass(a.status)}`}>{a.status || 'Present'}</span>
                          </div>
                        </div>
                        {flags.length ? <div className="tag-flags">{flags.map((flag) => <span key={flag} className="skill-chip">{flag}</span>)}</div> : null}
                        {a.clockInTime ? <div className="tag-line"><strong>Clock In:</strong> {a.clockInTime}</div> : null}
                        <div className="tiny">Updated: {a.updatedAt || '—'}</div>
                      </div>
                    )
                  }) : <div className="small">No line leads selected for this day.</div>}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="table-title-row">
              <div>
                <div className="table-kicker">Area Staffing ({state.selectedDay})</div>
                <div className="small">Drag people between areas. The master roster does not count until you add them to a day.</div>
              </div>
            </div>
            <div className="areas-grid">
              {effectiveAreaDefs.map((area) => {
                const people = areaBuilders(area.name)
                return (
                  <div
                    key={area.name}
                    className={`area ${people.length > 0 ? "area-active" : "area-idle"}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDragEnter={(e) => e.currentTarget.classList.add('dragover')}
                    onDragLeave={(e) => e.currentTarget.classList.remove('dragover')}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.currentTarget.classList.remove('dragover')
                      const builderId = draggedBuilderId || e.dataTransfer.getData('text/plain')
                      if (builderId) moveBuilderBetweenAreas(builderId, area.name)
                    }}
                  >
                    <div className="area-head">
                      <div className="area-head-top">
                        <div className="area-title">{area.name}</div>
                        <div className={`area-count ${people.length > 0 ? "filled" : "empty"}`}>{area.capacity ? `${people.length}/${area.capacity}` : people.length}</div>
                      </div>
                      <div className="area-meta">{area.note || 'Drop staff here'}</div>
                    </div>
                    <div className="area-body">
                      {people.length ? people.map((builder) => {
                        const a = getAssignment(builder.id)
                        const profile = normalizeBuilderProfile(state.builderPool.find((p) => p.id === builder.id) || builder)
                        const flags = builderFlags(profile)
                        return (
                          <div
                            key={builder.id}
                            className={`tag roster-item ${profile.badgeType === 'green' ? 'badge-green-tag' : profile.badgeType === 'night' ? 'badge-night-tag' : 'badge-day-tag'}`}
                            draggable
                            onDragStart={(e) => { setDraggedBuilderId(builder.id); e.dataTransfer.setData('text/plain', builder.id) }}
                            onDragEnd={() => setDraggedBuilderId(null)}
                          >
                            <div className="tag-head">
                              <button className="tag-name" onClick={() => setSelectedBuilderId(builder.id)}>{builder.name}</button>
                              <div className="tag-badges">
                                <span className={`badge-chip ${badgeTypeClass(profile.badgeType)}`}>{(profile.badgeType || 'day').toUpperCase()}</span>
                                <span className={`status ${metricStatusClass(a.status)}`}>{a.status || 'Present'}</span>
                              </div>
                            </div>
                            {flags.length ? <div className="tag-flags">{flags.map((flag) => <span key={flag} className="skill-chip">{flag}</span>)}</div> : null}
                            {a.subArea ? <div className="tag-line"><strong>Sub:</strong> {a.subArea}</div> : null}
                            {a.role ? <div className="tag-line"><strong>Role:</strong> {a.role}</div> : null}
                            {a.leaveTime ? <div className="tag-line"><strong>Leave:</strong> {a.leaveTime}</div> : null}
                            {a.clockInTime ? <div className="tag-line"><strong>Clock In:</strong> {a.clockInTime}</div> : null}
                            {a.builderNotes ? <div className="tag-line"><strong>Notes:</strong> {a.builderNotes}</div> : null}
                            <div className="tiny">Updated: {a.updatedAt || '—'}</div>
                          </div>
                        )
                      }) : <div className="small">No one here.</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="summary-card-block card">
            <div className="table-title-row">
              <div>
                <div className="table-kicker">Q1 / Q2 / Q3 Snapshots</div>
                <div className="small">Detailed snapshot view for {state.selectedDay}</div>
              </div>
            </div>
            <div className="snapshot-grid">
              {['q1', 'q2', 'q3'].map((key) => {
                const snap = dayState.snapshots[key]
                return (
                  <div className="snapshot-panel" key={key}>
                    <div className="snapshot-panel-head">
                      <div className="snapshot-name">{key.toUpperCase()} Snapshot</div>
                      <div className="movement-chip">{snap ? 'Captured' : 'Pending'}</div>
                    </div>
                    <div className="small">{snap ? `Captured ${snap.capturedAt}` : 'Not captured yet'}</div>
                    {snap ? (
                      <>
                        <div className="snapshot-stats">
                          <div className="snapshot-stat"><span>Present</span><strong>{snap.totals.present}</strong></div>
                          <div className="snapshot-stat"><span>Staffed</span><strong>{snap.totals.staffed}</strong></div>
                          <div className="snapshot-stat"><span>Unassigned</span><strong>{snap.totals.unassigned}</strong></div>
                        </div>
                        <div className="snapshot-areas">
                          {snap.byArea.filter((r) => r.count > 0).map((r) => <div key={r.area} className="snapshot-area-row"><span>{r.area}</span><strong>{r.count}</strong></div>)}
                        </div>
                      </>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="summary-card-block card">
            <div className="table-title-row">
              <div>
                <div className="table-kicker">Staffing Summary</div>
                <div className="small">{state.selectedDay} live view</div>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Builder</th><th>Status</th><th>Area</th><th>Clock In</th><th>Sub-area</th><th>Role</th><th>Leave</th><th>Comment</th><th>Notes</th><th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBuilders.length ? activeBuilders.map((b) => {
                    const a = getAssignment(b.id)
                    return (
                      <tr key={b.id}>
                        <td>{b.name}</td><td>{a.status || 'Present'}</td><td>{a.area || 'Unassigned'}</td><td>{a.clockInTime || ''}</td>
                        <td>{a.subArea || ''}</td><td>{a.role || ''}</td><td>{a.leaveTime || ''}</td><td>{a.comment || ''}</td><td>{a.builderNotes || ''}</td><td>{a.updatedAt || ''}</td>
                      </tr>
                    )
                  }) : <tr><td colSpan="12" className="small">No one selected for this day from the master list.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="summary-card-block card">
            <div className="table-title-row">
              <div>
                <div className="table-kicker">Weekly Hours Summary</div>
                <div className="small">Total staffed hours by builder and area for Monday to Friday. Hours now use the board day time only, so old calendar dates no longer inflate totals.</div>
              </div>
            </div>
            <div className="table-wrap compact">
              <table>
                <thead><tr><th>Builder</th><th>Area</th><th>Hours</th></tr></thead>
                <tbody>
                  {sumWeeklyBuilderHours(state).length ? sumWeeklyBuilderHours(state).map((r, i) => (
                    <tr key={i}><td>{r.builder}</td><td>{r.area}</td><td>{r.hours}</td></tr>
                  )) : <tr><td colSpan="3" className="small">No weekly hours captured yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="two-col-layout">
            <div className="summary-card-block card">
              <div className="table-title-row">
                <div><div className="table-kicker">Movement History</div><div className="small">Recent changes first</div></div>
              </div>
              <div className="table-wrap compact">
                <table>
                  <thead><tr><th>Time</th><th>Builder</th><th>From</th><th>To</th><th>Note</th></tr></thead>
                  <tbody>
                    {dayState.movementLog.length ? dayState.movementLog.map((m, i) => <tr key={i}><td>{m.timestamp}</td><td>{m.builder}</td><td>{m.fromArea} / {m.fromStatus}</td><td>{m.toArea} / {m.toStatus}</td><td>{m.notes}</td></tr>) : <tr><td colSpan="5" className="small">No movements logged yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="summary-card-block card">
              <div className="table-title-row">
                <div><div className="table-kicker">Attendance History</div><div className="small">Clock-ins, walk-ins, and present records</div></div>
              </div>
              <div className="table-wrap compact">
                <table>
                  <thead><tr><th>Timestamp</th><th>Clock Time</th><th>Builder</th><th>Event</th><th>Note</th></tr></thead>
                  <tbody>
                    {dayState.attendanceLog.length ? dayState.attendanceLog.map((a, i) => <tr key={i}><td>{a.timestamp}</td><td>{a.clock_time}</td><td>{a.builder}</td><td>{a.event}</td><td>{a.note}</td></tr>) : <tr><td colSpan="5" className="small">No attendance events recorded yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        ) : mainTab === 'builders' ? (
        <div className="board-shell">
          <div className="board-header">
            <div>
              <div className="title">Builders & Groups</div>
              <div style={{ marginTop: 8 }}>
                <span className="pill">Master Roster {state.builderPool.length}</span>
                <span className="pill">Groups {state.builderGroups.length}</span>
                <span className="pill">Y{weekInfo.year} · W{String(weekInfo.week).padStart(2, '0')}</span>
                <span className="pill">{state.selectedDay}</span>
              </div>
            </div>
            <div className="board-header-actions">
              <button className="secondary mini-nav-btn" onClick={() => goToWeek(-1)}>← Previous Week</button>
              <button className="secondary mini-nav-btn" onClick={() => switchToWeek(getMondayDate())}>Current Week</button>
              <button className="secondary mini-nav-btn" onClick={() => goToWeek(1)}>Next Week →</button>
              <div className="muted">Manage people and reusable groups, then add a full group to the selected day.</div>
            </div>
          </div>

          <div className="two-col-layout">
            <div className="summary-card-block card">
              <div className="table-title-row">
                <div>
                  <div className="table-kicker">Group Editor</div>
                  <div className="small">Create groups, rename them, and add a whole group to the selected day.</div>
                </div>
              </div>
              <div className="row two">
                <div>
                  <label>Selected Group</label>
                  <select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}>
                    <option value="">Choose a group</option>
                    {state.builderGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div>
                  <label>New Group</label>
                  <div className="row-inline">
                    <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="New group name" />
                    <button className="primary" onClick={addGroup}>Add</button>
                  </div>
                </div>
              </div>
              {selectedGroup ? (
                <>
                  <div className="row-inline">
                    <input value={selectedGroup.name} onChange={(e) => renameGroup(selectedGroup.id, e.target.value)} />
                    <button className="primary" onClick={() => addGroupToDay(selectedGroup.id)}>Add Group To {state.selectedDay}</button>
                    <button className="danger-lite" onClick={() => deleteGroup(selectedGroup.id)}>Delete</button>
                  </div>
                  <div className="builder-picker-list">
                    {state.builderPool.map((b) => {
                      const inGroup = (selectedGroup.builderIds || []).includes(b.id)
                      return (
                        <label key={b.id} className={`builder-pick-row ${inGroup ? 'selected' : ''}`}>
                          <input type="checkbox" checked={inGroup} onChange={() => toggleBuilderInGroup(selectedGroup.id, b.id)} />
                          <span>{b.name}</span>
                          <span className={`badge-chip ${badgeTypeClass(b.badgeType)}`}>{(b.badgeType || 'day').toUpperCase()}</span>
                        </label>
                      )
                    })}
                  </div>
                </>
              ) : <div className="small">Choose or create a group first.</div>}
            </div>

            <div className="summary-card-block card">
              <div className="table-title-row">
                <div>
                  <div className="table-kicker">Groups Overview</div>
                  <div className="small">Reusable groups available for quick add-to-day actions.</div>
                </div>
              </div>
              <div className="group-summary-list">
                {state.builderGroups.length ? state.builderGroups.map((g) => (
                  <div key={g.id} className="group-summary-card">
                    <div className="group-summary-head">
                      <strong>{g.name}</strong>
                      <span className="small">{(g.builderIds || []).length} people</span>
                    </div>
                    <div className="analysis-chip-wrap">
                      {state.builderPool.filter((b) => (g.builderIds || []).includes(b.id)).map((b) => (
                        <span className="analysis-chip" key={b.id}>{b.name}</span>
                      ))}
                    </div>
                  </div>
                )) : <div className="small">No groups yet.</div>}
              </div>
            </div>
          </div>

          <div className="two-col-layout">
            <div className="summary-card-block card">
              <div className="table-title-row">
                <div>
                  <div className="table-kicker">Permanent Master Roster</div>
                  <div className="small">Add, search, export, import, and add people to the selected day.</div>
                </div>
              </div>
              <div className="row">
                <input id="newBuilderName" placeholder="Add person to permanent list" />
                <button className="primary" onClick={addPoolBuilder}>Add to Master List</button>
              </div>
              <div className="row two">
                <button className="secondary" onClick={exportRosterCsv}>Export Master CSV</button>
                <label className="secondary" style={{ display: 'block', padding: '10px 12px', borderRadius: '12px', cursor: 'pointer', textAlign: 'center' }}>
                  Import Master CSV
                  <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && importRosterCsv(e.target.files[0])} />
                </label>
              </div>
              <div className="row">
                <input value={builderListFilter} onChange={(e) => setBuilderListFilter(e.target.value)} placeholder="Search master list by name, badge, or skill" />
              </div>
              <div className="pool-list builders-tab-pool-list">
                {filteredBuilderPool.length ? filteredBuilderPool.map((b) => {
                  const already = !!dayState.assignments[b.id]
                  const flags = builderFlags(b)
                  return (
                    <div key={b.id} className="pool-row" onClick={() => setSelectedPoolBuilderId(b.id)}>
                      <div className="pool-row-main">
                        <div className="pool-name-line">
                          <span className={`badge-chip ${badgeTypeClass(b.badgeType)}`}>{(b.badgeType || 'day').toUpperCase()}</span>
                          <strong>{b.name}</strong>
                        </div>
                        {flags.length ? <div className="pool-flags">{flags.map((flag) => <span key={flag} className="skill-chip">{flag}</span>)}</div> : <div className="small">No equipment or role flags set.</div>}
                      </div>
                      <div className="pool-actions">
                        <button className="mini-btn" onClick={(e) => { e.stopPropagation(); activateBuilderForDay(b.id) }}>{already ? 'Selected' : `Add to ${state.selectedDay}`}</button>
                        <button className="mini-btn danger-lite" onClick={(e) => { e.stopPropagation(); removePoolBuilder(b.id) }}>Remove</button>
                      </div>
                    </div>
                  )
                }) : <div className="small">No people match this filter.</div>}
              </div>
            </div>

            <div className="summary-card-block card">
              <div className="table-title-row">
                <div>
                  <div className="table-kicker">Edit Master Roster Profile</div>
                  <div className="small">Update badge group, quick role flags, and line lead status for the selected person.</div>
                </div>
              </div>
              <div className="row">
                <div><label>Selected Person</label><select value={selectedPoolBuilderId} onChange={(e) => setSelectedPoolBuilderId(e.target.value)}>
                  {state.builderPool.length ? state.builderPool.map((b) => <option key={b.id} value={b.id}>{b.name}</option>) : <option value="">No one in master roster</option>}
                </select></div>
              </div>
              {selectedPoolBuilder ? (
                <>
                  <div className="row">
                    <div><label>Name</label><input value={selectedPoolBuilder.name || ''} onChange={(e) => renamePoolBuilder(selectedPoolBuilderId, e.target.value)} /></div>
                  </div>
                  <div className="row two">
                    <div><label>Badge Group</label><select value={selectedPoolBuilder.badgeType || 'day'} onChange={(e) => updatePoolBuilder(selectedPoolBuilderId, { badgeType: e.target.value })}>
                      <option value="day">Day Badge</option>
                      <option value="night">Night Badge</option>
                      <option value="green">Green Badge</option>
                    </select></div>
                    <div><label>Quick Role Flags</label><div className="small">Training and support roles below</div></div>
                  </div>
                  <div className="row three">
                    <label className="check-pill"><input type="checkbox" checked={!!selectedPoolBuilder.trainedTdr} onChange={(e) => updatePoolBuilder(selectedPoolBuilderId, { trainedTdr: e.target.checked })} />TDR</label>
                    <label className="check-pill"><input type="checkbox" checked={!!selectedPoolBuilder.trainedForklift} onChange={(e) => updatePoolBuilder(selectedPoolBuilderId, { trainedForklift: e.target.checked })} />Forklift</label>
                    <label className="check-pill"><input type="checkbox" checked={!!selectedPoolBuilder.trainedCenterRider} onChange={(e) => updatePoolBuilder(selectedPoolBuilderId, { trainedCenterRider: e.target.checked })} />Center Rider</label>
                  </div>
                  <div className="row three">
                    <label className="check-pill"><input type="checkbox" checked={!!selectedPoolBuilder.trainedClampTruck} onChange={(e) => updatePoolBuilder(selectedPoolBuilderId, { trainedClampTruck: e.target.checked })} />Clamp Truck</label>
                    <label className="check-pill"><input type="checkbox" checked={!!selectedPoolBuilder.isTrainer} onChange={(e) => updatePoolBuilder(selectedPoolBuilderId, { isTrainer: e.target.checked })} />Trainer</label>
                    <label className="check-pill"><input type="checkbox" checked={!!selectedPoolBuilder.isSafetyMember} onChange={(e) => updatePoolBuilder(selectedPoolBuilderId, { isSafetyMember: e.target.checked })} />Safety Member</label>
                  </div>
                  <div className="row">
                    <label className="check-pill"><input type="checkbox" checked={!!selectedPoolBuilder.isLineLead} onChange={(e) => updatePoolBuilder(selectedPoolBuilderId, { isLineLead: e.target.checked })} />Line Lead</label>
                  </div>
                </>
              ) : <div className="small">Add someone to the master roster first.</div>}
            </div>
          </div>

          <div className="summary-card-block card">
            <div className="table-title-row">
              <div>
                <div className="table-kicker">Master Roster</div>
                <div className="small">All people in the permanent roster.</div>
              </div>
            </div>
            <div className="analysis-table-wrap compact">
              <table>
                <thead>
                  <tr><th>Name</th><th>Badge</th><th>Skills / Roles</th><th>Groups</th></tr>
                </thead>
                <tbody>
                  {state.builderPool.length ? state.builderPool.map((b) => (
                    <tr key={b.id}>
                      <td>{b.name}</td>
                      <td>{(b.badgeType || 'day').toUpperCase()}</td>
                      <td>{builderFlags(b).join(', ') || '—'}</td>
                      <td>{state.builderGroups.filter((g) => (g.builderIds || []).includes(b.id)).map((g) => g.name).join(', ') || '—'}</td>
                    </tr>
                  )) : <tr><td colSpan="4" className="small">No builders yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        ) : mainTab === 'comments' ? (
        <div className="board-shell">
          <div className="board-header">
            <div>
              <div className="title">Comments & Voice</div>
              <div style={{ marginTop: 8 }}>
                <span className="pill">Week of {state.weekStartDate}</span>
                <span className="pill">Y{weekInfo.year} · W{String(weekInfo.week).padStart(2, '0')}</span>
                <span className="pill">{state.selectedDay}</span>
              </div>
            </div>
            <div className="muted">Capture safety observations, shoutouts, concerns, and builder feedback for the week.</div>
          </div>

          <div className="two-col-layout">
            <div className="summary-card-block card comments-type-card comments-safety">
              <div className="table-title-row"><div><div className="table-kicker">🛡 Safety Observations</div><div className="small">Hazards, safe behaviors, and follow-ups.</div></div></div>
              <textarea className="comments-box" value={state.commentsBoard.safetyObservations || ''} onChange={(e) => saveState((prev) => ({ ...prev, commentsBoard: { ...prev.commentsBoard, safetyObservations: e.target.value } }))} />
            </div>
            <div className="summary-card-block card comments-type-card comments-shoutouts">
              <div className="table-title-row"><div><div className="table-kicker">⭐ Performance Shoutouts</div><div className="small">Wins, recognition, and standout support.</div></div></div>
              <textarea className="comments-box" value={state.commentsBoard.performanceShoutouts || ''} onChange={(e) => saveState((prev) => ({ ...prev, commentsBoard: { ...prev.commentsBoard, performanceShoutouts: e.target.value } }))} />
            </div>
          </div>

          <div className="two-col-layout">
            <div className="summary-card-block card comments-type-card comments-concerns">
              <div className="table-title-row"><div><div className="table-kicker">⚠️ Concerns</div><div className="small">Process gaps, staffing risks, misses, and blockers.</div></div></div>
              <textarea className="comments-box" value={state.commentsBoard.concerns || ''} onChange={(e) => saveState((prev) => ({ ...prev, commentsBoard: { ...prev.commentsBoard, concerns: e.target.value } }))} />
            </div>
            <div className="summary-card-block card comments-type-card comments-voice">
              <div className="table-title-row"><div><div className="table-kicker">🗣 Builder Voice</div><div className="small">Feedback directly from builders.</div></div></div>
              <textarea className="comments-box" value={state.commentsBoard.builderVoice || ''} onChange={(e) => saveState((prev) => ({ ...prev, commentsBoard: { ...prev.commentsBoard, builderVoice: e.target.value } }))} />
            </div>
          </div>

          <div className="summary-card-block card comments-type-card comments-suggestions">
            <div className="table-title-row"><div><div className="table-kicker">💡 Suggestions</div><div className="small">Ideas for improvement, trials, or next steps.</div></div></div>
            <textarea className="comments-box large" value={state.commentsBoard.suggestions || ''} onChange={(e) => saveState((prev) => ({ ...prev, commentsBoard: { ...prev.commentsBoard, suggestions: e.target.value } }))} />
          </div>
        </div>
        ) : (
        <div className="board-shell" ref={analysisCaptureRef}>

          <div className="board-header">
            <div>
              <div className="title">Weekly Analysis</div>
              <div style={{ marginTop: 8 }}>
                <span className="pill">Current Week {state.weekStartDate}</span>
                <span className="pill">Y{weekInfo.year} · W{String(weekInfo.week).padStart(2, '0')}</span>
                <span className="pill">History Stored {analysisWeeks.length} / 4</span>
                <span className="pill">{state.boardShift}</span>
              </div>
            </div>
            <div className="board-header-actions">
              <button className="secondary mini-nav-btn" onClick={() => goToWeek(-1)}>← Previous Week</button>
              <button className="secondary mini-nav-btn" onClick={() => switchToWeek(getMondayDate())}>Current Week</button>
              <button className="secondary mini-nav-btn" onClick={() => goToWeek(1)}>Next Week →</button>
              <div className="muted">Comparison across up to 4 saved weeks</div>
            </div>
          </div>

          <div className="summary-card-block card">
            <div className="table-title-row">
              <div>
                <div className="table-kicker">Saved Week History</div>
                <div className="small">Only weeks with real data are stored in comparison, and each saved week keeps its own board state.</div>
              </div>
              <div className="pool-actions">
                <button className="secondary mini-btn" onClick={saveCurrentWeekSnapshot}>Save Current Week Snapshot</button>
              </div>
            </div>
            <div className="analysis-table-wrap compact">
              <table>
                <thead>
                  <tr>
                    <th>Week Start</th>
                    <th>Year / Week</th>
                    <th>Stored</th>
                    <th>Recovery</th>
                    <th>Prep</th>
                    <th>Media</th>
                    <th>Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {savedWeekRows.length ? savedWeekRows.map((row) => (
                    <tr key={row.weekStartDate}>
                      <td>{row.weekStartDate}</td>
                      <td>Y{row.year} / W{String(row.week).padStart(2, '0')}</td>
                      <td><span className={row.hasData ? 'status-good' : 'status-bad'}>{row.hasData ? 'Saved' : 'Empty'}</span></td>
                      <td>{row.recovery}</td>
                      <td>{row.prep}</td>
                      <td>{row.media}</td>
                      <td>{Number(row.hours).toFixed(2)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan="7" className="small">No saved weeks yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="summary-grid">
            {[
              ['Recovery This Week', currentWeekAnalysis.totals.recoveryProcessed, `${trendArrow(recoveryTrend)} ${Math.abs(recoveryTrend).toFixed(0)}%`],
              ['Prep This Week', currentWeekAnalysis.totals.rackPrepDone, `${trendArrow(prepTrend)} ${Math.abs(prepTrend).toFixed(0)}%`],
              ['Media Count', currentWeekAnalysis.totals.totalMediaCount, `${trendArrow(mediaTrend)} ${Math.abs(mediaTrend).toFixed(0)}%`],
              ['Media Processed', currentWeekAnalysis.totals.mediaProcessed, ''],
              ['Staffed Hours', currentWeekAnalysis.totals.staffedHours, `${trendArrow(hoursTrend)} ${Math.abs(hoursTrend).toFixed(0)}%`],
              ['Avg TPH Today', currentLiveTPH.toFixed(2), ''],
              ['Avg TPH Week', weekAvgTPH.toFixed(2), `${trendArrow(tphTrend)} ${Math.abs(tphTrend).toFixed(0)}%`],
              ['Efficiency Score', `${avgEfficiency.toFixed(0)}%`, ''],
              ['Work per Builder', workPerBuilder.toFixed(2), ''],
              ['Pace Status', `${paceStatus} ${paceGap >= 0 ? '▲' : '▼'} ${Math.abs(paceGap).toFixed(2)}`, ''],
            ].map(([label, value, trend]) => (
              <div className="summary-card kpi-highlight-card" key={label}>
                <div className="summary-label">{label}</div>
                <div className="summary-value">{value}</div>
                {trend ? <div className="summary-trend">{trend}</div> : null}
              </div>
            ))}
          </div>

          <div className="two-col-layout">
            <div className="summary-card-block card">
              <div className="table-title-row">
                <div>
                  <div className="table-kicker">Forecast</div>
                  <div className="small">Projected end-of-shift output at current pace.</div>
                </div>
              </div>
              <div className="ops-summary-grid">
                <div className="ops-summary-item"><span>Projected Recovery</span><strong>{projectedRecovery.toFixed(0)}</strong></div>
                <div className="ops-summary-item"><span>Projected Prep</span><strong>{projectedPrep.toFixed(0)}</strong></div>
                <div className="ops-summary-item"><span>Projected Media</span><strong>{projectedMedia.toFixed(0)}</strong></div>
                <div className="ops-summary-item"><span>Projected TPH</span><strong>{projectedTPH.toFixed(2)}</strong></div>
              </div>
            </div>

            <div className="summary-card-block card">
              <div className="table-title-row">
                <div>
                  <div className="table-kicker">Executive Summary</div>
                  <div className="small">Fast weekly readout for leadership.</div>
                </div>
              </div>
              <div className="ops-summary-grid">
                <div className="ops-summary-item"><span>Headcount</span><strong>{actualHeadcount}</strong></div>
                <div className="ops-summary-item"><span>Attendance Variance</span><strong className={attendanceVariancePct >= 0 ? 'status-good' : 'status-bad'}>{attendanceVariancePct.toFixed(0)}%</strong></div>
                <div className="ops-summary-item"><span>Avg TPH Week</span><strong>{weekAvgTPH.toFixed(2)}</strong></div>
                <div className="ops-summary-item"><span>Status</span><strong className={paceStatus === 'Ahead' ? 'status-good' : paceGap > -0.5 ? 'status-warn' : 'status-bad'}>{paceStatus}</strong></div>
                <div className="ops-summary-item"><span>Top Area</span><strong>{topArea}</strong></div>
                <div className="ops-summary-item"><span>Area Eff.</span><strong>{Number(topAreaEfficiency || 0).toFixed(2)}</strong></div>
              </div>
            </div>
          </div>

          <div className="two-col-layout">
            <div className="summary-card-block card">
              <div className="table-title-row">
                <div>
                  <div className="table-kicker">Goal Attainment</div>
                  <div className="small">Current day completion against configured goals.</div>
                </div>
              </div>
              <div className="goal-metric-list">
                {[
                  ['Recovery', recoveryPct],
                  ['Prep', prepPct],
                  ['Media', mediaPct],
                ].map(([label, pct]) => (
                  <div key={label} className="goal-metric-row">
                    <div className="goal-metric-head">
                      <span>{label}</span>
                      <strong>{Number(pct).toFixed(0)}%</strong>
                    </div>
                    <div className="chart-bar-wrap">
                      <div className={`chart-bar ${pct >= 100 ? 'tone-green' : pct >= 80 ? 'tone-yellow' : 'tone-red'}`} style={{ width: `${Math.max(4, Math.min(100, Number(pct) || 0))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="summary-card-block card">
              <div className="table-title-row">
                <div>
                  <div className="table-kicker">Pace Overview</div>
                  <div className="small">Required pace versus actual progress right now.</div>
                </div>
              </div>
              <div className="ops-summary-box">
                <div className="ops-summary-item"><span>Required TPH</span><strong>{metrics.requiredTPH.toFixed(2)}</strong></div>
                <div className="ops-summary-item"><span>Current Live TPH</span><strong>{currentLiveTPH.toFixed(2)}</strong></div>
                <div className="ops-summary-item"><span>Goal TPH</span><strong>{metrics.targetTPH.toFixed(2)}</strong></div>
                <div className="ops-summary-item"><span>Status</span><strong className={paceStatus === 'Ahead' ? 'status-good' : 'status-bad'}>{paceStatus}</strong></div>
              </div>
            </div>
          </div>

          <div className="two-col-layout">
            <BarChartCard title="Weekly Recovery Comparison" subtitle="Media recovery racks completed by week" data={weekComparisonRacks} tone="blue" />
            <BarChartCard title="Weekly Prep Comparison" subtitle="Racks done in prep by week" data={weekComparisonPrep} tone="green" />
          </div>

          <div className="two-col-layout">
            <BarChartCard title="Weekly Media Count Comparison" subtitle="Total media count by week" data={weekComparisonMedia} tone="purple" />
            <BarChartCard title="Weekly Staffed Hours Comparison" subtitle="Total staffed hours by week" data={weekComparisonHours} tone="amber" format={(v) => Number(v).toFixed(2)} />
          </div>

          <div className="two-col-layout">
            <BarChartCard title="Current Week Area Hours" subtitle="Hours worked in each area this week" data={currentWeekAreaHours} tone="blue" format={(v) => Number(v).toFixed(2)} />
            <BarChartCard title="Area Efficiency" subtitle="Estimated workload per staffed hour by area" data={currentWeekAreaEfficiency} tone="purple" format={(v) => Number(v).toFixed(2)} />
          </div>

          <div className="two-col-layout">
            <BarChartCard title="Current Week Daily Workload" subtitle="Recovery + prep + media/6.4 by day" data={currentWeekDayWork} tone="green" format={(v) => Number(v).toFixed(1)} />
            <div className="summary-card-block card">
              <div className="table-title-row">
                <div>
                  <div className="table-kicker">Simple Ops Summary</div>
                  <div className="small">Quick daily leadership readout.</div>
                </div>
              </div>
              <div className="ops-summary-grid">
                <div className="ops-summary-item"><span>Headcount</span><strong>{totalHeadCount}</strong></div>
                <div className="ops-summary-item"><span>Avg TPH Today</span><strong>{currentLiveTPH.toFixed(2)}</strong></div>
                <div className="ops-summary-item"><span>Required TPH</span><strong>{metrics.requiredTPH.toFixed(2)}</strong></div>
                <div className="ops-summary-item"><span>Recovery %</span><strong>{recoveryPct.toFixed(0)}%</strong></div>
                <div className="ops-summary-item"><span>Prep %</span><strong>{prepPct.toFixed(0)}%</strong></div>
                <div className="ops-summary-item"><span>Media %</span><strong>{mediaPct.toFixed(0)}%</strong></div>
              </div>
            </div>
          </div>

          <div className="summary-card-block card">
            <div className="table-title-row">
              <div>
                <div className="table-kicker">Area Staffing Pressure</div>
                <div className="small">Hours, share of labor, and estimated efficiency by area.</div>
              </div>
            </div>
            <div className="analysis-table-wrap compact">
              <table>
                <thead>
                  <tr>
                    <th>Area</th>
                    <th>Hours</th>
                    <th>Labor Share</th>
                    <th>Efficiency</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pressureAreas.length ? pressureAreas.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td>{row.value.toFixed(2)}</td>
                      <td>{row.laborShare.toFixed(0)}%</td>
                      <td>{row.efficiency.toFixed(2)}</td>
                      <td><span className={row.status === 'Green' ? 'status-good' : row.status === 'Yellow' ? 'status-warn' : 'status-bad'}>{row.status}</span></td>
                    </tr>
                  )) : (
                    <tr><td colSpan="5" className="small">No area pressure data yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="summary-card-block card">
            <div className="table-title-row">
              <div>
                <div className="table-kicker">Builder Weekly Area Hours Table</div>
                <div className="small">Hours each builder spent in each area for the selected week.</div>
              </div>
            </div>
            <div className="analysis-table-wrap compact">
              <table>
                <thead>
                  <tr>
                    <th>Builder</th>
                    <th>Total Hours</th>
                    <th>Area Breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {builderWeeklyAreaHours.length ? builderWeeklyAreaHours.map((row) => (
                    <tr key={row.builder.id}>
                      <td>{row.builder.name}</td>
                      <td>{row.totalHours.toFixed(2)}</td>
                      <td>
                        <div className="analysis-chip-wrap">
                          {row.areas.map(([area, hours]) => (
                            <span key={area} className="analysis-chip">{area}: {hours.toFixed(2)}h</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="3" className="muted">No staffed hours recorded yet for this week.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="summary-card-block card">
            <div className="table-title-row">
              <div>
                <div className="table-kicker">4-Week Comparison Table</div>
                <div className="small">Rolling weekly history kept in the program for the latest four week starts.</div>
              </div>
            </div>
            <div className="table-wrap compact">
              <table>
                <thead>
                  <tr><th>Week Start</th><th>Recovery Done</th><th>Prep Done</th><th>Total Media Count</th><th>Media Processed</th><th>Staffed Hours</th></tr>
                </thead>
                <tbody>
                  {analysisWeeks.map((w) => (
                    <tr key={w.weekStartDate}>
                      <td>{w.weekStartDate}</td>
                      <td>{w.totals.recoveryProcessed}</td>
                      <td>{w.totals.rackPrepDone}</td>
                      <td>{w.totals.totalMediaCount}</td>
                      <td>{w.totals.mediaProcessed}</td>
                      <td>{Number(w.totals.staffedHours).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )}
        <div className="pdf-report-host" aria-hidden="true">
          <div ref={dailyPdfRef} className="pdf-report-sheet">
            <div className="pdf-report-header">
              <div>
                <div className="pdf-report-kicker">Daily Operations Report</div>
                <div className="pdf-report-title">{state.boardTitle}</div>
                <div className="pdf-report-meta">Week of {state.weekStartDate} - {state.selectedDay} - {state.boardShift}</div>
              </div>
              <div className="pdf-report-meta-stack">
                <div><span>Admin</span><strong>{state.adminName || 'Not set'}</strong></div>
                <div><span>Generated</span><strong>{new Date().toLocaleString()}</strong></div>
              </div>
            </div>

            <div className="pdf-kpi-grid">
              {[
                ['Headcount', totalHeadCount],
                ['Goal TPH', metrics.targetTPH.toFixed(2)],
                ['Required TPH', metrics.requiredTPH.toFixed(2)],
                ['Remaining Work', metrics.remainingWork.toFixed(1)],
                ['Recovery %', `${recoveryPct.toFixed(0)}%`],
                ['Prep %', `${prepPct.toFixed(0)}%`],
                ['Media %', `${mediaPct.toFixed(0)}%`],
                ['Avg TPH Today', currentLiveTPH.toFixed(2)],
              ].map(([label, value]) => (
                <div className="pdf-kpi-card" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>

            <div className="pdf-two-col">
              <SimpleBarChart
                title="Goal Attainment"
                subtitle="Daily progress against configured goals"
                data={[
                  { label: 'Recovery', value: recoveryPct },
                  { label: 'Prep', value: prepPct },
                  { label: 'Media', value: mediaPct },
                ]}
                tone="green"
                format={(v) => `${Number(v).toFixed(0)}%`}
              />
              <SimpleBarChart
                title="Area Staffing"
                subtitle="Headcount assigned by area"
                data={areaCounts.filter((a) => a.name !== 'Unassigned' && a.count > 0).map((a) => ({ label: a.name, value: a.count }))}
                tone="blue"
                format={(v) => Number(v).toFixed(0)}
              />
            </div>

            <div className="pdf-two-col">
              <div className="pdf-chart-card">
                <div className="pdf-chart-title">Daily Summary</div>
                <table className="pdf-mini-table">
                  <tbody>
                    <tr><td>Recovery Goal / Done</td><td>{metrics.recoveryGoal} / {metrics.recoveryProcessed}</td></tr>
                    <tr><td>Prep Goal / Done</td><td>{metrics.rackPrepGoal} / {metrics.rackPrepOutput.toFixed(1)}</td></tr>
                    <tr><td>Media Goal / Done</td><td>{metrics.mediaGoal} / {metrics.mediaProcessed}</td></tr>
                    <tr><td>Present / Training / Indirect</td><td>{counts.present} / {counts.training} / {counts.indirect}</td></tr>
                    <tr><td>PTO / LOA / VTO / Absent</td><td>{counts.pto} / {counts.loa} / {counts.vto} / {counts.absent}</td></tr>
                    <tr><td>Unassigned / Line Leads</td><td>{counts.unassigned} / {counts.lineLeads}</td></tr>
                  </tbody>
                </table>
              </div>
              <SimpleBarChart
                title="Area Hours This Week"
                subtitle="Staffed hours by area"
                data={currentWeekAreaHours.slice(0, 8)}
                tone="purple"
                format={(v) => Number(v).toFixed(1)}
              />
            </div>
          </div>

          <div ref={weeklyPdfRef} className="pdf-report-sheet">
            <div className="pdf-report-header">
              <div>
                <div className="pdf-report-kicker">Weekly Operations Report</div>
                <div className="pdf-report-title">{state.boardTitle}</div>
                <div className="pdf-report-meta">Week of {state.weekStartDate} - Monday to Friday</div>
              </div>
              <div className="pdf-report-meta-stack">
                <div><span>Admin</span><strong>{state.adminName || 'Not set'}</strong></div>
                <div><span>Generated</span><strong>{new Date().toLocaleString()}</strong></div>
              </div>
            </div>

            <div className="pdf-kpi-grid">
              {[
                ['Weekly Recovery', currentWeekAnalysis.totals.recoveryProcessed],
                ['Weekly Prep', currentWeekAnalysis.totals.rackPrepDone],
                ['Weekly Media Count', currentWeekAnalysis.totals.totalMediaCount],
                ['Weekly Media Done', currentWeekAnalysis.totals.mediaProcessed],
                ['Weekly Staffed Hours', currentWeekAnalysis.totals.staffedHours],
                ['Weekly Avg TPH', weekAvgTPH.toFixed(2)],
                ['Efficiency Score', `${avgEfficiency.toFixed(0)}%`],
                ['Work / Builder', workPerBuilder.toFixed(2)],
              ].map(([label, value]) => (
                <div className="pdf-kpi-card" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>

            <div className="pdf-two-col">
              <SimpleBarChart
                title="Weekly Comparison - Recovery"
                subtitle="Recent weeks"
                data={weekComparisonRacks}
                tone="blue"
                format={(v) => Number(v).toFixed(0)}
              />
              <SimpleBarChart
                title="Weekly Comparison - Prep"
                subtitle="Recent weeks"
                data={weekComparisonPrep}
                tone="green"
                format={(v) => Number(v).toFixed(0)}
              />
            </div>

            <div className="pdf-two-col">
              <SimpleBarChart
                title="Weekly Comparison - Media"
                subtitle="Recent weeks"
                data={weekComparisonMedia}
                tone="purple"
                format={(v) => Number(v).toFixed(0)}
              />
              <SimpleBarChart
                title="Weekly Comparison - Staffed Hours"
                subtitle="Recent weeks"
                data={weekComparisonHours}
                tone="amber"
                format={(v) => Number(v).toFixed(1)}
              />
            </div>

            <div className="pdf-two-col">
              <SimpleBarChart
                title="Daily Workload by Day"
                subtitle="Recovery + prep + media/6.4"
                data={currentWeekDayWork}
                tone="green"
                format={(v) => Number(v).toFixed(1)}
              />
              <SimpleBarChart
                title="Area Hours by Week"
                subtitle="Top staffed areas"
                data={currentWeekAreaHours.slice(0, 10)}
                tone="blue"
                format={(v) => Number(v).toFixed(1)}
              />
            </div>

            <div className="pdf-chart-card">
              <div className="pdf-chart-title">Weekly Overview</div>
              <table className="pdf-mini-table">
                <thead>
                  <tr><th>Day</th><th>Recovery</th><th>Prep</th><th>Media Count</th><th>Media Done</th><th>Staffed Hours</th></tr>
                </thead>
                <tbody>
                  {(currentWeekAnalysis.byDay || []).map((d) => (
                    <tr key={d.day}>
                      <td>{d.day}</td>
                      <td>{d.recoveryProcessed}</td>
                      <td>{d.rackPrepDone}</td>
                      <td>{d.totalMediaCount}</td>
                      <td>{d.mediaProcessed}</td>
                      <td>{Number(d.staffedHours).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </main>
    </div>
  )
}


function AuthGate() {
  const [auth, setAuth] = useState(() => {
    const token = localStorage.getItem('staffboard2_token') || ''
    const user = JSON.parse(localStorage.getItem('staffboard2_user') || 'null')
    return { token, user, checked: !token }
  })
  const [form, setForm] = useState({ username: '', password: '', error: '' })

  useEffect(() => {
    if (!auth.token) return
    fetch('/api/me', { headers: { Authorization: `Bearer ${auth.token}` } })
      .then((res) => {
        if (!res.ok) throw new Error('Session expired')
        return res.json()
      })
      .then((data) => {
        localStorage.setItem('staffboard2_user', JSON.stringify(data.user))
        setAuth((prev) => ({ ...prev, user: data.user, checked: true }))
      })
      .catch(() => {
        localStorage.removeItem('staffboard2_token')
        localStorage.removeItem('staffboard2_user')
        setAuth({ token: '', user: null, checked: true })
      })
  }, [auth.token])

  async function handleLogin(e) {
    e.preventDefault()
    setForm((prev) => ({ ...prev, error: '' }))
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.username, password: form.password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Login failed')
      localStorage.setItem('staffboard2_token', data.token)
      localStorage.setItem('staffboard2_user', JSON.stringify(data.user))
      setAuth({ token: data.token, user: data.user, checked: true })
    } catch (err) {
      setForm((prev) => ({ ...prev, error: err.message }))
    }
  }

  function logout() {
    localStorage.removeItem('staffboard2_token')
    localStorage.removeItem('staffboard2_user')
    setAuth({ token: '', user: null, checked: true })
  }

  if (!auth.checked) {
    return <div className="login-page"><div className="login-card"><h1>StaffBoard 2.0</h1><p>Checking session...</p></div></div>
  }

  if (!auth.token) {
    return (
      <div className="login-page">
        <form className="login-card" onSubmit={handleLogin}>
          <h1>StaffBoard 2.0</h1>
          <p>Admin access required.</p>
          <label>Username</label>
          <input value={form.username} onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))} autoFocus />
          <label>Password</label>
          <input type="password" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} />
          {form.error ? <div className="login-error">{form.error}</div> : null}
          <button className="primary login-button" type="submit">Login</button>
        </form>
      </div>
    )
  }

  return <StaffBoardApp user={auth.user} onLogout={logout} />
}

export default AuthGate
