import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { buildAreaHoursAnalysis } from '../src/area-hours-core.js'
import { enhanceDailyAreaHoursWorkbook, enhanceWeeklyAreaHoursWorkbook } from '../src/reporting-area-hours.js'
import { builderAreaHoursPlugin, validateBuilderAreaHoursOutput } from '../builder-area-hours-plugin.js'
import { areaHoursReportingPlugin, validateAreaHoursReportingOutput } from '../area-hours-reporting-plugin.js'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

function builder(id, name, extra = {}) {
  return {
    id,
    name,
    badgeType: 'day',
    trainedTdr: false,
    trainedForklift: false,
    trainedCenterRider: false,
    trainedClampTruck: false,
    trainedRackMover: false,
    trainedReachTruck: false,
    isTrainer: false,
    isSafetyMember: false,
    isLineLead: false,
    ...extra,
  }
}

function emptyDay(assignments = {}) {
  return { assignments, movementLog: [], attendanceLog: [], snapshots: { q1: null, q2: null, q3: null }, speedLiteTeams: [], updatedAt: '2026-07-13T20:30:00.000Z' }
}

function fixture({ shift = 'Day Shift', boardId = 'speed_day', mondayAssignments = {}, builders } = {}) {
  const pool = builders || [builder('b1', 'Avery Builder')]
  const weeklyData = Object.fromEntries(DAYS.map((day) => [day, emptyDay(day === 'Monday' ? mondayAssignments : {})]))
  return {
    currentBoardId: boardId,
    boardTitle: 'SPEED Staffing Board',
    boardShift: shift,
    weekStartDate: '2026-07-13',
    selectedDay: 'Monday',
    stateRevision: 7,
    builderPool: pool,
    areaDefs: [
      { name: 'Unassigned', areaType: 'unassigned' },
      { name: 'Rack Prep', areaType: 'production', capacity: 2 },
      { name: 'Speed Line 1', areaType: 'production', capacity: 2 },
      { name: 'Shipping', areaType: 'support', capacity: 1 },
    ],
    weeklyData,
    weeklyBoards: { '2026-07-13': weeklyData },
    dayClosures: {},
  }
}

function analyze(state, days = ['Monday']) {
  return buildAreaHoursAnalysis({ state, weekData: state.weeklyData, weekStartDate: state.weekStartDate, days, includeEstimated: true, includeUnassigned: true })
}

test('full-shift assignment is capped at eight paid estimated hours', () => {
  const state = fixture({ mondayAssignments: { b1: { status: 'Present', area: 'Rack Prep', clockInTime: '08:00', leaveTime: '16:30', areaHistory: [] } } })
  const result = analyze(state)
  assert.equal(result.metrics.total_recorded_hours, 8)
  assert.equal(result.metrics.exact_hours, 0)
  assert.equal(result.metrics.estimated_hours, 8)
  assert.equal(result.sessions[0].calculation_source, 'Clock In / Clock Out')
  assert.equal(result.sessions[0].accuracy, 'Estimated')
})

test('area movement sessions are exact, do not double count, and deduct the unpaid break once', () => {
  const state = fixture({ mondayAssignments: { b1: {
    status: 'Present', area: 'Speed Line 1', clockInTime: '08:00', leaveTime: '16:30',
    areaHistory: [
      { id: 's1', area: 'Rack Prep', startIso: '2026-07-13T08:00:00-04:00', endIso: '2026-07-13T12:00:00-04:00' },
      { id: 's2', area: 'Speed Line 1', startIso: '2026-07-13T12:00:00-04:00', endIso: '2026-07-13T16:30:00-04:00' },
    ],
  } } })
  const result = analyze(state)
  assert.equal(result.metrics.total_recorded_hours, 8)
  assert.equal(result.metrics.exact_hours, 8)
  assert.deepEqual(result.builderAreaRows.map((row) => [row.area, row.total_hours]).sort(), [['Rack Prep', 4], ['Speed Line 1', 4]])
  assert.ok(result.warnings.some((row) => row.code === 'UNPAID_BREAK_DEDUCTED'))
})

test('overlapping sessions are trimmed and flagged instead of inflating totals', () => {
  const state = fixture({ mondayAssignments: { b1: {
    status: 'Present', area: 'Shipping',
    areaHistory: [
      { id: 's1', area: 'Rack Prep', startIso: '2026-07-13T08:00:00-04:00', endIso: '2026-07-13T12:00:00-04:00' },
      { id: 's2', area: 'Shipping', startIso: '2026-07-13T11:00:00-04:00', endIso: '2026-07-13T16:00:00-04:00' },
    ],
  } } })
  const result = analyze(state)
  assert.equal(result.metrics.total_recorded_hours, 8)
  assert.ok(result.warnings.some((row) => row.code === 'OVERLAPPING_SESSION'))
  assert.equal(result.builderSummary[0].area_hours_difference, 0)
})

test('night shift crossing midnight remains on the originating operational day', () => {
  const nightBuilder = builder('b1', 'Night Builder', { badgeType: 'night' })
  const state = fixture({
    shift: 'Night Shift',
    boardId: 'speed_night',
    builders: [nightBuilder],
    mondayAssignments: { b1: { status: 'Present', area: 'Rack Prep', areaHistory: [{ id: 'night-1', area: 'Rack Prep', startIso: '2026-07-13T17:00:00-04:00', endIso: '2026-07-14T01:30:00-04:00' }] } },
  })
  const result = analyze(state)
  assert.equal(result.metrics.total_recorded_hours, 8)
  assert.equal(result.sessions[0].operational_day, 'Monday')
  assert.equal(result.sessions[0].calendar_date, '2026-07-13')
  assert.equal(result.sessions[0].shift, 'Night Shift')
})

