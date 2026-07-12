# Persistence and Revision Model

## DigitalOcean Spaces objects

StaffBoard continues to use separate objects for:

- Main shared state
- General history
- Detailed recovery versions
- Backup index
- Individual backup snapshots

Default paths remain compatible with existing deployment settings.

## State revisions

Every authoritative save now carries:

- `updatedAt` — ISO timestamp retained for display and older clients
- `stateRevision` — non-negative numeric monotonic revision

New clients submit both `baseUpdatedAt` and `baseStateRevision`. The server prefers the numeric revision when supplied and falls back to the timestamp for backward compatibility.

A write is rejected when its base revision does not match the currently persisted revision. The rejection includes both the current timestamp and numeric revision.

## Write serialization

The existing queue remains responsible for ordered mutations. Scheduling, closures, reconciliation, and recovery continue to use the same server-authoritative queue.

Normal UI state saves are wrapped so they:

1. Reconcile due server-managed changes.
2. Verify the browser revision.
3. Create required recovery snapshots.
4. Preserve closure and scheduled-transition controls.
5. Validate state shape.
6. Persist the next revision.
7. Record versions and audit information.

## Large-state safeguards

Diagnostics record:

- Serialized state size
- Last read/write latency
- Builder count
- Audit count
- Pending schedule count
- Backup and recovery-version counts

Warnings are informational. The platform does not delete operational data based on size thresholds.

## Backup verification

Verification reads a backup object without applying it, validates its envelope and state shape, calculates a SHA-256 checksum, records size and revision information, and stores the verification result in backup index metadata.

A full backup cannot be restored unless its current content passes verification.
