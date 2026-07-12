# Testing Strategy

## Required validation

```bash
npm run lint
npm test
npm run build
npm run check
```

Focused platform checks:

```bash
npm run test:platform
```

## Coverage in the platform-foundation phase

- Production configuration validation
- Safe configuration summaries
- Structured error compatibility
- Secret redaction
- Role/permission primitives
- Shared-state shape validation
- Schedule, closure, and recovery request validation
- Backup checksum and schema verification
- Corrupt and incomplete backup rejection
- Transform missing-marker and duplicate-marker failures
- State-size, builder, schedule, and revision diagnostics
- Existing scheduling, closure, recovery, report, and build regressions through the repository-wide suite

## Transform compatibility

The production build validates the post-transform application output and emits `dist/transform-diagnostics.json`. A missing critical feature marker or duplicate unique marker fails the build.

## Browser testing roadmap

End-to-end browser coverage is scheduled for a later modernization phase after the application shell and feature registry are explicit. CI browser tests must use deterministic test storage and must not require production Spaces credentials.
