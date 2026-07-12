# ADR 0001: Keep DigitalOcean Spaces Authoritative During Hardening

## Status

Accepted

## Context

StaffBoard production data already lives in DigitalOcean Spaces and includes board, shift, week, scheduling, closure, recovery, and reporting state. Replacing storage while simultaneously refactoring architecture would increase migration and rollback risk.

## Decision

Keep Spaces as the source of truth during the modernization program. Add validation, revisions, diagnostics, backup verification, and migration documentation around the existing adapter.

## Consequences

- No destructive migration is required.
- Existing deployment secrets and object paths remain valid.
- Whole-state write limitations remain and are monitored.
- A future database migration must be a separate, verified project.
