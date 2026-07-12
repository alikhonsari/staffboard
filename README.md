# StaffBoard V6

StaffBoard is a shared operations staffing application deployed on DigitalOcean App Platform with DigitalOcean Spaces persistence.

## Included

- Weekly staffing for SPEED, FA Lab, and Bodega
- Separate Day and Night Shift boards
- Builder Master List, badges, training tags, and leadership flags
- Drag-and-drop staffing, attendance, area hours, and Q1/Q2/Q3 snapshots
- Scheduled clock-in and clock-out transitions
- Operational-day and shift closure controls
- Server-authoritative recovery, versions, undo, backups, and exports
- Audit history and multi-admin synchronization
- Daily/weekly PDF, Excel, PNG, Slack, manager, analysis, and suggestion outputs
- Platform diagnostics, health checks, runtime validation, and numeric state revisions

## Operational rules

- Day Shift: 8:00 AM–4:30 PM
- Night Shift: 5:00 PM–1:30 AM
- Each shift contains eight paid hours and a 30-minute unpaid break.
- Night Shift activity after midnight belongs to the operational day on which the shift began.
- Board, shift, week, and operational-day data must not mix.

## Server-authoritative scheduling

Scheduled transitions are stored in shared state and evaluated by the server rather than an open browser tab.

- Pending events reconcile on startup, state reads/writes, status polling, the exact due timer, and a fallback sweep.
- Completed and canceled events cannot be overwritten by older browser state.
- Closure reconciliation cancels affected pending events while preserving historical work.

## Operational-day closures

Admins can close an entire operational day, Day Shift only, or Night Shift only for holiday, building closure, severe weather, maintenance, emergency, planned shutdown, or a custom reason.

Closed scopes:

- Preserve assignments, attendance, rack data, production, notes, and history
- Reject new staffing and scheduling mutations
- Exclude the closed period from staffing and performance averages rather than counting it as zero
- Display closure status in boards, manager views, Slack summaries, PNG, PDF, and Excel
- Never restore canceled scheduled transitions automatically when reopened

Endpoints:

```text
GET  /api/day-closures/status
POST /api/day-closures
```

## Data recovery and version history

The Recovery tab supports:

- Filterable version history
- Restore preview and comparison
- Undo Last Change
- Full operational-day restore
- Individual builder restore
- Assignments, goals, rack data, or notes restore
- Manual, daily, weekly, and pre-action backups
- Full backup restore
- Emergency administrative exports
- Platform diagnostics
- Non-mutating backup verification

Scoped restores preserve current closure and scheduled-transition controls.

### Backup verification

Select a backup and choose **Verify Backup**. StaffBoard:

1. Reads the backup without applying it.
2. Validates metadata and shared-state structure.
3. Calculates a SHA-256 checksum.
4. Reports size, revision, creation time, verification time, and verifier.
5. Stores the verification result in backup index metadata.

A full backup restore is rejected when the selected backup does not pass verification.

Recovery endpoints:

```text
GET  /api/recovery/status
GET  /api/recovery/versions
GET  /api/recovery/backups
POST /api/recovery/preview
POST /api/recovery/actions
GET  /api/recovery/export
POST /api/platform/backups/verify
```

## Numeric state revisions

StaffBoard now persists both:

- `updatedAt` for display and backward compatibility
- `stateRevision` for deterministic optimistic concurrency

New clients send `baseStateRevision`. Older clients may continue sending `baseUpdatedAt`. A stale write receives the current timestamp and numeric revision before the browser reloads authoritative state.

## Platform health and diagnostics

Health endpoints:

```text
GET /api/health
GET /api/health/live
GET /api/health/ready
```

- `live` confirms the process is running.
- `ready` validates production configuration and performs a read-only Spaces check.
- The standard endpoint returns sanitized application, revision, state-size, latency, scheduling, recovery, and degraded-status information.

Authorized diagnostics endpoints:

```text
GET /api/platform/diagnostics
GET /api/platform/config
```

The Recovery tab includes a copyable diagnostics report. It never includes tokens, passwords, authorization headers, cookies, Spaces keys, or complete state payloads.

## Structured errors and request IDs

Every API request receives an `x-request-id` response header. New platform errors retain the legacy top-level `error` string and add:

```json
{
  "errorDetail": {
    "code": "STATE_REVISION_CONFLICT",
    "message": "The board changed in another session.",
    "retryable": true,
    "details": {},
    "requestId": "..."
  }
}
```

Structured server logs are JSON and redact sensitive fields.

## Permissions foundation

The centralized permission model defines Read Only, Line Lead, Admin, Manager, and System roles. Existing admins retain current access. Platform diagnostics and backup verification require elevated access.

Granular migration of all legacy routes is tracked in the platform-hardening roadmap.

## Transform safety

Legacy Vite source transforms remain temporarily for compatibility. The final post-transform build now verifies critical markers for:

- Sidebar shell
- Recovery route and sync bridge
- Closure controls
- Scheduled transition integration

Missing or duplicate required injections fail the build. The build emits:

```text
dist/transform-diagnostics.json
```

See `docs/transform-migration.md` for the incremental retirement plan.

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

Recommended readiness path:

```text
/api/health/ready
```

## Required production variables

Set secrets only in DigitalOcean App Platform.

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

Production startup fails clearly when authentication or Spaces is not fully configured.

## Optional platform variables

```bash
GIT_COMMIT_SHA=
BUILD_TIME=
STAFFBOARD_VALIDATION_MODE=compatible
STAFFBOARD_STATE_WARNING_BYTES=8388608
STAFFBOARD_SAVE_LATENCY_WARNING_MS=2000
STAFFBOARD_READINESS_TIMEOUT_MS=5000
STAFFBOARD_SHUTDOWN_TIMEOUT_MS=10000
STAFFBOARD_VERSION_LIMIT=500
STAFFBOARD_BACKUP_LIMIT=120
SPACES_VERSION_HISTORY_KEY=weekly/staffboard-2/version-history.json
SPACES_BACKUP_INDEX_KEY=weekly/staffboard-2/backups/index.json
SPACES_BACKUP_PREFIX=weekly/staffboard-2/backups/
```

## Validation

```bash
npm run lint
npm test
npm run build
npm run check
```

Focused suites:

```bash
npm run test:scheduling
npm run test:closures
npm run test:recovery
npm run test:platform
```

## Graceful shutdown

On SIGTERM or SIGINT StaffBoard stops scheduling/reconciliation timers, stops accepting connections, waits for the serialized write queue, and exits within a safety timeout.

## Documentation

- `docs/architecture.md`
- `docs/state-model.md`
- `docs/persistence.md`
- `docs/security.md`
- `docs/testing.md`
- `docs/deployment.md`
- `docs/database-migration-plan.md`
- `docs/transform-migration.md`
- `docs/adr/`

## Rollback

The platform changes are backward-compatible. Rolling back the application does not require removing `stateRevision` or backup verification metadata. Do not delete Spaces objects during rollback. See `docs/deployment.md` for the complete procedure.
