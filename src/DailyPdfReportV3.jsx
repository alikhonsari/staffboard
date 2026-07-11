import React, { forwardRef, useMemo } from 'react'
import { composeDailyPdfPagePlan, DAILY_PDF_V3_VERSION } from './dailyPdfLayoutV3.js'

const STAFFED_STATUSES = new Set(['Present', 'Training', 'Indirect'])
const AWAY_STATUSES = new Set(['PTO', 'LOA', 'VTO', 'Absent'])
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0
const text = (value, fallback = '—') => String(value || '').trim() || fallback

function selectedCalendarDate(weekStartDate, selectedDay) {
  const index = Math.max(0, WEEKDAYS.indexOf(selectedDay))
  const date = new Date(`${weekStartDate}T12:00:00`)
  if (Number.isNaN(date.getTime())) return String(weekStartDate || '')
  date.setDate(date.getDate() + index)
  return date.toISOString().slice(0, 10)
}

function isoWeek(dateString) {
  const source = new Date(`${dateString}T12:00:00`)
  if (Number.isNaN(source.getTime())) return ''
  const target = new Date(Date.UTC(source.getFullYear(), source.getMonth(), source.getDate()))
  const day = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7)
  return `${target.getUTCFullYear()} · W${String(week).padStart(2, '0')}`
}

function parseTime(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ''))) return null
  const [hour, minute] = String(value).split(':').map(Number)
  return hour * 60 + minute
}

function fallbackHours(assignment, nightShift) {
  const startDefault = nightShift ? 17 * 60 : 8 * 60
  const endDefault = nightShift ? 25 * 60 + 30 : 16 * 60 + 30
  let start = parseTime(assignment?.clockInTime)
  let end = parseTime(assignment?.leaveTime)
  if (start == null) start = startDefault
  if (end == null) end = endDefault
  if (nightShift && end < start) end += 1440
  return Math.max(0, Math.min(12, (end - start) / 60))
}

function assignmentHours(assignment, computeHoursForAssignment, selectedDay, weekStartDate, nightShift) {
  try {
    const result = typeof computeHoursForAssignment === 'function'
      ? computeHoursForAssignment(assignment, selectedDay, weekStartDate)
      : null
    if (typeof result === 'number') return Math.max(0, result)
    if (result && typeof result === 'object') {
      const total = Object.values(result).reduce((sum, value) => sum + number(value), 0)
      if (total > 0) return total
    }
  } catch {
    // Use the print-safe fallback below.
  }
  return fallbackHours(assignment, nightShift)
}

function rackCategory(row) {
  const value = `${row?.materialType || ''} ${row?.raw || ''}`.toLowerCase()
  if (value.includes('decom')) return 'Decom'
  if (value.includes('speed')) return 'SPEED'
  return 'Other'
}

function areaTypeLabel(value) {
  if (value === 'labor_share') return 'Labor Share'
  if (value === 'support') return 'Support'
  if (value === 'unassigned') return 'Unassigned'
  return 'Production'
}

function statusTone(status) {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('ahead') || normalized.includes('covered') || normalized === 'complete') return 'good'
  if (normalized.includes('risk') || normalized.includes('limited') || normalized.includes('needs')) return 'warn'
  if (normalized.includes('behind') || normalized.includes('missing') || normalized.includes('expired') || normalized.includes('over')) return 'bad'
  return 'neutral'
}

function PageHeader({ compact, boardTitle, boardType, shift, reportDate, selectedDay, weekStart, weekLabel, admin, generated, shiftWindow }) {
  return (
    <header className={compact ? 'daily-pdf-v3-header compact' : 'daily-pdf-v3-header'}>
      <div>
        <div className="daily-pdf-v3-kicker">Daily Operations Report</div>
        <div className="daily-pdf-v3-title">{boardTitle}</div>
        <div className="daily-pdf-v3-subtitle">{reportDate} · {selectedDay} · Week of {weekStart} · {weekLabel}</div>
      </div>
      <div className="daily-pdf-v3-header-meta">
        <div><span>Board</span><strong>{boardType}</strong></div>
        <div><span>Shift</span><strong>{shift}</strong></div>
        <div><span>Hours</span><strong>{shiftWindow}</strong></div>
        <div><span>Admin</span><strong>{admin}</strong></div>
        {!compact ? <div><span>Generated</span><strong>{generated}</strong></div> : null}
        {!compact ? <div><span>Report</span><strong>v{DAILY_PDF_V3_VERSION}</strong></div> : null}
      </div>
    </header>
  )
}

