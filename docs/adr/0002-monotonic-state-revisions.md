# ADR 0002: Add Monotonic Numeric State Revisions

## Status

Accepted

## Context

StaffBoard historically used `updatedAt` timestamps for optimistic concurrency. Timestamps remain useful for display but are less explicit than a monotonic sequence for conflict detection and diagnostics.

## Decision

Persist a non-negative numeric `stateRevision` with every authoritative state save. New clients submit `baseStateRevision`; older clients continue using `baseUpdatedAt`.

## Consequences

- Conflict checks become deterministic for new clients.
- Existing stored state remains readable because missing revisions normalize to zero.
- `updatedAt` remains in responses and state for backward compatibility.
- Every write path must preserve or increment the revision exactly once.
