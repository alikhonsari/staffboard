# StaffBoard V6

Full V6 staffing board restored for DigitalOcean App Platform.

## Included

- Full weekly V6 staffing board UI.
- Board tabs, analysis, builders, and comments.
- Builder master roster, badge colors, training tags, trainer/safety/line-lead flags.
- Drag-and-drop staffing by area.
- Q1 / Q2 / Q3 snapshots.
- Day, weekly, attendance, roster, JSON, PNG, PDF, and Excel exports.
- SPEED / FA / Bodega board presets from the V6 app.
- Shared state saved to DigitalOcean Spaces.
- Shared admin token for multiple admins.
- Persistent, server-authoritative scheduled clock-in and clock-out transitions.
- Server-authoritative operational-day and shift closure controls.
- Server-authoritative version history, scoped undo/restore, snapshots, and administrative recovery exports.

## Scheduled clock transitions

Scheduled attendance changes are persisted in the shared Spaces state and evaluated by the server, not by an open browser tab.

- Scheduled clock-out keeps the builder active until the complete scheduled timestamp is reached, then closes the current area session, changes the builder to PTO, clears the active area, and updates shared metrics.
- Scheduled clock-in keeps the builder in PTO until the complete scheduled timestamp is reached, then changes the builder to Present and places them in Unassigned.
- Pending events are reconciled on startup, state reads, state writes, schedule-status polling, the exact next due time, and a fallback sweep.
- Each event stores its board, shift, week, operational day, builder, scheduled effective time, actual processed time, actor, and audit history.
- Night-shift times after midnight remain attached to the prior operational day.
- Canceled and replaced events cannot overwrite a newer manual status or area change.

## Operational-day closures

Authorized admins can mark an entire operational day, Day Shift only, or Night Shift only as closed for a holiday, building closure, weather, maintenance, emergency, planned shutdown, or custom reason.

- Closure state is stored in the shared Spaces JSON and validated by the server.
- An entire-day closure covers both the Day Shift and the Night Shift that begins on the selected operational date; the after-midnight portion remains attached to that date.
- Pending scheduled clock transitions in the affected scope are canceled and audited. Completed transitions and historical staffing, assignment, production, rack, note, and area-hour records remain unchanged.
- Closed days reject staffing, scheduling, production, note, rack, copy-day, and template changes until an admin reopens the day or shift.
- Reopening never restores canceled schedules automatically.
- Closed days are labeled in navigation, boards, PNG captures, Slack summaries, manager views, PDF reports, and Excel exports.
- Closed days are excluded from staffing, TPH, productivity, utilization, attendance-exception, rotation-fairness, and goal-completion averages instead of being counted as zero-performance days.

Closure endpoints:

```text
GET  /api/day-closures/status
POST /api/day-closures
```

The POST endpoint accepts `close` and `reopen` actions and is restricted to authenticated administrators.

## Data recovery and version history

The Recovery tab provides server-authoritative protection against accidental clears, bulk edits, template replacement, incorrect assignments, stale sessions, and data corruption.

### Version timeline

Meaningful changes are written to a separate Spaces object rather than being appended indefinitely to the main StaffBoard state. Version records include:

- Unique version ID and timestamp
- Admin username
- Board, shift, week, and operational day
- Action and entity type
- Previous and new values
- Server state revision
- Source, reason, and related record ID

Tracked entities include operational days, individual builder assignments, all day assignments, goals and production metrics, rack lists, day notes, board comments, area definitions, templates, and the Builder Master List.

### Undo and restore

Authorized admins can:

- Undo the latest reversible change in the active board and week
- Filter and restore an individual builder assignment
- Restore an entire operational day
- Restore assignments, goals, rack data, or notes independently
- Preview a restore before applying it
- Compare two versions
- Restore a full server snapshot

Scoped restores preserve current pending scheduled clock-in/clock-out fields, schedule history, closure state, and unrelated entities. Locked weeks must be unlocked before scoped restore. Full backup recovery requires explicit confirmation when locked weeks exist.

Every restore:

1. Validates the browser's base state revision.
2. Creates a pre-restore snapshot.
3. Applies only the selected scope unless full-backup recovery was explicitly selected.
4. Writes a new audit event and recovery notification.
5. Persists before reporting success.
6. Refreshes other open admin sessions through the recovery revision poll.

### Automatic backups

StaffBoard creates separate Spaces snapshots:

- Before Clear Day
- Before Reset Week
- Before full-day/template-style replacements
- Before large bulk assignment changes
- Before closure changes
- Before restore operations
- Once per active calendar day
- Once per calendar week

The default retention policy keeps the newest 120 backup objects and the newest 500 detailed version records. Older backup objects are deleted when retention is exceeded.

Optional configuration:

```bash
STAFFBOARD_VERSION_LIMIT=500
STAFFBOARD_BACKUP_LIMIT=120
SPACES_VERSION_HISTORY_KEY=weekly/staffboard-2/version-history.json
SPACES_BACKUP_INDEX_KEY=weekly/staffboard-2/backups/index.json
SPACES_BACKUP_PREFIX=weekly/staffboard-2/backups/
```

### Emergency administrative exports

The Recovery tab can download the current server-authoritative:

- Full state
- Selected week
- Selected operational day
- Builder Master List
- Audit history
- Operational action records
- Leadership impact records

Exports never contain DigitalOcean Spaces credentials.

Recovery endpoints:

```text
GET  /api/recovery/status
GET  /api/recovery/versions
GET  /api/recovery/backups
POST /api/recovery/preview
POST /api/recovery/actions
GET  /api/recovery/export
```

## Data recovery troubleshooting

- **Outdated browser:** refresh before retrying. Recovery actions reject stale `baseUpdatedAt` values.
- **Locked week:** unlock the week before a scoped restore.
- **No versions shown:** make a meaningful board change, then refresh the Recovery tab.
- **Restore completed elsewhere:** open sessions refresh automatically when `recoveryRevision` changes.
- **Spaces failure:** the destructive action is blocked when its required pre-action backup cannot be written.
- **Full snapshot recovery:** use only when scoped restoration is insufficient because it intentionally replaces broad state while preserving current server-managed closure and scheduling controls.

The default site timezone is `America/New_York`. Override it only when the physical site timezone changes:

```bash
STAFFBOARD_TIME_ZONE=America/New_York
```

## DigitalOcean App Platform

Build command:

```bash
npm install --no-audit --no-fund
```

Run command:

```bash
npm start
```

Port:

```text
8787
```

## Required environment variables

Set these only in DigitalOcean App Platform. Do not commit real values to GitHub.

```bash
PORT=8787
AUTH_TOKEN=your-admin-token
SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
SPACES_REGION=us-east-1
SPACES_BUCKET=staffboard
SPACES_KEY=your-spaces-key
SPACES_SECRET=your-spaces-secret
SPACES_OBJECT_KEY=weekly/staffboard-2/staffboard-state.json
STAFFBOARD_TIME_ZONE=America/New_York
```

## Validation

Run the same validation used by the pull-request workflow:

```bash
npm run check
```

This performs syntax checks, all Node tests, and the production Vite build.

Focused Phase 1 validation:

```bash
npm run test:recovery
```

## Health check

After deploy:

```text
/api/health
```

Expected fields:

```json
{
  "ok": true,
  "authConfigured": true,
  "spacesConfigured": true
}
```

When the app opens, it will ask each admin for the shared admin token once and then save it in that browser.