function PageFooter({ boardType, shift, reportDate, admin, generated, pageNumber, pageCount }) {
  return (
    <footer className="daily-pdf-v3-footer">
      <span>{boardType} · {shift} · {reportDate} · Admin: {admin}</span>
      <span>StaffBoard · Generated {generated}</span>
      <strong>Page {pageNumber} of {pageCount}</strong>
    </footer>
  )
}

function EmptyState({ children, tone = 'neutral' }) {
  return <div className={`daily-pdf-v3-empty tone-${tone}`}>{children}</div>
}

function Section({ title, subtitle, children, className = '' }) {
  return (
    <section className={`daily-pdf-v3-section ${className}`.trim()}>
      <div className="daily-pdf-v3-section-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  )
}

function DataTable({ columns, rows, emptyText }) {
  if (!rows.length) return <EmptyState>{emptyText}</EmptyState>
  return (
    <div className="daily-pdf-v3-table-wrap">
      <table className="daily-pdf-v3-table">
        <thead><tr>{columns.map((column) => <th key={column.key} style={column.width ? { width: column.width } : undefined}>{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.key || index}>{columns.map((column) => <td key={column.key} className={column.numeric ? 'numeric' : ''}>{typeof column.render === 'function' ? column.render(row) : text(row[column.key])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const DailyPdfReportV3 = forwardRef(function DailyPdfReportV3(props, ref) {
  const {
    state = {},
    dayState = {},
    activeBuilders = [],
    areaCounts = [],
    counts = {},
    metrics = {},
    currentLiveTPH = 0,
    efficiencyPct = 0,
    laborShareStats = {},
    laborShareDetailRows = [],
    dailyPdfRackRows = [],
    dailyPdfExceptions = [],
    dailyPdfSkillCoverage = [],
    speedLiteTeamRows = [],
    speedLiteUngroupedBuilders = [],
    reportAdminName = 'Not set',
    reportShiftWindow = '',
    boardPresets = {},
    getAssignment,
    computeHoursForAssignment,
  } = props

  const generated = useMemo(() => new Date().toLocaleString(), [state.updatedAt, dayState.updatedAt])
  const boardId = state.currentBoardId || 'speed_day'
  const speedBoard = String(boardId).startsWith('speed_')
  const boardType = speedBoard ? 'SPEED' : String(boardId).startsWith('fa_') ? 'FA Lab' : 'Bodega'
  const shift = boardPresets?.[boardId]?.shift || state.boardShift || 'Day Shift'
  const nightShift = /night/i.test(shift)
  const shiftWindow = reportShiftWindow || (nightShift ? '5:00 PM – 1:30 AM' : '8:00 AM – 4:30 PM')
  const reportDate = selectedCalendarDate(state.weekStartDate, state.selectedDay)
  const weekLabel = isoWeek(reportDate)
  const boardTitle = boardPresets?.[boardId]?.title || state.boardTitle || `${boardType} Staffing Board`
  const profiles = useMemo(() => new Map((state.builderPool || []).map((profile) => [profile.id, profile])), [state.builderPool])

  const areaRows = useMemo(() => {
    const hoursByArea = new Map()
    activeBuilders.forEach((builder) => {
      const assignment = typeof getAssignment === 'function' ? getAssignment(builder.id) : dayState.assignments?.[builder.id] || {}
      if (!STAFFED_STATUSES.has(assignment.status || 'Present')) return
      const area = assignment.area || 'Unassigned'
      const hours = assignmentHours(assignment, computeHoursForAssignment, state.selectedDay, state.weekStartDate, nightShift)
      hoursByArea.set(area, (hoursByArea.get(area) || 0) + hours)
    })
    return (areaCounts || []).map((area) => {
      const capacity = number(area.capacity)
      const active = number(area.count)
      const hours = number(hoursByArea.get(area.name))
      const gap = capacity ? capacity - active : null
      return {
        key: area.name,
        area: area.name,
        areaType: area.areaType || (area.name === 'Unassigned' ? 'unassigned' : 'production'),
        active,
        hours,
        capacity: capacity || null,
        coverage: capacity ? (gap > 0 ? `Short ${gap}` : gap < 0 ? `Over ${Math.abs(gap)}` : 'Covered') : active > 0 ? 'Staffed' : 'No activity',
      }
    }).filter((row) => row.active > 0 || row.hours > 0)
      .sort((a, b) => b.active - a.active || b.hours - a.hours || a.area.localeCompare(b.area))
  }, [activeBuilders, areaCounts, computeHoursForAssignment, dayState.assignments, getAssignment, nightShift, state.selectedDay, state.weekStartDate])

  const exceptionRows = useMemo(() => {
    const byKey = new Map()
    ;(dailyPdfExceptions || []).forEach((row) => {
      const normalized = {
        key: `${row.builder}-${row.reason}`,
        builder: row.builder,
        status: row.status,
        area: row.area,
        scheduled: shiftWindow,
        actual: [row.clockIn, row.clockOut].filter(Boolean).join(' – ') || '—',
        variance: row.reason,
        exception: row.reason,
      }
      byKey.set(normalized.key, normalized)
    })
    activeBuilders.forEach((builder) => {
      const assignment = typeof getAssignment === 'function' ? getAssignment(builder.id) : dayState.assignments?.[builder.id] || {}
      const profile = profiles.get(builder.id) || builder
      const status = assignment.status || 'Present'
      const reasons = []
      if (AWAY_STATUSES.has(status)) reasons.push(status)
      if (STAFFED_STATUSES.has(status) && (assignment.area || 'Unassigned') === 'Unassigned' && !profile.isLineLead) reasons.push('Unassigned')
      if (profile.isArchived) reasons.push('Archived profile remains on roster')
      if (STAFFED_STATUSES.has(status) && !assignment.clockInTime && assignment.leaveTime) reasons.push('Missing clock-in')
      if (STAFFED_STATUSES.has(status) && assignment.clockInTime && !assignment.leaveTime) reasons.push('Missing clock-out')
      if (!reasons.length) return
      const key = `${builder.name}-${reasons.join('|')}`
      if (!byKey.has(key)) byKey.set(key, {
        key,
        builder: builder.name,
        status,
        area: assignment.area || 'Unassigned',
        scheduled: shiftWindow,
        actual: [assignment.clockInTime, assignment.leaveTime].filter(Boolean).join(' – ') || '—',
        variance: reasons.join(' · '),
        exception: reasons.join(' · '),
      })
    })
    return Array.from(byKey.values())
  }, [activeBuilders, dailyPdfExceptions, dayState.assignments, getAssignment, profiles, shiftWindow])

  const skillRows = useMemo(() => {
    const legacyCounts = new Map((dailyPdfSkillCoverage || []).map((row) => [row.label, number(row.count)]))
    const definitions = [
      ['TDR', 'trainedTdr', true],
      ['Forklift', 'trainedForklift', true],
      ['Center Rider', 'trainedCenterRider', false],
      ['Clamp Truck', 'trainedClampTruck', false],
      ['Rack Mover', 'trainedRackMover', false],
      ['Reach Truck', 'trainedReachTruck', false],
      ['Trainer', 'isTrainer', false],
      ['Safety', 'isSafetyMember', true],
      ['Line Lead', 'isLineLead', true],
    ]
    return definitions.map(([label, field, critical]) => {
      const qualified = activeBuilders.filter((builder) => {
        const assignment = typeof getAssignment === 'function' ? getAssignment(builder.id) : dayState.assignments?.[builder.id] || {}
        return STAFFED_STATUSES.has(assignment.status || 'Present') && !!(profiles.get(builder.id) || builder)?.[field]
      })
      const count = Math.max(legacyCounts.get(label) || 0, qualified.length)
      const expired = qualified.filter((builder) => (profiles.get(builder.id)?.skillRecords || []).some((record) => record.skillId === label.toLowerCase().replaceAll(' ', '-') && record.expirationDate && new Date(`${record.expirationDate}T23:59:59`) < new Date())).length
      const status = expired > 0 ? 'Expired Coverage' : count === 0 ? 'Missing' : count === 1 ? 'Limited' : 'Covered'
      return { key: label, skill: label, count, required: critical ? 1 : null, status, builders: qualified.map((builder) => builder.name).join(', ') || '—', critical }
    }).filter((row) => row.critical || row.count > 0)
  }, [activeBuilders, dailyPdfSkillCoverage, dayState.assignments, getAssignment, profiles])

  const rackRows = useMemo(() => (dailyPdfRackRows || []).map((row, index) => ({
    key: `${row.listType}-${row.id}-${index}`,
    listType: row.listType || 'Recorded',
    id: String(row.id || ''),
    materialType: row.materialType || 'Unspecified',
    category: rackCategory(row),
    notes: row.raw && row.raw !== `${row.id} ${row.materialType}` ? row.raw : '',
  })), [dailyPdfRackRows])

  const laborRows = useMemo(() => (laborShareDetailRows || []).map((row, index) => ({
    key: row.builder?.id || `${row.builder?.name}-${index}`,
    builder: row.builder?.name || '—',
    lineLead: row.profile?.isLineLead ? 'Yes' : 'No',
    area: row.area || '—',
    previousArea: row.previousProductionArea || '—',
    clock: [row.assignment?.clockInTime, row.assignment?.leaveTime].filter(Boolean).join(' – ') || '—',
    hours: number(row.hours),
    movedBy: row.admin || '—',
    movedAt: row.assignment?.updatedAt || row.assignment?.laborShareMovedAt || '—',
  })), [laborShareDetailRows])

  const teamRows = useMemo(() => {
    if (!speedBoard) return []
    const teams = (speedLiteTeamRows || []).map((team) => ({
      key: team.id,
      team: team.name,
      target: number(team.targetSize),
      active: Array.isArray(team.activeMembers) ? team.activeMembers.length : 0,
      status: team.status?.label || 'Empty',
      lead: team.teamLead?.name || '—',
      builders: (team.members || []).map((builder) => builder.name).join(', ') || '—',
      hours: number(team.hours),
    }))
    if ((speedLiteUngroupedBuilders || []).length) teams.push({
      key: 'ungrouped', team: 'Ungrouped', target: null, active: speedLiteUngroupedBuilders.length,
      status: 'Needs grouping', lead: '—', builders: speedLiteUngroupedBuilders.map((builder) => builder.name).join(', '), hours: null,
    })
    return teams
  }, [speedBoard, speedLiteTeamRows, speedLiteUngroupedBuilders])

  const noteRows = useMemo(() => {
    const comments = state.commentsBoard || {}
    return [
      ['Shift Notes', dayState.shiftNotes || dayState.notes || ''],
      ['Safety Observations', comments.safetyObservations],
      ['Performance Shoutouts', comments.performanceShoutouts],
      ['Concerns', comments.concerns],
      ['Builder Voice', comments.builderVoice],
      ['Suggestions', comments.suggestions],
      ['Handoff Notes', state.handoffNotes],
    ].filter(([, value]) => String(value || '').trim()).map(([label, value]) => ({ key: label, label, value: String(value).trim() }))
  }, [dayState.notes, dayState.shiftNotes, state.commentsBoard, state.handoffNotes])

  const productionGoals = number(metrics.recoveryGoal) + number(metrics.rackPrepGoal) + number(metrics.mediaGoal)
  const requiredTph = number(metrics.requiredTPH)
  const liveTph = number(currentLiveTPH)
  const productionHc = speedBoard ? number(laborShareStats.speedProductionHeadcount) : number(laborShareStats.totalShiftHeadcount || counts.total)
  const goalConfigured = productionGoals > 0 || requiredTph > 0
  let risk = { label: speedBoard ? 'No Production Data' : 'Staffing Snapshot', detail: speedBoard ? 'No active production goal or production headcount is available.' : 'SPEED-only production risk is not shown for this board.', tone: 'neutral' }
  if (speedBoard && goalConfigured && productionHc > 0) {
    const gap = liveTph - requiredTph
    if (gap >= 0.25) risk = { label: 'Ahead', detail: `Live TPH is ${gap.toFixed(2)} above required pace.`, tone: 'good' }
    else if (gap >= -0.1) risk = { label: 'On Target', detail: 'Live TPH is aligned with required pace.', tone: 'good' }
    else if (gap >= -0.75) risk = { label: 'At Risk', detail: `Live TPH is ${Math.abs(gap).toFixed(2)} below required pace.`, tone: 'warn' }
    else risk = { label: 'Behind', detail: `Live TPH is ${Math.abs(gap).toFixed(2)} below required pace.`, tone: 'bad' }
  }

  const goalRows = [
    { key: 'Recovery', label: 'Recovery', goal: number(metrics.recoveryGoal), actual: number(metrics.recoveryProcessed) },
    { key: 'Rack Prep', label: 'Rack Prep', goal: number(metrics.rackPrepGoal), actual: number(metrics.rackPrepOutput) },
    { key: 'Media', label: 'Media', goal: number(metrics.mediaGoal), actual: number(metrics.mediaProcessed) },
  ].map((row) => ({ ...row, percent: row.goal > 0 ? Math.max(0, Math.min(100, row.actual / row.goal * 100)) : 0 }))

  const kpis = [
    ['Total Shift HC', number(laborShareStats.totalShiftHeadcount || counts.total)],
    ...(speedBoard ? [['SPEED Production HC', productionHc]] : []),
    ['Labor Share HC', number(laborShareStats.laborShareHeadcount)],
    ['Line Leads', number(laborShareStats.lineLeadHeadcount || counts.lineLeads)],
    ...(speedBoard ? [['Live TPH', liveTph.toFixed(2)], ['Required TPH', requiredTph.toFixed(2)]] : []),
    ['Goal Completion', `${number(efficiencyPct).toFixed(0)}%`],
    ['Remaining Work', number(metrics.remainingWork).toFixed(1)],
    ['Risk', risk.label],
  ].slice(0, 10)

  const areaSummaryRows = areaRows.slice(0, 10)
  const areaOverflowRows = areaRows.slice(10)
  const meaningfulSkillRows = (number(laborShareStats.totalShiftHeadcount || counts.total) > 0 || skillRows.some((row) => row.count > 0)) ? skillRows : []

  const sectionDescriptors = [
    { key: 'areaOverflow', title: 'Additional Area Coverage', visible: areaOverflowRows.length > 0, rows: areaOverflowRows },
    { key: 'racks', title: 'Rack IDs & Material Types', visible: rackRows.length > 0, rows: rackRows },
    { key: 'exceptions', title: 'Staffing Exceptions & Schedule Variance', visible: exceptionRows.length > 0, rows: exceptionRows },
    { key: 'skills', title: 'Skill Coverage on Shift', visible: meaningfulSkillRows.length > 0, rows: meaningfulSkillRows },
    { key: 'laborShare', title: 'Labor Share Detail', visible: laborRows.length > 0, rows: laborRows },
    { key: 'speedLite', title: 'Speed Lite Teams', visible: speedBoard && teamRows.length > 0, rows: teamRows },
    { key: 'notes', title: 'Shift Notes & Comments', visible: noteRows.length > 0, rows: noteRows, maxRows: 4 },
  ]
  const pagePlan = composeDailyPdfPagePlan({ sections: sectionDescriptors })
  const pageCount = pagePlan.pageCount

  const staffingRows = [
    ['Present / Training / Indirect', `${number(counts.present)} / ${number(counts.training)} / ${number(counts.indirect)}`],
    ['PTO / LOA / VTO / Absent', `${number(counts.pto)} / ${number(counts.loa)} / ${number(counts.vto)} / ${number(counts.absent)}`],
    ['Labor Share / Support / Unassigned', `${number(laborShareStats.laborShareHeadcount)} / ${number(laborShareStats.supportIndirectHeadcount)} / ${number(laborShareStats.unassignedHeadcount || counts.unassigned)}`],
    ['Line Leads / Labor-Shared LL', `${number(laborShareStats.lineLeadHeadcount || counts.lineLeads)} / ${number(laborShareStats.laborSharedLineLeads)}`],
    ['Production / Labor Share Hours', `${number(laborShareStats.productionHoursToday).toFixed(2)} / ${number(laborShareStats.laborShareHoursToday).toFixed(2)}`],
  ]

  const renderDetailSection = (section) => {
    const continued = section.chunkCount > 1 ? ` · ${section.chunkIndex + 1} of ${section.chunkCount}` : ''
    if (section.key === 'areaOverflow') return <Section key={`${section.key}-${section.chunkIndex}`} title={`Additional Area Coverage${continued}`}><DataTable rows={section.rows} emptyText="No additional staffed areas." columns={[
      { key: 'area', label: 'Area', width: '27%' },
      { key: 'areaType', label: 'Type', render: (row) => <span className={`daily-pdf-v3-badge type-${row.areaType}`}>{areaTypeLabel(row.areaType)}</span> },
      { key: 'active', label: 'Active HC', numeric: true },
      { key: 'hours', label: 'Hours', numeric: true, render: (row) => row.hours.toFixed(2) },
      { key: 'capacity', label: 'Capacity', numeric: true },
      { key: 'coverage', label: 'Coverage', render: (row) => <span className={`daily-pdf-v3-status tone-${statusTone(row.coverage)}`}>{row.coverage}</span> },
    ]} /></Section>
    if (section.key === 'racks') return <Section key={`${section.key}-${section.chunkIndex}`} title={`Rack IDs & Material Types${continued}`} subtitle="Rack IDs remain strings and long values wrap safely."><DataTable rows={section.rows} emptyText="No rack or material entries recorded." columns={[
      { key: 'listType', label: 'List', width: '18%' }, { key: 'id', label: 'Rack ID', width: '24%' }, { key: 'materialType', label: 'Material Type', width: '27%' }, { key: 'category', label: 'Category', width: '13%' }, { key: 'notes', label: 'Notes', width: '18%' },
    ]} /></Section>
    if (section.key === 'exceptions') return <Section key={`${section.key}-${section.chunkIndex}`} title={`Staffing Exceptions & Schedule Variance${continued}`}><DataTable rows={section.rows} emptyText="No staffing exceptions for this shift." columns={[
      { key: 'builder', label: 'Builder', width: '18%' }, { key: 'status', label: 'Status', width: '10%' }, { key: 'area', label: 'Area', width: '16%' }, { key: 'scheduled', label: 'Scheduled', width: '15%' }, { key: 'actual', label: 'Actual', width: '15%' }, { key: 'exception', label: 'Exception', width: '26%' },
    ]} /></Section>
    if (section.key === 'skills') return <Section key={`${section.key}-${section.chunkIndex}`} title={`Skill Coverage on Shift${continued}`}><DataTable rows={section.rows} emptyText="No active skill coverage recorded." columns={[
      { key: 'skill', label: 'Skill / Role', width: '18%' }, { key: 'count', label: 'Qualified', numeric: true, width: '10%' }, { key: 'required', label: 'Required', numeric: true, width: '10%' }, { key: 'status', label: 'Coverage', width: '16%', render: (row) => <span className={`daily-pdf-v3-status tone-${statusTone(row.status)}`}>{row.status}</span> }, { key: 'builders', label: 'Active Qualified Builders', width: '46%' },
    ]} /></Section>
    if (section.key === 'laborShare') return <Section key={`${section.key}-${section.chunkIndex}`} title={`Labor Share Detail${continued}`} subtitle={`${number(laborShareStats.laborShareHeadcount)} active · ${number(laborShareStats.laborShareHoursToday).toFixed(2)} hours · ${number(laborShareStats.laborSharedLineLeads)} line lead(s)`}><DataTable rows={section.rows} emptyText="No active Labor Share assignments." columns={[
      { key: 'builder', label: 'Builder', width: '16%' }, { key: 'lineLead', label: 'LL', width: '6%' }, { key: 'area', label: 'Labor Area', width: '15%' }, { key: 'previousArea', label: 'Previous Production Area', width: '18%' }, { key: 'clock', label: 'Clock', width: '14%' }, { key: 'hours', label: 'Hours', numeric: true, width: '8%', render: (row) => row.hours.toFixed(2) }, { key: 'movedBy', label: 'Moved By', width: '11%' }, { key: 'movedAt', label: 'Movement Time', width: '12%' },
    ]} /></Section>
    if (section.key === 'speedLite') return <Section key={`${section.key}-${section.chunkIndex}`} title={`Speed Lite Teams${continued}`}><DataTable rows={section.rows} emptyText="No Speed Lite teams configured for this day." columns={[
      { key: 'team', label: 'Team', width: '14%' }, { key: 'target', label: 'Target', numeric: true, width: '8%' }, { key: 'active', label: 'Active', numeric: true, width: '8%' }, { key: 'status', label: 'Status', width: '13%', render: (row) => <span className={`daily-pdf-v3-status tone-${statusTone(row.status)}`}>{row.status}</span> }, { key: 'lead', label: 'Team Lead', width: '15%' }, { key: 'builders', label: 'Builders', width: '32%' }, { key: 'hours', label: 'Team Hours', numeric: true, width: '10%', render: (row) => row.hours == null ? '—' : row.hours.toFixed(2) },
    ]} /></Section>
    if (section.key === 'notes') return <Section key={`${section.key}-${section.chunkIndex}`} title={`Shift Notes & Comments${continued}`}><div className="daily-pdf-v3-notes">{section.rows.map((row) => <div key={row.key}><strong>{row.label}</strong><p>{row.value}</p></div>)}</div></Section>
    return null
  }

  return (
    <div ref={ref} className="daily-pdf-v3-root" data-daily-pdf-v3="true" data-report-version={DAILY_PDF_V3_VERSION}>
      <article className="daily-pdf-v3-page" data-daily-pdf-page="1">
        <PageHeader boardTitle={boardTitle} boardType={boardType} shift={shift} reportDate={reportDate} selectedDay={state.selectedDay} weekStart={state.weekStartDate} weekLabel={weekLabel} admin={reportAdminName} generated={generated} shiftWindow={shiftWindow} />
        <main className="daily-pdf-v3-content">
          <div className="daily-pdf-v3-kpi-grid">{kpis.map(([label, value]) => <div className={`daily-pdf-v3-kpi ${label === 'Risk' ? `tone-${risk.tone}` : ''}`} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
          <div className="daily-pdf-v3-summary-grid">
            <Section title="Operational Status" className="daily-pdf-v3-risk-section"><div className={`daily-pdf-v3-risk tone-${risk.tone}`}><strong>{risk.label}</strong><span>{risk.detail}</span></div></Section>
            <Section title="Goal Attainment" subtitle={goalConfigured ? 'Daily progress against configured production goals.' : 'No production goals are configured for this day.'}>
              {goalConfigured ? <div className="daily-pdf-v3-goals">{goalRows.map((row) => <div key={row.key}><div><span>{row.label}</span><strong>{row.actual} / {row.goal}</strong></div><div className="daily-pdf-v3-progress"><i style={{ width: `${row.percent}%` }} /></div><b>{row.percent.toFixed(0)}%</b></div>)}</div> : <EmptyState>No production data recorded.</EmptyState>}
            </Section>
            <Section title="Daily Staffing Summary"><table className="daily-pdf-v3-summary-table"><tbody>{staffingRows.map(([label, value]) => <tr key={label}><td>{label}</td><th>{value}</th></tr>)}</tbody></table></Section>
            <Section title="Area Staffing & Hours" subtitle={areaRows.length > 10 ? `Top 10 shown here · ${areaRows.length - 10} additional area(s) continue in detail pages.` : 'Only areas with staffing or hours are shown.'}>
              <DataTable rows={areaSummaryRows} emptyText="No staffed areas or area hours recorded." columns={[
                { key: 'area', label: 'Area', width: '27%' }, { key: 'areaType', label: 'Type', width: '16%', render: (row) => <span className={`daily-pdf-v3-badge type-${row.areaType}`}>{areaTypeLabel(row.areaType)}</span> }, { key: 'active', label: 'HC', numeric: true, width: '10%' }, { key: 'hours', label: 'Hours', numeric: true, width: '13%', render: (row) => row.hours.toFixed(2) }, { key: 'capacity', label: 'Capacity', numeric: true, width: '13%' }, { key: 'coverage', label: 'Coverage', width: '21%' },
              ]} />
            </Section>
          </div>
        </main>
        <PageFooter boardType={boardType} shift={shift} reportDate={reportDate} admin={reportAdminName} generated={generated} pageNumber={1} pageCount={pageCount} />
      </article>

      {pagePlan.detailPages.map((sections, detailIndex) => {
        const pageNumber = detailIndex + 2
        return (
          <article className="daily-pdf-v3-page" data-daily-pdf-page={pageNumber} key={pageNumber}>
            <PageHeader compact boardTitle={boardTitle} boardType={boardType} shift={shift} reportDate={reportDate} selectedDay={state.selectedDay} weekStart={state.weekStartDate} weekLabel={weekLabel} admin={reportAdminName} generated={generated} shiftWindow={shiftWindow} />
            <main className="daily-pdf-v3-content daily-pdf-v3-detail-content">{sections.map(renderDetailSection)}</main>
            <PageFooter boardType={boardType} shift={shift} reportDate={reportDate} admin={reportAdminName} generated={generated} pageNumber={pageNumber} pageCount={pageCount} />
          </article>
        )
      })}
    </div>
  )
})

export default DailyPdfReportV3
