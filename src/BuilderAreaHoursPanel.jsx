import React, { useMemo, useState } from 'react'
import { buildAreaHoursAnalysis, resolveWeekData } from './area-hours-core'
import './builder-area-hours.css'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const fmtHours = (value) => Number(value || 0).toFixed(2)
const fmtPercent = (value) => `${(Number(value || 0) * 100).toFixed(1)}%`

function weekOptions(state) {
  const weeks = new Set([state.weekStartDate, ...Object.keys(state.weeklyBoards || {}), ...Object.keys(state.weeklyHistory || {})].filter(Boolean))
  return [...weeks].sort((a, b) => b.localeCompare(a)).slice(0, 8)
}

function EmptyRow({ columns, children = 'No matching records.' }) {
  return <tr><td colSpan={columns}>{children}</td></tr>
}

export default function BuilderAreaHoursPanel({ state }) {
  const [scope, setScope] = useState('week')
  const [selectedWeek, setSelectedWeek] = useState(state.weekStartDate)
  const [selectedDay, setSelectedDay] = useState(state.selectedDay || 'Monday')
  const [selectedBuilder, setSelectedBuilder] = useState('')
  const [selectedArea, setSelectedArea] = useState('')
  const [view, setView] = useState('leaderboard')
  const [leaderboardSize, setLeaderboardSize] = useState('5')
  const [includeEstimated, setIncludeEstimated] = useState(true)
  const [includeUnassigned, setIncludeUnassigned] = useState(false)

  const weeks = useMemo(() => weekOptions(state), [state.weekStartDate, state.weeklyBoards, state.weeklyHistory])
  const weekData = useMemo(() => resolveWeekData(state, selectedWeek), [state, selectedWeek])
  const days = scope === 'day' ? [selectedDay] : DAYS
  const analysis = useMemo(() => buildAreaHoursAnalysis({
    state,
    weekData,
    weekStartDate: selectedWeek,
    days,
    includeEstimated,
    includeUnassigned,
  }), [state, weekData, selectedWeek, scope, selectedDay, includeEstimated, includeUnassigned])

  const builders = analysis.builderSummary
  const areas = analysis.areaSummaries.filter((row) => row.total_hours > 0 || row.area === selectedArea)
  const leaderboardLimit = leaderboardSize === 'all' ? Infinity : Number(leaderboardSize)
  const leaderboards = analysis.leaderboards.filter((row) => (!selectedArea || row.area === selectedArea) && row.rank <= leaderboardLimit)
  const builderSummary = builders.find((row) => row.builder_id === selectedBuilder) || builders[0] || null
  const builderDistribution = analysis.builderAreaRows.filter((row) => row.builder_id === builderSummary?.builder_id).sort((a, b) => b.total_hours - a.total_hours)
  const builderHistory = analysis.sessions.filter((row) => row.builder_id === builderSummary?.builder_id)
  const areaSummary = areas.find((row) => row.area === selectedArea) || areas[0] || null
  const areaLeaders = analysis.leaderboards.filter((row) => row.area === areaSummary?.area && row.rank <= leaderboardLimit)
  const areaHistory = analysis.sessions.filter((row) => row.area === areaSummary?.area)

  return (
    <section className="summary-card-block card builder-area-hours" data-builder-area-hours>
      <div className="table-title-row builder-area-hours-title">
        <div>
          <div className="table-kicker">Builder Area Hours</div>
          <div className="small">Recorded area-hours contribution with exact versus estimated context. Hours are not a productivity rating.</div>
        </div>
        <span className="pill">{state.currentBoardId} · {state.boardShift}</span>
      </div>

      <div className="builder-area-filters" aria-label="Builder area-hours filters">
        <label>Week<select value={selectedWeek} onChange={(event) => setSelectedWeek(event.target.value)}>{weeks.map((week) => <option key={week} value={week}>{week}</option>)}</select></label>
        <label>Scope<select value={scope} onChange={(event) => setScope(event.target.value)}><option value="week">Selected Week</option><option value="day">Selected Day</option></select></label>
        {scope === 'day' ? <label>Operational Day<select value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)}>{DAYS.map((day) => <option key={day}>{day}</option>)}</select></label> : null}
        <label>View<select value={view} onChange={(event) => setView(event.target.value)}><option value="leaderboard">Area Leaderboard</option><option value="builder">Builder Detail</option><option value="area">Area Detail</option></select></label>
        <label>Top Contributors<select value={leaderboardSize} onChange={(event) => setLeaderboardSize(event.target.value)}><option value="3">Top 3</option><option value="5">Top 5</option><option value="10">Top 10</option><option value="all">All Builders</option></select></label>
        <label className="builder-area-check"><input type="checkbox" checked={includeEstimated} onChange={(event) => setIncludeEstimated(event.target.checked)} /> Include estimated hours</label>
        <label className="builder-area-check"><input type="checkbox" checked={includeUnassigned} onChange={(event) => setIncludeUnassigned(event.target.checked)} /> Include Unassigned</label>
      </div>

      <div className="summary-grid builder-area-kpis">
        {[
          ['Recorded Hours', fmtHours(analysis.metrics.total_recorded_hours)],
          ['Exact Hours', fmtHours(analysis.metrics.exact_hours)],
          ['Estimated Hours', fmtHours(analysis.metrics.estimated_hours)],
          ['Unique Builders', analysis.metrics.unique_builders],
          ['Unique Areas', analysis.metrics.unique_areas],
          ['Most-Staffed Area', analysis.metrics.most_staffed_area || '—'],
          ['Highest Recorded Hours', analysis.metrics.highest_hour_builder || '—'],
          ['Highest Dependency', fmtPercent(analysis.metrics.highest_area_dependency)],
          ['Data Warnings', analysis.metrics.data_quality_warning_count],
        ].map(([label, value]) => <div className="summary-card kpi-highlight-card" key={label}><div className="summary-label">{label}</div><div className="summary-value">{value}</div></div>)}
      </div>

      {view === 'leaderboard' ? (
        <div className="builder-area-view">
          <div className="table-title-row"><div><div className="table-kicker">Top Contributors by Recorded Area Hours</div><div className="small">Dense ranking uses valid hours, worked days, recent activity, and builder name. Tied hours and worked days share a rank.</div></div><label>Area<select value={selectedArea} onChange={(event) => setSelectedArea(event.target.value)}><option value="">All Areas</option>{areas.map((row) => <option key={row.area} value={row.area}>{row.area}</option>)}</select></label></div>
          <div className="analysis-table-wrap compact"><table><thead><tr><th>Rank</th><th>Area</th><th>Builder</th><th>Hours</th><th>% Area Hours</th><th>Days</th><th>Avg/Day</th><th>Sessions</th><th>Exact</th><th>Estimated</th><th>Primary Area</th><th>Context</th><th>Warnings</th></tr></thead><tbody>
            {leaderboards.length ? leaderboards.map((row) => <tr key={`${row.area}-${row.builder_id}`}><td>{row.rank}</td><td>{row.area}</td><td>{row.builder}</td><td>{fmtHours(row.total_hours)}</td><td>{fmtPercent(row.area_hours_percentage)}</td><td>{row.days_worked}</td><td>{fmtHours(row.average_hours_per_day)}</td><td>{row.session_count}</td><td>{fmtHours(row.exact_hours)}</td><td>{fmtHours(row.estimated_hours)}</td><td>{row.primary_area}</td><td>{[row.line_lead === 'Yes' && 'Line Lead', row.trainer === 'Yes' && 'Trainer', row.safety === 'Yes' && 'Safety', row.relevant_skills].filter(Boolean).join(' · ') || '—'}</td><td>{row.data_quality_warning_count}</td></tr>) : <EmptyRow columns={13} />}
          </tbody></table></div>
        </div>
      ) : null}

      {view === 'builder' ? (
        <div className="builder-area-view">
          <div className="table-title-row"><div><div className="table-kicker">Builder Area Distribution</div><div className="small">Primary, secondary, exact, estimated, and reconciled hours for one builder.</div></div><label>Builder<select value={builderSummary?.builder_id || ''} onChange={(event) => setSelectedBuilder(event.target.value)}>{builders.map((row) => <option key={row.builder_id} value={row.builder_id}>{row.builder}</option>)}</select></label></div>
          {builderSummary ? <div className="builder-area-summary-strip"><span><strong>Total:</strong> {fmtHours(builderSummary.total_active_hours)}h</span><span><strong>Primary:</strong> {builderSummary.primary_area} ({fmtHours(builderSummary.primary_area_hours)}h)</span><span><strong>Secondary:</strong> {builderSummary.second_area || '—'} ({fmtHours(builderSummary.second_area_hours)}h)</span><span><strong>Days:</strong> {builderSummary.operational_days_worked}</span><span><strong>Reconciliation:</strong> {fmtHours(builderSummary.area_hours_difference)}h</span></div> : null}
          <div className="analysis-table-wrap compact"><table><thead><tr><th>Area</th><th>Type</th><th>Hours</th><th>% Builder Hours</th><th>Days</th><th>Avg/Day</th><th>First Date</th><th>Last Date</th><th>Exact</th><th>Estimated</th></tr></thead><tbody>
            {builderDistribution.length ? builderDistribution.map((row) => <tr key={`${row.builder_id}-${row.area}`}><td>{row.area}</td><td>{row.area_type}</td><td>{fmtHours(row.total_hours)}</td><td>{fmtPercent(builderSummary.total_active_hours > 0 ? row.total_hours / builderSummary.total_active_hours : 0)}</td><td>{row.days_worked}</td><td>{fmtHours(row.average_hours_per_day)}</td><td>{row.first_worked_date}</td><td>{row.most_recent_worked_date}</td><td>{fmtHours(row.exact_hours)}</td><td>{fmtHours(row.estimated_hours)}</td></tr>) : <EmptyRow columns={10} />}
          </tbody></table></div>
          <details><summary>Session history ({builderHistory.length})</summary><div className="analysis-table-wrap compact"><table><thead><tr><th>Day</th><th>Area</th><th>Hours</th><th>Source</th><th>Accuracy</th><th>Start</th><th>End</th><th>Role</th><th>Notes</th></tr></thead><tbody>{builderHistory.length ? builderHistory.map((row) => <tr key={row.record_id}><td>{row.operational_day}</td><td>{row.area}</td><td>{fmtHours(row.calculated_hours)}</td><td>{row.calculation_source}</td><td>{row.accuracy}</td><td>{row.start_time || '—'}</td><td>{row.end_time || '—'}</td><td>{row.role || '—'}</td><td>{row.notes || row.issue || '—'}</td></tr>) : <EmptyRow columns={9} />}</tbody></table></div></details>
        </div>
      ) : null}

      {view === 'area' ? (
        <div className="builder-area-view">
          <div className="table-title-row"><div><div className="table-kicker">Area Contribution and Coverage</div><div className="small">Area totals, dependency, coverage context, and individual recorded sessions.</div></div><label>Area<select value={areaSummary?.area || ''} onChange={(event) => setSelectedArea(event.target.value)}>{areas.map((row) => <option key={row.area} value={row.area}>{row.area}</option>)}</select></label></div>
          {areaSummary ? <div className="builder-area-summary-strip"><span><strong>Total:</strong> {fmtHours(areaSummary.total_hours)}h</span><span><strong>Builders:</strong> {areaSummary.unique_builders}</span><span><strong>Worked Days:</strong> {areaSummary.worked_days}</span><span><strong>Top Contributor:</strong> {areaSummary.top_builder || '—'} ({fmtHours(areaSummary.top_builder_hours)}h)</span><span><strong>Dependency:</strong> {fmtPercent(areaSummary.top_builder_percentage)} {areaSummary.dependency_warning ? `· ${areaSummary.dependency_warning}` : ''}</span><span><strong>Exact:</strong> {fmtPercent(areaSummary.exact_hour_percentage)}</span></div> : null}
          <div className="analysis-table-wrap compact"><table><thead><tr><th>Rank</th><th>Builder</th><th>Hours</th><th>% Area</th><th>Days</th><th>Avg/Day</th><th>First Date</th><th>Most Recent</th><th>Exact</th><th>Estimated</th><th>Skills / Roles</th></tr></thead><tbody>{areaLeaders.length ? areaLeaders.map((row) => <tr key={`${row.area}-${row.builder_id}`}><td>{row.rank}</td><td>{row.builder}</td><td>{fmtHours(row.total_hours)}</td><td>{fmtPercent(row.area_hours_percentage)}</td><td>{row.days_worked}</td><td>{fmtHours(row.average_hours_per_day)}</td><td>{row.first_worked_date}</td><td>{row.most_recent_worked_date}</td><td>{fmtHours(row.exact_hours)}</td><td>{fmtHours(row.estimated_hours)}</td><td>{row.relevant_skills || '—'}</td></tr>) : <EmptyRow columns={11} />}</tbody></table></div>
          <details><summary>Area session detail ({areaHistory.length})</summary><div className="analysis-table-wrap compact"><table><thead><tr><th>Day</th><th>Builder</th><th>Hours</th><th>Source</th><th>Accuracy</th><th>Start</th><th>End</th><th>Sub-area</th><th>Role</th></tr></thead><tbody>{areaHistory.length ? areaHistory.map((row) => <tr key={row.record_id}><td>{row.operational_day}</td><td>{row.builder}</td><td>{fmtHours(row.calculated_hours)}</td><td>{row.calculation_source}</td><td>{row.accuracy}</td><td>{row.start_time || '—'}</td><td>{row.end_time || '—'}</td><td>{row.sub_area || '—'}</td><td>{row.role || '—'}</td></tr>) : <EmptyRow columns={9} />}</tbody></table></div></details>
        </div>
      ) : null}

      {analysis.warnings.length ? <details className="builder-area-quality"><summary>Area-hours data quality ({analysis.warnings.length})</summary><div className="analysis-table-wrap compact"><table><thead><tr><th>Severity</th><th>Code</th><th>Day</th><th>Builder</th><th>Area</th><th>Issue</th><th>Recommended Action</th></tr></thead><tbody>{analysis.warnings.map((row, index) => <tr key={`${row.code}-${row.record_id}-${index}`}><td>{row.severity}</td><td>{row.code}</td><td>{row.operational_day || '—'}</td><td>{row.builder || '—'}</td><td>{row.area || '—'}</td><td>{row.issue}</td><td>{row.recommended_action}</td></tr>)}</tbody></table></div></details> : null}
      <div className="small builder-area-footer">Week {selectedWeek} · {scope === 'day' ? selectedDay : 'Monday–Friday'} · Board and shift remain isolated · Generated {new Date().toLocaleString()}</div>
    </section>
  )
}
