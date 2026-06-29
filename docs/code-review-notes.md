# StaffBoard code review notes

## What was improved in this pass

- Added safer storage requests with timeout handling so shared save/load does not hang indefinitely.
- Improved invalid-session cleanup so a bad session token forces a clean re-login instead of repeated failed saves.
- Added clearer API error parsing on the frontend.
- Added a UI polish layer for better spacing, hover states, focus rings, responsive layout, tables, and print behavior.
- Added an app guard badge that checks `/api/health`, shows whether shared save is ready, and surfaces frontend errors as visible toasts.
- Added `npm run check` and `npm run clean` maintenance scripts.

## Biggest future cleanup opportunity

`src/App.jsx` is very large and contains board state, UI, reporting, staffing logic, and analysis in one file. The next major refactor should split it into:

- `state/` for board state and normalization
- `components/` for UI cards, tables, modals, and board areas
- `reports/` for PDF, Excel, and PNG export logic
- `ops/` for rack parsing, TPH, rotation suggestions, and analysis
- `auth/` for login/session helpers

That would make future features safer and faster to add.

## Deployment note

For DigitalOcean App Platform, continue using:

```bash
npm install --no-audit --no-fund
npm start
```

For a VPS, a stronger production setup is:

```bash
npm install --no-audit --no-fund
npm run build
npm start
```

A future server improvement should serve `dist/` directly when it exists and use Vite middleware only in local development.
