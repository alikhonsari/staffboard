# Source Transform Migration Plan

## Why transforms are being retired

StaffBoard currently extends a large application through Vite transform plugins that depend on exact source markers. This enabled safe incremental feature delivery but creates long-term maintenance risk.

## Safety gate in this phase

The post-transform hardening plugin validates critical final-output markers for:

- Sidebar shell
- Recovery route and sync bridge
- Day closure UI
- Scheduled transition status integration

The build fails when a required marker is absent or a unique marker is injected more than once. A `transform-diagnostics.json` build artifact records marker counts.

## Migration order

1. Recovery UI and synchronization
2. Day closure banner and controls
3. Scheduled transition controls and status polling
4. Sidebar and top navigation
5. Builder management
6. Manager dashboard
7. Reports and export composition
8. Analysis and suggestion features

## Migration method

For each feature:

1. Establish a normal React component, hook, API service, and CSS module.
2. Add behavior-level and browser tests.
3. Import the feature explicitly from the application shell.
4. Keep a compatibility adapter while the old transform remains.
5. Remove the transform only after output and regression tests pass.
6. Remove its marker from the hardening specification.

## Remaining limitation

This platform-foundation PR does not rewrite the large application shell. It makes the remaining transform architecture observable and fail-loud so later migration PRs can be smaller and rollback-safe.
