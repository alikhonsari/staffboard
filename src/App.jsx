
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import './styles.css'

const SHIFT_HOURS = 8
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const STATUSES = ['Present', 'Training', 'Indirect', 'PTO', 'LOA', 'VTO', 'Absent']

const TEMPLATE_PRESETS = {
  speed: {
    label: 'SPEED',
    description: 'Rack recovery, rack prep, and media output.',
    areas: [
      'Unassigned', 'Rack Prep', 'OB1', 'OB2', 'Speed Lite',
      'Speed Line 1', 'Speed Line 2', 'Speed Line 3',
      'Shipping', 'EOS Pull Racks', 'Projects', 'Learning', '1:1',
      'Media Destruction', 'Network Rack Recovery', 'Network Rack Prep',
    ],
    workTypes: [
      { id: 'recovery', name: 'Recovery Racks', weight: 6.4, unit: 'racks' },
      { id: 'prep', name: 'Prep Racks', weight: 6.4, unit: 'racks' },
      { id: 'media', name: 'Media', weight: 1, unit: 'media' },
    ],
  },
  fa_lab: {
    label: 'FA Lab',
    description: 'Raw flexible lab work layout. Adjust weights when you collect real standards.',
    areas: ['Unassigned', 'FA Intake', 'Diagnostics', 'Failure Analysis', 'Repair', 'QA / Audit', 'Shipping', 'Projects', 'Learning', '1:1'],
    workTypes: [
      { id: 'intake', name: 'Intake', weight: 1, unit: 'units' },
      { id: 'diagnostics', name: 'Diagnostics', weight: 1, unit: 'units' },
      { id: 'repair', name: 'Repair', weight: 2, unit: 'units' },
      { id: 'qa', name: 'QA / Audit', weight: 0.5, unit: 'units' },
      { id: 'rework', name: 'Rework', weight: 1.5, unit: 'units' },
    ],
  },
  bodega: {
    label: 'Bodega',
    description: 'Raw flexible warehouse work layout. Adjust work types and weights as needed.',
    areas: ['Unassigned', 'Inbound', 'Picking', 'Packing', 'Inventory', 'Staging', 'Shipping', 'Projects', 'Learning', '1:1'],
    workTypes: [
      { id: 'inbound', name: 'Inbound', weight: 1, unit: 'units' },
      { id: 'pick', name: 'Pick', weight: 1, unit: 'orders' },
      { id: 'pack', name: 'Pack', weight: 1, unit: 'orders' },
      { id: 'inventory', name: 'Inventory', weight: 0.5, unit: 'counts' },
      { id: 'ship', name: 'Ship', weight: 1, unit: 'orders' },
      { id: 'pallet', name: 'Pallet / Tote', weight: 2, unit: 'loads' },
    ],
  },
}

const BOARDS = {
  speed_day: { label: 'SPEED Day Shift', templateId: 'speed', shiftName: 'Day Shift' },
  speed_night: { label: 'SPEED Night Shift', templateId: 'speed', shiftName: 'Night Shift' },
  fa_day: { label: 'FA Lab Day Shift', templateId: 'fa_lab', shiftName: 'Day Shift' },
  fa_night: { label: 'FA Lab Night Shift', templateId: 'fa_lab', shiftName: 'Night Shift' },
  bodega_day: { label: 'Bodega Day Shift', templateId: 'bodega', shiftName: 'Day Shift' },
  bodega_night: { label: 'Bodega Night Shift', templateId: 'bodega', shiftName: 'Night Shift' },
}

function todayMonday() {
  return toMonday(new Date().toISOString().slice(0, 10))
}

