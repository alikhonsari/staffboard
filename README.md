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
```

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