test('primary area and dense leaderboard ranking use hours and worked-day ties', () => {
  const builders = [builder('b1', 'Avery'), builder('b2', 'Blake'), builder('b3', 'Casey')]
  const state = fixture({ builders, mondayAssignments: {
    b1: { status: 'Present', area: 'Rack Prep', importedAreaHours: { 'Rack Prep': 4, Shipping: 2 } },
    b2: { status: 'Present', area: 'Rack Prep', importedAreaHours: { 'Rack Prep': 4 } },
    b3: { status: 'Present', area: 'Rack Prep', importedAreaHours: { 'Rack Prep': 2 } },
  } })
  const result = analyze(state)
  const avery = result.builderSummary.find((row) => row.builder === 'Avery')
  assert.equal(avery.primary_area, 'Rack Prep')
  assert.equal(avery.second_area, 'Shipping')
  const rack = result.leaderboards.filter((row) => row.area === 'Rack Prep')
  assert.deepEqual(rack.map((row) => [row.builder, row.rank]), [['Avery', 1], ['Blake', 1], ['Casey', 2]])
  assert.equal(rack[0].area_hours_percentage, 0.4)
})

test('single-builder dependency is reported without productivity language', () => {
  const builders = [builder('b1', 'Avery'), builder('b2', 'Blake')]
  const state = fixture({ builders, mondayAssignments: {
    b1: { status: 'Present', area: 'Rack Prep', importedAreaHours: { 'Rack Prep': 7 } },
    b2: { status: 'Present', area: 'Rack Prep', importedAreaHours: { 'Rack Prep': 1 } },
  } })
  const result = analyze(state)
  const rack = result.areaSummaries.find((row) => row.area === 'Rack Prep')
  assert.equal(rack.dependency_warning, 'High Dependency')
  assert.ok(result.warnings.some((row) => row.code === 'SINGLE_BUILDER_DEPENDENCY' && row.issue.includes('87.5%')))
  assert.ok(!JSON.stringify(result).includes('Best employee'))
})

test('daily and weekly workbook enhancers add required area-hours sheets and formatting', () => {
  const state = fixture({ mondayAssignments: { b1: { status: 'Present', area: 'Rack Prep', clockInTime: '08:00', leaveTime: '16:30', areaHistory: [] } } })
  const daily = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(daily, XLSX.utils.aoa_to_sheet([['Existing']]), 'Daily Dashboard')
  XLSX.utils.book_append_sheet(daily, XLSX.utils.aoa_to_sheet([['Quality']]), 'Data Quality')
  enhanceDailyAreaHoursWorkbook(daily, { state, dayState: state.weeklyData.Monday, selectedDay: 'Monday', builders: state.builderPool, adminName: 'Ali' })
  for (const name of ['Builder Area History', 'Builder Area Summary', 'Area Leaderboard', 'Area Hours Matrix', 'Area Hours Summary', 'Area Hours Quality']) assert.ok(daily.SheetNames.includes(name))
  assert.ok(daily.Sheets['Builder Area History']['!autofilter'])
  assert.ok(daily.Sheets['Area Hours Matrix']['!freeze'])

  const weekly = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(weekly, XLSX.utils.aoa_to_sheet([['Existing']]), 'Weekly Dashboard')
  XLSX.utils.book_append_sheet(weekly, XLSX.utils.aoa_to_sheet([['Quality']]), 'Data Quality')
  enhanceWeeklyAreaHoursWorkbook(weekly, { state, weekDays: DAYS, getDayData: (day) => state.weeklyData[day], builderPool: state.builderPool, adminName: 'Ali' })
  for (const name of ['Builder Area History', 'Builder Weekly Areas', 'Builder Primary Areas', 'Area Top Builders', 'Area Leaderboard Summary', 'Weekly Area Matrix', 'Area Daily Trend', 'Area Hours Summary', 'Area Hours Quality']) assert.ok(weekly.SheetNames.includes(name))
  assert.ok(weekly.Sheets['Area Top Builders']['!autofilter'])
})

test('Vite integrations fail loudly when expected analysis or reporting markers are missing', () => {
  const uiPlugin = builderAreaHoursPlugin()
  const source = "import { exportEndOfShiftExcel, exportWeeklyExcel } from './reporting'\n" + `          <div className="summary-card-block card">\n            <div className="table-title-row">\n              <div>\n                <div className="table-kicker">Saved Week History</div>`
  const transformedUi = uiPlugin.transform(source, '/workspace/src/App.jsx')
  assert.match(transformedUi.code, /BuilderAreaHoursPanel/)
  assert.equal(validateBuilderAreaHoursOutput(transformedUi.code), true)

  const reportingPlugin = areaHoursReportingPlugin()
  const reportSource = "import * as XLSX from 'xlsx'\n  appendSheet(wb, 'Report Guide', guideRows('Daily'), { title: 'Daily Report Guide', accent: C.navy })\n  return wb\n  appendSheet(wb, 'Report Guide', guideRows('Weekly'), { title: 'Weekly Report Guide', accent: C.navy })\n  return wb"
  const transformedReporting = reportingPlugin.transform(reportSource, '/workspace/src/reporting-v2.js')
  assert.match(transformedReporting.code, /enhanceDailyAreaHoursWorkbook/)
  assert.match(transformedReporting.code, /enhanceWeeklyAreaHoursWorkbook/)
  assert.equal(validateAreaHoursReportingOutput(transformedReporting.code), true)
})