function toMonday(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function nowString() {
  return new Date().toISOString()
}

function makeId(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function getWorkKey(workTypeId, kind) {
  return `${workTypeId}_${kind}`
}

function defaultWorkValues(template) {
  const values = {}
  template.workTypes.forEach((w) => {
    values[getWorkKey(w.id, 'goal')] = ''
    values[getWorkKey(w.id, 'done')] = ''
  })
  return values
}

function defaultDay(template = TEMPLATE_PRESETS.speed) {
  return {
    updatedAt: '',
    assignments: {},
    movementLog: [],
    snapshots: { q1: null, q2: null, q3: null },
    workValues: defaultWorkValues(template),
    rackLists: {
      prepped: '',
      processed: '',
    },
    notes: '',
  }
}

function defaultState() {
  return {
    appVersion: '2.0',
    currentBoardId: 'speed_day',
    weekStartDate: todayMonday(),
    selectedDay: 'Monday',
    adminName: 'Ali',
    builderPool: [],
    boardStates: {},
    templates: JSON.parse(JSON.stringify(TEMPLATE_PRESETS)),
    darkMode: false,
  }
}

function getBoardTemplate(state, boardId = state.currentBoardId) {
  const board = BOARDS[boardId] || BOARDS.speed_day
  return state.templates?.[board.templateId] || TEMPLATE_PRESETS[board.templateId] || TEMPLATE_PRESETS.speed
}

function getBoardKey(boardId, weekStartDate) {
  return `${boardId}__${toMonday(weekStartDate)}`
}

function getBoardWeek(state, boardId = state.currentBoardId, weekStartDate = state.weekStartDate) {
  const key = getBoardKey(boardId, weekStartDate)
  const template = getBoardTemplate(state, boardId)
  return state.boardStates?.[key] || {
    weekStartDate: toMonday(weekStartDate),
    days: Object.fromEntries(WEEKDAYS.map((d) => [d, defaultDay(template)])),
  }
}

function normalizeLoadedState(loaded) {
  const base = defaultState()
  const state = { ...base, ...(loaded || {}) }
  state.templates = { ...TEMPLATE_PRESETS, ...(loaded?.templates || {}) }
  state.currentBoardId = BOARDS[state.currentBoardId] ? state.currentBoardId : 'speed_day'
  state.weekStartDate = toMonday(state.weekStartDate || todayMonday())
  state.selectedDay = WEEKDAYS.includes(state.selectedDay) ? state.selectedDay : 'Monday'
  state.builderPool = Array.isArray(state.builderPool) ? state.builderPool : []
  state.boardStates = state.boardStates || {}
  return state
}

function parsePasteList(text) {
  return String(text || '')
    .split(/\r?\n|,|;/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/)
      return { id: parts[0] || '', materialType: parts.slice(1).join(' ') || 'Unspecified', raw: line }
    })
}

function isStaffedStatus(status) {
  return ['Present', 'Training', 'Indirect'].includes(status || 'Present')
}

function calculateMetrics({ template, day, headcount, activeHeadcount, hoursWorked, remainingHours }) {
  const rows = template.workTypes.map((w) => {
    const goal = num(day.workValues?.[getWorkKey(w.id, 'goal')])
    const done = num(day.workValues?.[getWorkKey(w.id, 'done')])
    const weight = num(w.weight) || 0
    return {
      ...w,
      goal,
      done,
      weightedGoal: goal * weight,
      weightedDone: done * weight,
      remaining: Math.max(0, goal - done),
    }
  })

  const weightedGoal = rows.reduce((s, r) => s + r.weightedGoal, 0)
  const weightedDone = rows.reduce((s, r) => s + r.weightedDone, 0)
  const remainingWork = Math.max(0, weightedGoal - weightedDone)

  const requiredTPH = headcount > 0 && remainingHours > 0 ? remainingWork / headcount / remainingHours : 0
  const liveTPH = headcount > 0 && hoursWorked > 0 ? weightedDone / headcount / hoursWorked : 0
  const liveActiveTPH = activeHeadcount > 0 && hoursWorked > 0 ? weightedDone / activeHeadcount / hoursWorked : 0
  const goalTPH = headcount > 0 ? weightedGoal / headcount / SHIFT_HOURS : 0
  const outputPerHour = hoursWorked > 0 ? weightedDone / hoursWorked : 0
  const projectedAtPace = liveTPH > 0 && headcount > 0 ? liveTPH * headcount * SHIFT_HOURS : weightedDone
  const projectedVsGoal = projectedAtPace - weightedGoal
  const efficiency = weightedGoal > 0 ? (weightedDone / weightedGoal) * 100 : 0
  const gap = liveTPH - requiredTPH

  const status = weightedDone <= 0 && hoursWorked <= 0
    ? 'Not started'
    : gap >= 0.25
      ? 'Ahead'
      : gap >= -0.25
        ? 'On Target'
        : 'Needs Recovery'

  return {
    rows,
    weightedGoal,
    weightedDone,
    remainingWork,
    requiredTPH,
    liveTPH,
    liveActiveTPH,
    goalTPH,
    outputPerHour,
    projectedAtPace,
    projectedVsGoal,
    efficiency,
    gap,
    status,
  }
}

