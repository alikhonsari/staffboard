# StaffBoard PostgreSQL Cutover

StaffBoard 1.6.13 stores its JSON documents in DigitalOcean Managed PostgreSQL instead of DigitalOcean Spaces.

## Required App Platform environment variables

Set these as encrypted runtime variables. Do not commit their values.

```text
PGHOST=<managed-database-host>
PGPORT=25060
PGDATABASE=defaultdb
PGUSER=doadmin
PGPASSWORD=<rotated-database-password>
PGSSLMODE=require
AUTH_SECRET=<independent-long-random-secret>
```

A single encrypted `DATABASE_URL` may be used instead of the five `PG*` connection variables:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
```

Recommended optional settings:

```text
STAFFBOARD_PG_POOL_MAX=8
STAFFBOARD_PG_CONNECT_TIMEOUT_MS=10000
STAFFBOARD_PG_IDLE_TIMEOUT_MS=30000
STAFFBOARD_STATE_KEY=weekly/staffboard-state.json
STAFFBOARD_HISTORY_KEY=weekly/staffboard-state-history.json
```

## Preserve the existing Spaces data

For the first PostgreSQL deployment only, keep the existing `SPACES_*` variables and add:

```text
STAFFBOARD_POSTGRES_IMPORT_SPACES=true
```

When a PostgreSQL document is missing, StaffBoard reads that document once from Spaces and immediately writes it to PostgreSQL. All subsequent reads and writes use PostgreSQL.

After confirming that the board and history load correctly, remove or set:

```text
STAFFBOARD_POSTGRES_IMPORT_SPACES=false
```

The Spaces importer is read-only. It never modifies or deletes the old bucket data.

## Database objects

StaffBoard automatically creates:

```sql
CREATE TABLE staffboard_documents (
  object_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

No manual SQL migration is required.

## Health verification

After deployment, check `/api/health`. The backend response should report:

```json
{
  "ok": true,
  "storageBackend": "postgres",
  "database": {
    "ok": true,
    "configured": true
  }
}
```

Do not remove the old Spaces data until the PostgreSQL-backed deployment has been verified and backed up.
