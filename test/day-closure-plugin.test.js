import test from 'node:test'
import assert from 'node:assert/strict'
import { __test } from '../day-closure-plugin.js'

test('App transform installs closure controls, exclusions, schedule disabling, copy guards, and Slack status', () => {
  const source = `
import React, { useEffect, useMemo, useRef, useState } from 'react'
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
function StaffBoardApp(){
  const [syncStatus, setSyncStatus] = useState('Loading...')
  const dayState = state.weeklyData[state.selectedDay] || defaultDay()
  useEffect(() => {\n    const t = setInterval(() => setTick(Date.now()), 60000)
  const updateDay = (updater) => {\n    saveState((prev) => {
    const updateBuilderAssignment = (builderId, patch) => {\n    if (!builderId) return
  const counts = useMemo(() => {\n    let present = 0
  const shift = useMemo(() => {\n    const now = new Date()
  const totalHeadCount = useMemo(() => {\n    const manual = numVal(dayState.opsMetrics.manualHeadCount)
  const metrics = useMemo(() => {\n    const ops = dayState.opsMetrics
  const areaCounts = useMemo(() => effectiveAreaDefs.map((a) => ({\n    ...a,\n    count: activeBuilders.filter((b) => {
  const staffingSuggestions = useMemo(() => {\n    const unassigned
  const snapshot = {\n    weekStartDate: state.weekStartDate,
  WEEKDAYS.forEach((day) => {\n    const dayState = state.weeklyData?.[day] || defaultDay()
  if (Number(totals.staffedHours || 0) > 0) return true\n  return false
  const currentWeekDayWork = (currentWeekAnalysis.byDay || []).map((d) => ({ label: d.day.slice(0,3), value: d.recoveryProcessed + d.rackPrepDone + (d.totalMediaCount / RACK_WEIGHT) }))
      WEEKDAYS.forEach((day) => {\n        const assignment = (state.weeklyData[day] || defaultDay()).assignments[builder.id]
    const mode = document.getElementById('copyDayMode')?.value || 'full'\n    if (!WEEKDAYS.includes(targetDay)) return alert('Pick a target day.')
    const template = dayTemplates.find((t) => t.id === templateId)\n    if (!template) return alert('Pick a template.')
  const slackText = (type = 'daily') => {\n
  return (
    <div className={state.darkMode ? "app dark" : "app"} style={{ gridTemplateColumns: x }}>
        <div className="main-top-tabs"></div>

        {mainTab === 'board' ? (
{WEEKDAYS.map((day) => (
                <button key={day} className={state.selectedDay === day ? 'day-tab active' : 'day-tab'} onClick={() => saveState((prev) => ({ ...prev, selectedDay: day }))}>
                  {day}
                </button>
              ))}
<div className="muted">Last update: <strong>{dayState.updatedAt || '—'}</strong></div>
          <div ref={weeklyPdfRef} className="pdf-report-sheet">
<input disabled={scheduleBusy} />
<button disabled={scheduleBusy || !pending}>x</button>
`;
  const out = __test.injectApp(source)
  assert.match(out, /requestDayClosure/)
  assert.match(out, /SITE CLOSED/)
  assert.match(out, /Mark Day Closed/)
  assert.match(out, /if \(isDayClosed\) return \[\]/)
  assert.match(out, /target day is closed/)
  assert.match(out, /day-closed/)
  assert.match(out, /disabled=\{scheduleBusy \|\| isDayClosed\}/)
  assert.match(out, /disabled=\{scheduleBusy \|\| isDayClosed \|\| !pending\}/)
  assert.match(out, /Excluded — Site Closed/)
})

test('reporting transform adds closure metadata and excludes closed days from weekly totals', () => {
  const source = `
const RACK_WEIGHT = 6.4
export function exportEndOfShiftExcel({ state, dayState, metrics, counts, areaCounts, totalHeadCount, rackWeight, getAssignment, activeBuilders, selectedDay, adminName }) {
  const reportAdmin = adminName || state.adminName || state.boardLead || 'Not set'
  const calc = { ...opsMetrics(dayState, rackWeight, totalHeadCount, shift), ...metrics }
  const meta = [
    ['Board', state.boardTitle], ['Logged-in Admin', reportAdmin],
  appendDataSheet(wb, 'Attendance History', (dayState.attendanceLog || []).map((a) => ({ timestamp: a.timestamp, clock_time: a.clock_time, builder: a.builder, event: a.event, note: a.note })), { title: \`${'${selectedDay}'} Attendance History\`, meta, accent: COLORS.red })
}
export function exportWeeklyExcel(){
  const dailySummary = weekDays.map((day) => {
    const dayData = getDayData(day)
    return {
      day,
      shift_start: shift.startLabel,
      active_hc: hc.active,
      total_goal_work: round(ops.totalWorkload),
      completed_work: round(ops.completedWorkload),
      remaining_work: round(ops.remainingWork),
      required_tph: round(ops.requiredTPH),
  const totals = dailySummary.reduce((acc, row) => {
    acc.recovery += row.recovery_done
  const weeklyHours = weeklyHoursRows({ weekDays, getDayData, builderPool, computeHoursForAssignment, weekStartDate: state.weekStartDate })
  const totalStaffedHours
  const allRacks = weekDays.flatMap((day) => rackRowsForDay(getDayData(day), day))
    ['Generated', new Date().toLocaleString()], ['Roster Size', builderPool.length],
        rows: dailySummary.map((row) => [row.day, \`${'${row.shift_start}'} - ${'${row.shift_end}'}\`, row.active_hc, row.present, row.pto, row.recovery_done, row.prep_done, row.media_done]),
        rows: dailySummary.map((row) => [row.day, row.total_goal_work, row.completed_work, row.remaining_work, row.required_tph, row.unassigned, row.line_leads, row.updated_at]),
  appendDataSheet(wb, 'Area Counts by Day', areaSummary, { title: 'Area Coverage by Day', subtitle: \`${'${state.boardShift}'} · ${'${shiftWindow}'}\`, meta, accent: COLORS.orange })
}`
  const out = __test.injectReporting(source)
  assert.match(out, /reportingClosureForState/)
  assert.match(out, /if \(row\.excluded\) return acc/)
  assert.match(out, /operatingWeekDays/)
  assert.match(out, /Closure Status/)
})

test('Daily PDF transform creates a compact one-page closure report', () => {
  const source = `
const text = (value, fallback = '—') => String(value || '').trim() || fallback
const DailyPdfReportV3 = forwardRef(function DailyPdfReportV3(props, ref) {
  const boardId = state.currentBoardId || 'speed_day'
  const speedBoard = true
  return (
    <div ref={ref} className="daily-pdf-v3-root" data-daily-pdf-v3="true" data-report-version={DAILY_PDF_V3_VERSION}>
`;
  const out = __test.injectDailyPdf(source)
  assert.match(out, /pdfClosureForState/)
  assert.match(out, /daily-pdf-v3-closure-page/)
  assert.match(out, /pageCount=\{1\}/)
  assert.match(out, /Historical Data/)
})