function getShiftProgress() {
  const now = new Date()
  const start = new Date()
  start.setHours(8, 0, 0, 0)
  const end = new Date()
  end.setHours(16, 30, 0, 0)
  const breakStart = new Date()
  breakStart.setHours(12, 0, 0, 0)
  const breakEnd = new Date()
  breakEnd.setHours(12, 30, 0, 0)

  let worked = 0
  let remaining = SHIFT_HOURS
  if (now <= start) {
    worked = 0
    remaining = SHIFT_HOURS
  } else if (now >= end) {
    worked = SHIFT_HOURS
    remaining = 0
  } else {
    const sinceStart = (now - start) / 60000
    const toEnd = (end - now) / 60000
    let breakElapsed = 0
    if (now >= breakEnd) breakElapsed = 30
    else if (now > breakStart && now < breakEnd) breakElapsed = (now - breakStart) / 60000
    let breakRemaining = 0
    if (now < breakStart) breakRemaining = 30
    else if (now >= breakStart && now < breakEnd) breakRemaining = (breakEnd - now) / 60000
    worked = Math.max(0, (sinceStart - breakElapsed) / 60)
    remaining = Math.max(0, (toEnd - breakRemaining) / 60)
  }

  return {
    hoursWorked: Math.max(0, Math.min(SHIFT_HOURS, worked)),
    remainingHours: Math.max(0, Math.min(SHIFT_HOURS, remaining)),
    nowLabel: now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  }
}

