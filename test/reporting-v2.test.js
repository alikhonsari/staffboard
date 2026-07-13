import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { buildDailyWorkbook, buildWeeklyWorkbook, __reportingV2 } from '../src/reporting-v2.js'
import { reportingV2Plugin } from '../reporting-v2-plugin.js'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

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

function day(overrides = {}) {
  return {
    updatedAt: '2026-07-13T12:00:00.000Z',
    assignments: {},
    movementLog: [],
    attendanceLog: [],
    speedLiteTeams: [],
    opsMetrics: {
      targetRackMediaRecovery: 10,
      racksProcessed: 8,
      targetRackPrep: 5,
      racksPrepped: 4,
      recoveredRackPrep: 1,
      totalMediaCount: 100,
      mediaProcessed: 80,
    },
    rackLists: {
      processed: 'R100 decom\nR101 media',
      prepped: 'R200 SPEED',
    },
    ...overrides,
  }
}

function fixture() {
  const builders = [
    builder('b1', 'Avery Lead', { isLineLead: true, trainedTdr: true, isSafetyMember: true }),
    builder('b2', 'Jordan Builder', { trainedForklift: true, trainedReachTruck: true }),
    builder('b3', 'Casey Builder', { trainedClampTruck: true }),
  ]
  const monday = day({
    assignments: {
      b1: { status: 'Present', area: 'Shipping', role: 'Line Lead', clockInTime: '08:00', leaveTime: '16:30' },
      b2: { status: 'Present', area: 'Rack Prep', clockInTime: '08:00', leaveTime: '16:30' },
      b3: { status: 'Present', area: 'Unassigned', clockInTime: '', leaveTime: '' },
    },
  })
  const weeklyData = Object.fromEntries(WEEKDAYS.map((name) => [name, name === 'Monday' ? monday : day({ assignments: {}, rackLists: { processed: '', prepped: '' }, opsMetrics: {} })]))
  return {
    state: {
      currentBoardId: 'speed_day',
      boardTitle: 'SPEED Staffing Board',
      boardShift: 'Day Shift',
      weekStartDate: '2026-07-13',
      selectedDay: 'Monday',
      stateRevision: 42,
      builderPool: builders,
      areaDefs: [
        { name: 'Unassigned', areaType: 'unassigned' },
        { name: 'Rack Prep', areaType: 'production', capacity: 1 },
        { name: 'Shipping', areaType: 'support', capacity: 1 },
      ],
      weeklyData,
      dayClosures: {},
    },
    builders,
    monday,
  }
}

test('daily workbook contains dashboard, operational detail, filters, and data-quality findings', () => {
  const { state, builders, monday } = fixture()
  const wb = buildDailyWorkbook({
    state,
    dayState: monday,
    selectedDay: 'Monday',
    activeBuilders: builders,
    totalHeadCount: 3,
    counts: {},
    metrics: {},
    areaCounts: state.areaDefs,
    adminName: 'Ali',
  })

  assert.deepEqual(wb.SheetNames.slice(0, 5), ['Daily Dashboard', 'Staff Assignments', 'Area Coverage', 'Skill Coverage', 'Rack Detail'])
  assert.ok(wb.SheetNames.includes('Material Summary'))
  assert.ok(wb.SheetNames.includes('Data Quality'))
  assert.ok(wb.SheetNames.includes('Report Guide'))

  const assignments = wb.Sheets['Staff Assignments']
  assert.ok(assignments['!autofilter'])
  assert.ok(assignments['!freeze'])

  const qualityRows = XLSX.utils.sheet_to_json(wb.Sheets['Data Quality'], { defval: '' })
  assert.ok(JSON.stringify(qualityRows).includes('Active builders are unassigned'))

  const rackRows = __reportingV2.rackRowsForDay(monday, 'Monday')
  assert.deepEqual(rackRows.map((row) => row.work_category), ['Decom', 'Media / NTE / E&O', 'SPEED'])
})

test('weekly workbook excludes closed days from executive performance totals and adds summary sheets', () => {
  const { state, builders } = fixture()
  state.dayClosures = {
    speed: {
      '2026-07-13': {
        Tuesday: {
          dayShift: { closed: true, reason: 'Maintenance' },
        },
      },
    },
  }

  const wb = buildWeeklyWorkbook({
    state,
    weekDays: WEEKDAYS,
    getDayData: (name) => state.weeklyData[name],
    builderPool: builders,
    areaDefs: state.areaDefs,
    adminName: 'Ali',
  })

  assert.equal(wb.SheetNames[0], 'Weekly Dashboard')
  assert.ok(wb.SheetNames.includes('Daily Summary'))
  assert.ok(wb.SheetNames.includes('Builder Weekly Summary'))
  assert.ok(wb.SheetNames.includes('Area Weekly Summary'))
  assert.ok(wb.SheetNames.includes('Skill Coverage'))
  assert.ok(wb.SheetNames.includes('Tuesday Staff'))

  const dailyRows = XLSX.utils.sheet_to_json(wb.Sheets['Daily Summary'], { defval: '' })
  assert.ok(JSON.stringify(dailyRows).includes('Day Shift Closed — Maintenance'))
})

test('reporting v2 plugin replaces only the reporting module', () => {
  const plugin = reportingV2Plugin()
  assert.equal(plugin.transform('export const x = 1', '/workspace/src/other.js'), null)
  const transformed = plugin.transform('legacy reporting code', '/workspace/src/reporting.js')
  assert.match(transformed.code, /reporting-v2\.js/)
  assert.match(transformed.code, /exportEndOfShiftExcel/)
})
