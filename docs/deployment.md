# DigitalOcean Deployment and Rollback

## Build and run

```bash
npm install --no-audit --no-fund
npm start
```

The application listens on `PORT`, defaulting to `8787`.

## Required production configuration

- `AUTH_TOKEN` or configured administrators
- `SPACES_ENDPOINT`
- `SPACES_REGION`
- `SPACES_BUCKET`
- `SPACES_KEY`
- `SPACES_SECRET`
- `SPACES_OBJECT_KEY`
- `STAFFBOARD_TIME_ZONE`

Production startup fails clearly when authentication or Spaces is not configured. Logs contain only sanitized configuration summaries.

## Optional platform configuration

- `GIT_COMMIT_SHA`
- `BUILD_TIME`
- `STAFFBOARD_VALIDATION_MODE`
- `STAFFBOARD_STATE_WARNING_BYTES`
- `STAFFBOARD_SAVE_LATENCY_WARNING_MS`
- `STAFFBOARD_READINESS_TIMEOUT_MS`
- `STAFFBOARD_SHUTDOWN_TIMEOUT_MS`

## Health checks

- `/api/health/live` — process liveness
- `/api/health/ready` — configuration and read-only Spaces readiness
- `/api/health` — sanitized operational health

Use `/api/health/ready` as the DigitalOcean readiness path.

## Post-deploy verification

1. Confirm the deployed commit in `/api/health`.
2. Confirm `/api/health/live` returns `live`.
3. Confirm `/api/health/ready` returns `ready`.
4. Open Recovery and refresh Platform Diagnostics.
5. Verify one recent backup without restoring it.
6. Confirm the active board, week, and builder roster load normally.
7. Test one harmless save and confirm the numeric revision increments.

## Rollback

1. Select the previous successful deployment in DigitalOcean App Platform or revert the merge commit in GitHub.
2. Do not delete Spaces objects.
3. Redeploy the previous commit.
4. Confirm readiness and state loading.
5. Numeric `stateRevision` fields are backward-compatible and may remain in stored JSON.

## Graceful shutdown

On SIGTERM or SIGINT the server stops timers, stops accepting new connections, waits for the serialized write queue, and exits. A safety timeout prevents an indefinitely hung deployment.
