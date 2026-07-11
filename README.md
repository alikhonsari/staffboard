# StaffBoard V6

Full V6 staffing board restored for DigitalOcean App Platform.

## Included

- Full weekly V6 staffing board UI.
- Board tabs, analysis, builders, and comments.
- Builder master roster, badge colors, training tags, trainer/safety/line-lead flags.
- Drag-and-drop staffing by area.
- Q1 / Q2 / Q3 snapshots.
- Day, weekly, attendance, roster, JSON, PNG, PDF, and Excel exports.
- SPEED / FA / Bodega board presets from the V6 app.
- Shared state saved to DigitalOcean Spaces.
- Shared admin token for multiple admins.
- Persistent, server-authoritative scheduled clock-in and clock-out transitions.

## Scheduled clock transitions

Scheduled attendance changes are persisted in the shared Spaces state and evaluated by the server, not by an open browser tab.

- Scheduled clock-out keeps the builder active until the complete scheduled timestamp is reached, then closes the current area session, changes the builder to PTO, clears the active area, and updates shared metrics.
- Scheduled clock-in keeps the builder in PTO until the complete scheduled timestamp is reached, then changes the builder to Present and places them in Unassigned.
- Pending events are reconciled on startup, state reads, state writes, schedule-status polling, the exact next due time, and a fallback sweep.
- Each event stores its board, shift, week, operational day, builder, scheduled effective time, actual processed time, actor, and audit history.
- Night-shift times after midnight remain attached to the prior operational day.
- Canceled and replaced events cannot overwrite a newer manual status or area change.

The default site timezone is `America/New_York`. Override it only when the physical site timezone changes:

```bash
STAFFBOARD_TIME_ZONE=America/New_York
```

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

## Required environment variables

Set these only in DigitalOcean App Platform. Do not commit real values to GitHub.

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

## Validation

Run the same validation used by the pull-request workflow:

```bash
npm run check
```

This performs syntax checks, all Node tests, and the production Vite build.

## Health check

After deploy:

```text
/api/health
```

Expected fields:

```json
{
  "ok": true,
  "authConfigured": true,
  "spacesConfigured": true
}
```

When the app opens, it will ask each admin for the shared admin token once and then save it in that browser.