function App() {
  const [state, setState] = useState(() => normalizeLoadedState(JSON.parse(localStorage.getItem('staffboard2') || 'null')))
  const [newBuilder, setNewBuilder] = useState('')
  const [templateEditor, setTemplateEditor] = useState(null)
  const reportRef = useRef(null)

  useEffect(() => {
    localStorage.setItem('staffboard2', JSON.stringify(state))
    fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    }).catch(() => {})
  }, [state])

  useEffect(() => {
    fetch('/api/state')
      .then((r) => r.json())
      .then((data) => {
        if (data?.state) setState(normalizeLoadedState(data.state))
      })
      .catch(() => {})
  }, [])

  const board = BOARDS[state.currentBoardId] || BOARDS.speed_day
  const template = getBoardTemplate(state)
  const week = getBoardWeek(state)
  const day = week.days[state.selectedDay] || defaultDay(template)
  const shift = getShiftProgress()

  const assignments = day.assignments || {}
  const activeBuilders = state.builderPool.filter((b) => assignments[b.id])
  const headcount = activeBuilders.filter((b) => isStaffedStatus(assignments[b.id]?.status)).length
  const activeHeadcount = activeBuilders.filter((b) => {
    const a = assignments[b.id]
    return isStaffedStatus(a?.status) && a?.area && a.area !== 'Unassigned' && !b.isLineLead
  }).length

  const metrics = useMemo(() => calculateMetrics({
    template,
    day,
    headcount,
    activeHeadcount,
    hoursWorked: shift.hoursWorked,
    remainingHours: shift.remainingHours,
  }), [template, day, headcount, activeHeadcount, shift.hoursWorked, shift.remainingHours])

  const preppedRacks = parsePasteList(day.rackLists?.prepped)
  const processedRacks = parsePasteList(day.rackLists?.processed)

  function updateState(updater) {
    setState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      return { ...next }
    })
  }

  function updateBoardDay(updater) {
    updateState((prev) => {
      const key = getBoardKey(prev.currentBoardId, prev.weekStartDate)
      const templateNow = getBoardTemplate(prev)
      const existingWeek = getBoardWeek(prev)
      const currentDay = existingWeek.days[prev.selectedDay] || defaultDay(templateNow)
      const nextDay = typeof updater === 'function' ? updater(currentDay) : updater
      return {
        ...prev,
        boardStates: {
          ...prev.boardStates,
          [key]: {
            ...existingWeek,
            days: {
              ...existingWeek.days,
              [prev.selectedDay]: { ...nextDay, updatedAt: nowString() },
            },
          },
        },
      }
    })
  }

  function changeBoard(boardId) {
    updateState((prev) => ({ ...prev, currentBoardId: boardId, selectedDay: 'Monday' }))
  }

  function addBuilder() {
    const name = newBuilder.trim()
    if (!name) return
    const id = makeId('b')
    updateState((prev) => ({ ...prev, builderPool: [...prev.builderPool, { id, name, badgeType: 'day', isLineLead: false }] }))
    setNewBuilder('')
  }

  function addBuilderToDay(id) {
    updateBoardDay((d) => ({
      ...d,
      assignments: {
        ...d.assignments,
        [id]: d.assignments?.[id] || {
          status: 'Present',
          area: 'Unassigned',
          comment: '',
          createdAt: nowString(),
        },
      },
      movementLog: [
        { timestamp: nowString(), builder: state.builderPool.find((b) => b.id === id)?.name || id, from: 'Not on board', to: 'Unassigned / Present', note: 'Added to day' },
        ...(d.movementLog || []),
      ],
    }))
  }

  function updateAssignment(id, patch) {
    updateBoardDay((d) => {
      const before = d.assignments?.[id] || { status: 'Present', area: 'Unassigned' }
      const after = { ...before, ...patch, updatedAt: nowString() }
      const builder = state.builderPool.find((b) => b.id === id)
      const logs = []
      if (patch.status && patch.status !== before.status) {
        logs.push({ timestamp: nowString(), builder: builder?.name || id, from: `${before.area || 'Unassigned'} (${before.status || 'Present'})`, to: `${after.area || 'Unassigned'} (${after.status})`, note: `Status changed to ${after.status}` })
      }
      if (patch.area && patch.area !== before.area) {
        logs.push({ timestamp: nowString(), builder: builder?.name || id, from: `${before.area || 'Unassigned'} (${before.status || 'Present'})`, to: `${after.area} (${after.status || 'Present'})`, note: `Moved to ${after.area}` })
      }
      return {
        ...d,
        assignments: { ...d.assignments, [id]: after },
        movementLog: [...logs, ...(d.movementLog || [])],
      }
    })
  }

  function removeFromDay(id) {
    updateBoardDay((d) => {
      const next = { ...(d.assignments || {}) }
      const builder = state.builderPool.find((b) => b.id === id)
      delete next[id]
      return {
        ...d,
        assignments: next,
        movementLog: [
          { timestamp: nowString(), builder: builder?.name || id, from: 'On board', to: 'Removed', note: 'Removed from this day' },
          ...(d.movementLog || []),
        ],
      }
    })
  }

  function updateWorkValue(workId, kind, value) {
    updateBoardDay((d) => ({ ...d, workValues: { ...d.workValues, [getWorkKey(workId, kind)]: value } }))
  }

  function captureSnapshot(key) {
    updateBoardDay((d) => ({
      ...d,
      snapshots: {
        ...d.snapshots,
        [key]: {
          capturedAt: nowString(),
          headcount,
          activeHeadcount,
          metrics,
          assignments: d.assignments,
        },
      },
    }))
  }

  function updateTemplateWorkType(id, patch) {
    updateState((prev) => {
      const tpl = getBoardTemplate(prev)
      const boardCfg = BOARDS[prev.currentBoardId]
      return {
        ...prev,
        templates: {
          ...prev.templates,
          [boardCfg.templateId]: {
            ...tpl,
            workTypes: tpl.workTypes.map((w) => w.id === id ? { ...w, ...patch } : w),
          },
        },
      }
    })
  }

  function addWorkType() {
    updateState((prev) => {
      const tpl = getBoardTemplate(prev)
      const boardCfg = BOARDS[prev.currentBoardId]
      const id = makeId('work')
      return {
        ...prev,
        templates: {
          ...prev.templates,
          [boardCfg.templateId]: {
            ...tpl,
            workTypes: [...tpl.workTypes, { id, name: 'New Work Type', weight: 1, unit: 'units' }],
          },
        },
      }
    })
  }

  function deleteWorkType(id) {
    updateState((prev) => {
      const tpl = getBoardTemplate(prev)
      const boardCfg = BOARDS[prev.currentBoardId]
      return {
        ...prev,
        templates: {
          ...prev.templates,
          [boardCfg.templateId]: {
            ...tpl,
            workTypes: tpl.workTypes.filter((w) => w.id !== id),
          },
        },
      }
    })
  }

  async function exportPDF() {
    const node = reportRef.current
    if (!node) return
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff' })
    const pdf = new jsPDF('p', 'mm', 'a4')
    const width = pdf.internal.pageSize.getWidth() - 16
    const height = (canvas.height * width) / canvas.width
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 8, 8, width, height)
    pdf.save(`${board.label}-${state.weekStartDate}-${state.selectedDay}.pdf`)
  }

  function exportExcel() {
    const rows = metrics.rows.map((r) => ({
      WorkType: r.name,
      Goal: r.goal,
      Done: r.done,
      Weight: r.weight,
      WeightedGoal: r.weightedGoal,
      WeightedDone: r.weightedDone,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Work')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(activeBuilders.map((b) => ({ Name: b.name, ...assignments[b.id] }))), 'Staffing')
    XLSX.writeFile(wb, `${board.label}-${state.weekStartDate}-${state.selectedDay}.xlsx`)
  }

  const statusClass = metrics.status === 'Ahead' ? 'good' : metrics.status === 'On Target' ? 'warn' : metrics.status === 'Not started' ? '' : 'bad'

  return (
    <div className={state.darkMode ? 'app dark' : 'app'}>
      <aside className="sidebar">
        <h1>StaffBoard 2.0</h1>
        <p className="muted">Template-based boards for SPEED, FA Lab, and Bodega.</p>

        <section>
          <h2>Open Board</h2>
          <select value={state.currentBoardId} onChange={(e) => changeBoard(e.target.value)}>
            {Object.entries(BOARDS).map(([id, b]) => <option key={id} value={id}>{b.label}</option>)}
          </select>
          <div className="row two">
            <label>Week
              <input type="date" value={state.weekStartDate} onChange={(e) => updateState((p) => ({ ...p, weekStartDate: toMonday(e.target.value) }))} />
            </label>
            <label>Admin
              <input value={state.adminName} onChange={(e) => updateState((p) => ({ ...p, adminName: e.target.value }))} />
            </label>
          </div>
          <button onClick={() => setState(defaultState())} className="danger">Reset Local App</button>
        </section>

        <section>
          <h2>Days</h2>
          <div className="day-grid">
            {WEEKDAYS.map((d) => <button key={d} className={state.selectedDay === d ? 'active' : ''} onClick={() => updateState((p) => ({ ...p, selectedDay: d }))}>{d.slice(0, 3)}</button>)}
          </div>
        </section>

        <section>
          <h2>Roster</h2>
          <div className="inline">
            <input value={newBuilder} onChange={(e) => setNewBuilder(e.target.value)} placeholder="Builder name" />
            <button onClick={addBuilder}>Add</button>
          </div>
          <div className="roster-list">
            {state.builderPool.map((b) => (
              <div key={b.id} className="roster-row">
                <span>{b.name}</span>
                {assignments[b.id]
                  ? <button className="danger-lite" onClick={() => removeFromDay(b.id)}>Remove Day</button>
                  : <button onClick={() => addBuilderToDay(b.id)}>Add Day</button>}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2>Template Work Types</h2>
          <p className="muted small">{template.description}</p>
          {template.workTypes.map((w) => (
            <div key={w.id} className="template-row">
              <input value={w.name} onChange={(e) => updateTemplateWorkType(w.id, { name: e.target.value })} />
              <input type="number" step="0.1" value={w.weight} onChange={(e) => updateTemplateWorkType(w.id, { weight: e.target.value })} />
              <input value={w.unit} onChange={(e) => updateTemplateWorkType(w.id, { unit: e.target.value })} />
              <button className="danger-lite" onClick={() => deleteWorkType(w.id)}>Delete</button>
            </div>
          ))}
          <button onClick={addWorkType}>Add Work Type</button>
        </section>

        {board.templateId === 'speed' && (
          <section>
            <h2>Rack ID Tracking</h2>
            <label>Prepped Rack IDs + Material Type
              <textarea rows="5" value={day.rackLists?.prepped || ''} onChange={(e) => updateBoardDay((d) => ({ ...d, rackLists: { ...d.rackLists, prepped: e.target.value }, workValues: { ...d.workValues, [getWorkKey('prep', 'done')]: String(parsePasteList(e.target.value).length) } }))} placeholder={'RACK123 GPU\nRACK124 CPU'} />
            </label>
            <label>Processed Rack IDs + Material Type
              <textarea rows="5" value={day.rackLists?.processed || ''} onChange={(e) => updateBoardDay((d) => ({ ...d, rackLists: { ...d.rackLists, processed: e.target.value }, workValues: { ...d.workValues, [getWorkKey('recovery', 'done')]: String(parsePasteList(e.target.value).length) } }))} placeholder={'RACK555 SSD\nRACK556 HDD'} />
            </label>
          </section>
        )}

        <section>
          <h2>Snapshots</h2>
          <div className="row three">
            <button onClick={() => captureSnapshot('q1')}>Q1</button>
            <button onClick={() => captureSnapshot('q2')}>Q2</button>
            <button onClick={() => captureSnapshot('q3')}>Q3</button>
          </div>
        </section>

        <section>
          <h2>Exports</h2>
          <button onClick={exportExcel}>Excel</button>
          <button onClick={exportPDF}>PDF</button>
          <button onClick={() => updateState((p) => ({ ...p, darkMode: !p.darkMode }))}>{state.darkMode ? 'Light' : 'Dark'} Mode</button>
        </section>
      </aside>

      <main>
        <div className="launcher card">
          {Object.entries(BOARDS).map(([id, b]) => (
            <button key={id} className={state.currentBoardId === id ? 'active' : ''} onClick={() => changeBoard(id)}>{b.label}</button>
          ))}
        </div>

        <div ref={reportRef} className="report">
          <header className="hero">
            <div>
              <div className="eyebrow">{board.label}</div>
              <h1>{template.label} Operations Board</h1>
              <p>{state.selectedDay} · Week of {state.weekStartDate} · Admin: {state.adminName}</p>
            </div>
            <div className={`status ${statusClass}`}>
              <span>{metrics.status}</span>
              <strong>{metrics.gap >= 0 ? '+' : ''}{metrics.gap.toFixed(1)}</strong>
            </div>
          </header>

          <section className="kpis">
            <div className="kpi"><span>Headcount</span><strong>{headcount}</strong></div>
            <div className="kpi"><span>Active HC</span><strong>{activeHeadcount}</strong></div>
            <div className="kpi"><span>Required TPH</span><strong>{metrics.requiredTPH.toFixed(1)}</strong></div>
            <div className="kpi"><span>Live TPH</span><strong>{metrics.liveTPH.toFixed(1)}</strong></div>
            <div className="kpi"><span>Remaining Work</span><strong>{metrics.remainingWork.toFixed(0)}</strong></div>
            <div className="kpi"><span>Shift Remaining</span><strong>{shift.remainingHours.toFixed(1)}h</strong></div>
            <div className="kpi"><span>Projected Finish</span><strong className={metrics.projectedVsGoal >= 0 ? 'green' : 'red'}>{metrics.projectedVsGoal >= 0 ? '+' : ''}{metrics.projectedVsGoal.toFixed(0)}</strong></div>
            <div className="kpi"><span>Efficiency</span><strong>{metrics.efficiency.toFixed(0)}%</strong></div>
          </section>

          <section className="card">
            <div className="section-title">
              <div>
                <h2>Today's Work Goals</h2>
                <p>Universal TPH engine: Goal Work = Σ(goal × weight), Done Work = Σ(done × weight).</p>
              </div>
              <div className="pill">Weighted Goal {metrics.weightedGoal.toFixed(1)} · Done {metrics.weightedDone.toFixed(1)}</div>
            </div>
            <div className="work-table">
              <div className="thead">
                <div>Work Type</div><div>Goal</div><div>Done</div><div>Weight</div><div>Goal Work</div><div>Done Work</div>
              </div>
              {metrics.rows.map((r) => (
                <div className="trow" key={r.id}>
                  <div><strong>{r.name}</strong><span>{r.unit}</span></div>
                  <input type="number" value={day.workValues?.[getWorkKey(r.id, 'goal')] || ''} onChange={(e) => updateWorkValue(r.id, 'goal', e.target.value)} />
                  <input type="number" value={day.workValues?.[getWorkKey(r.id, 'done')] || ''} onChange={(e) => updateWorkValue(r.id, 'done', e.target.value)} />
                  <div>{r.weight}</div>
                  <div>{r.weightedGoal.toFixed(1)}</div>
                  <div>{r.weightedDone.toFixed(1)}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid two">
            <div className="card">
              <h2>Staffing</h2>
              <div className="staff-grid">
                {activeBuilders.map((b) => {
                  const a = assignments[b.id]
                  return (
                    <div className="staff-card" key={b.id}>
                      <div><strong>{b.name}</strong><span>{a.status}</span></div>
                      <select value={a.status || 'Present'} onChange={(e) => updateAssignment(b.id, { status: e.target.value })}>
                        {STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                      <select value={a.area || 'Unassigned'} onChange={(e) => updateAssignment(b.id, { area: e.target.value })}>
                        {template.areas.map((area) => <option key={area}>{area}</option>)}
                      </select>
                      <input placeholder="Comment" value={a.comment || ''} onChange={(e) => updateAssignment(b.id, { comment: e.target.value })} />
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="card">
              <h2>Movement History</h2>
              <div className="history">
                {(day.movementLog || []).slice(0, 20).map((m, i) => (
                  <div key={i} className="history-row">
                    <div><strong>{m.builder}</strong><span>{new Date(m.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div>
                    <p>{m.from} → {m.to}</p>
                    <small>{m.note}</small>
                  </div>
                ))}
                {!(day.movementLog || []).length && <p className="muted">No movements yet.</p>}
              </div>
            </div>
          </section>

          {board.templateId === 'speed' && (
            <section className="card">
              <h2>Rack List Summary</h2>
              <div className="kpis">
                <div className="kpi"><span>Prepped Rack IDs</span><strong>{preppedRacks.length}</strong></div>
                <div className="kpi"><span>Processed Rack IDs</span><strong>{processedRacks.length}</strong></div>
                <div className="kpi wide"><span>Material Types</span><strong>{[...preppedRacks, ...processedRacks].reduce((acc, r) => ({ ...acc, [r.materialType]: (acc[r.materialType] || 0) + 1 }), {}) && Object.entries([...preppedRacks, ...processedRacks].reduce((acc, r) => ({ ...acc, [r.materialType]: (acc[r.materialType] || 0) + 1 }), {})).map(([k,v]) => `${k}: ${v}`).join(' · ') || 'None'}</strong></div>
              </div>
            </section>
          )}

          <section className="card">
            <h2>Snapshots</h2>
            <div className="snapshots">
              {['q1', 'q2', 'q3'].map((q) => {
                const snap = day.snapshots?.[q]
                return (
                  <div className="snapshot" key={q}>
                    <strong>{q.toUpperCase()}</strong>
                    {snap ? <p>{new Date(snap.capturedAt).toLocaleString()} · HC {snap.headcount} · TPH {snap.metrics.liveTPH.toFixed(1)}</p> : <p>Not captured</p>}
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
