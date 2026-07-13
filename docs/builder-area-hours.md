# Builder Area Hours and Area Leaderboards

## Purpose

The Builder Area Hours feature shows where builders worked, how many recorded hours were associated with each area, and who contributed the most recorded hours to each area.

The feature uses neutral operational language. Recorded hours describe staffing contribution and coverage. They are not a productivity rating and do not prove that one employee performed better than another.

## Scope and isolation

Calculations remain isolated by:

- Board: SPEED, FA Lab, or Bodega
- Shift: Day or Night
- Week start date
- Operational day

Night Shift activity after midnight remains attached to the operational day on which the Night Shift began.

Shift definitions:

- Day Shift: 8:00 AM–4:30 PM
- Night Shift: 5:00 PM–1:30 AM
- Normal paid time: 8 hours
- Unpaid break: 30 minutes, deducted no more than once

## Calculation priority

StaffBoard uses the most detailed available source in this order:

1. Completed `areaHistory` movement or assignment sessions
2. Imported historical area-hour records
3. Q1/Q2/Q3 snapshot assignments
4. Clock-in and clock-out with the current area
5. Estimated full-shift assignment

### Exact hours

A session is labeled **Exact** when a valid area session has both a real start and end timestamp.

### Estimated hours

A session is labeled **Estimated** when the area duration must be inferred from imported totals, snapshots, current assignment state, or attendance times without complete movement history.

Estimated records do not fabricate historical movement timestamps. When a real start or end time is unavailable, the Excel and Analysis views leave it blank.

## Break and shift limits

- Exact raw sessions may span the 30-minute unpaid break.
- When exact sessions total between 8 and 8.5 hours, StaffBoard deducts the excess once from the longest session.
- Normal hours are capped at 8 unless a future authorized overtime record is available.
- Partial shifts of eight hours or less do not automatically lose another break.
- Negative durations are rejected.

## Duplicate and overlap protection

The calculation engine detects:

- Duplicate sessions with the same builder, area, start, and end
- Overlapping sessions
- End time before start time
- Missing session start or end
- Hours above the normal paid shift
- Reconciliation differences between expected paid hours and area totals

Duplicate sessions are excluded. Overlap is trimmed so the same time is not counted twice, and the issue is recorded in Area Hours Data Quality.

## Builder summaries

Each builder summary includes:

- Total assigned and active hours
- Production, support, labor-share, and unassigned hours
- Number of areas and operational days worked
- Primary, secondary, and tertiary areas
- Primary-area hours and percentage
- Average active hours per worked day
- Area movement count
- First and most recent areas
- Exact and estimated hours
- Expected paid hours
- Area Hours Difference
- Data-quality warning count

### Primary-area tie handling

Primary area is selected by:

1. Highest valid hours
2. More worked days
3. Most recent worked date
4. Area name alphabetically

`Unassigned` is not selected as primary when the builder has valid worked-area hours.

## Area leaderboard ranking

Builders are ranked within each area by:

1. Total valid area hours, descending
2. Worked days, descending
3. Most recent worked date, descending
4. Builder name alphabetically

Dense ranks are used. Builders with the same valid hours and worked-day count share a rank, for example `1, 2, 2, 3`.

Leaderboard context includes:

- Percentage of total area hours
- Worked days and average hours per day
- Session count
- Exact and estimated hours
- Primary-area indicator
- Line Lead, Trainer, Safety, and skill context
- Data-quality warning count

## Area dependency warning

An area is flagged when one builder represents more than 50% of recorded area hours.

The threshold can be supplied through future state settings using `areaDependencyWarningPercent`. The current safe default is 50%.

Example:

```text
High dependency: Avery Builder represents 61.0% of Rack Prep hours.
```

## Analysis workspace

Open the existing Analysis tab and find **Builder Area Hours**.

Filters support:

- Current or saved week
- Selected week or selected day
- Top 3, Top 5, Top 10, or all contributors
- Area
- Builder
- Include or exclude estimated hours
- Include or exclude Unassigned

Views:

- Area Leaderboard
- Builder Detail
- Area Detail

All tables are keyboard accessible and include text labels for rank, accuracy, and warnings.

## Excel sheets

### Daily workbook

- Builder Area History
- Builder Area Summary
- Area Leaderboard
- Area Hours Matrix
- Area Hours Summary
- Area Hours Quality

### Weekly workbook

- Builder Area History
- Builder Weekly Areas
- Builder Primary Areas
- Area Top Builders
- Area Leaderboard Summary
- Weekly Area Matrix
- Area Daily Trend
- Area Hours Summary
- Area Hours Quality

The sheets include filters, frozen headers, frozen identifier columns, wrapped text, `0.00` hour formatting, `0.0%` percentage formatting, landscape printing, fit-to-width settings, page headers, page footers, board/shift/week metadata, and state revision traceability.

## Closed days

Closure records remain visible in session metadata. Closed days are not inserted as zero-hour ranking records. Existing historical hours are preserved when present.

## Historical limitations

Older records may not contain `areaHistory` sessions. StaffBoard then uses the safest available fallback and labels the result **Estimated**.

A custom date range is only possible when the requested weeks exist in the current board’s saved `weeklyBoards` or `weeklyHistory` data. The UI currently exposes the most recent available weeks.

## Manual corrections

This release does not provide direct editing of calculated area history. That prevents silent changes to derived data. Corrections should be made to the original assignment, movement, attendance, or imported-history record through an authorized workflow so existing audit and recovery protections remain effective.

## Validation

Run focused tests:

```bash
npm run test:area-hours
```

Run Excel tests:

```bash
npm run test:excel
```

Run full validation:

```bash
npm run lint
npm test
npm run build
npm run check
```

## Manual verification

1. Open SPEED Day and export a daily workbook.
2. Confirm the six new daily area-hours sheets exist.
3. Move one test builder between two areas and confirm total hours do not exceed eight.
4. Confirm exact movement sessions and estimated fallback records are labeled correctly.
5. Export the weekly workbook and confirm primary areas, area rankings, matrices, and daily trends.
6. Open Analysis → Builder Area Hours.
7. Compare a builder distribution with the weekly Excel summary.
8. Confirm Day/Night, board, week, and operational-day context do not mix.
9. Review Area Hours Quality before distributing a workbook.
10. Confirm the production build and GitHub Actions pass.
