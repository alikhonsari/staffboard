# StaffBoard Excel Reports

## Daily workbook

The **Individual Day Excel** export now opens with a `Daily Dashboard` and includes:

- Executive KPI snapshot
- Headcount and attendance summary
- Recovery, Rack Prep, and Media progress with completion percentages
- Required and target TPH
- Top report exceptions
- Staff assignments with status, area, role, times, scheduled transitions, estimated hours, skills, and notes
- Area capacity, utilization, Line Lead coverage, and skill counts
- Shift-wide skill and role coverage
- Rack IDs, original material text, reporting categories, and material summary
- Movement and attendance histories
- Labor-share hours
- Speed Lite team and member detail
- Data Quality exceptions
- Report interpretation guide

## Weekly workbook

The **Weekly Excel** export now opens with a `Weekly Dashboard` and includes:

- Open and closed day counts
- Weekly goal, completed work, remaining work, and completion percentage
- Average active and production headcount
- Weekly staffed hours
- Recovery, Rack Prep, Media, and rack-entry totals
- Labor-share hours and unassigned headcount-days
- Daily staffing and workload summary
- Builder weekly summary with hours, active days, status days, and rotation areas
- Weekly staff matrix
- Builder hours by area and detailed daily hours
- Daily and weekly area coverage summaries
- Skill coverage by day
- Weekly rack and material summaries
- Labor-share and Speed Lite reports
- Consolidated Data Quality exceptions
- Individual daily staffing sheets
- Report interpretation guide

## Closed-day behavior

A closed operational day or shift is labeled in the workbook and excluded from weekly performance totals. It is not counted as a zero-performance day.

## Data Quality sheet

Review this sheet before distributing the workbook. It can identify:

- Active unassigned builders
- Areas over configured capacity
- Missing active Line Lead coverage
- Incomplete clock times
- Duplicate rack IDs
- Rack entries without a material type

## Workbook usability

Detailed sheets include:

- Frozen title/header areas
- Header filters
- Controlled column widths and wrapped text
- Number formats for hours and percentages
- Landscape print settings and fit-to-width configuration
- Workbook title, author, generation time, board ID, shift, week, and state revision

## Validation

Run:

```bash
npm run test:excel
npm run check
```
