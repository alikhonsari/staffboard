# Future Database Migration Plan

## Current decision

DigitalOcean Spaces remains the production source of truth during the platform-hardening program. No paid database is introduced by this phase.

## Migration triggers

Evaluate PostgreSQL when one or more conditions remain true for several weeks:

- Main state object consistently exceeds 10–15 MB.
- Median state-save latency exceeds 2 seconds.
- Multiple operational actions require transactional updates across separate objects.
- Audit/version queries require more than retention-limited JSON scans.
- Builder, action, certification, scenario, and approval records grow beyond practical in-memory filtering.
- Concurrent mutation frequency makes whole-state writes operationally risky.

## Proposed relational domains

- `users`, `roles`, `permissions`, `user_roles`
- `boards`, `shifts`, `operational_weeks`, `operational_days`
- `builders`, `skills`, `certifications`
- `assignments`, `attendance_events`, `area_movements`
- `scheduled_transitions`, `closures`
- `actions`, `exceptions`, `approvals`, `handoffs`
- `audit_events`, `state_revisions`, `idempotency_keys`
- `backups`, `backup_verifications`
- `leadership_impact_events`

## Transaction model

Each sensitive mutation should execute in one database transaction that:

1. Locks or validates the current revision.
2. Applies entity changes.
3. Writes audit events.
4. Writes idempotency records.
5. Advances the revision.
6. Commits before reporting success.

## Migration sequence

1. Freeze a verified Spaces backup.
2. Export normalized JSON with checksums.
3. Import into shadow database tables.
4. Run row-count, checksum, board/shift/week isolation, and report parity checks.
5. Operate in read-only shadow mode.
6. Perform a planned write freeze.
7. Apply final delta.
8. Switch the authoritative adapter.
9. Keep Spaces backup and rollback adapter available.

## Rollback

Rollback must restore the last verified Spaces snapshot and deploy the Spaces adapter without deleting the database. No migration should proceed without a tested reverse export.
