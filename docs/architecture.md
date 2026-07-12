# StaffBoard Architecture

## Current production shape

StaffBoard is a React/Vite application served by an Express process on DigitalOcean App Platform. DigitalOcean Spaces remains the production source of truth for the shared operational state, audit history, recovery versions, and backup objects.

The server entry remains `server-guarded-closures.js`. It composes the existing scheduling, closure, recovery, and state-save protections before importing the legacy Express/Vite host in `server.js`.

## Platform foundation

The `platform/` directory provides cross-cutting infrastructure without replacing operational feature logic:

- `config.js` — centralized safe configuration and startup validation
- `errors.js` — structured errors with legacy response compatibility
- `logger.js` — request IDs, JSON logs, and secret redaction
- `validation.js` — compatible runtime state and request validation
- `permissions.js` — role/permission primitives for later enforcement migration
- `diagnostics.js` — state size, latency, revision, and reconciliation metrics
- `backup-verification.js` — non-mutating backup checksums and schema verification
- `routes.js` — health, readiness, diagnostics, and backup verification endpoints
- `transform-safety.js` — fail-loud marker and duplicate detection

## Authoritative boundaries

- Browser UI state is not authoritative.
- Server state writes are serialized.
- Sensitive mutations are reconciled against the latest persisted state.
- Numeric `stateRevision` is authoritative for new clients.
- `updatedAt` remains for display and backward compatibility.
- Scheduled transitions, closure state, and recovery metadata remain server-managed.

## Incremental modernization

This phase does not rewrite all source-transform features. It adds a safety gate and diagnostics artifact so missing or duplicate critical transforms fail the build. Transform retirement will happen feature by feature, beginning with Recovery, Closure, Scheduling, and navigation.

## Dependency policy

No new runtime dependency was introduced. Runtime schema checks and permission primitives are implemented with focused internal modules to avoid a destructive migration or dependency-driven behavior change.
