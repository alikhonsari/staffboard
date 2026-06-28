# StaffBoard 2.0

Merged deployable staffing board for DigitalOcean App Platform.

## Included

- Admin login screen
- Protected `/api/login`, `/api/me`, and `/api/state`
- DigitalOcean Spaces shared save/load
- Full weekly V6 staffing board UI
- Board tabs for Board, Analysis, Builders, and Comments
- Builder master roster, badge colors, training tags, trainer/safety/line-lead flags
- Drag-and-drop staffing by area
- Q1 / Q2 / Q3 snapshots
- Day, weekly, attendance, roster, JSON, PNG, PDF, and Excel exports
- Day and night boards for SPEED, FA Lab, and Bodega
- Rack ID paste fields for prepped and processed rack lists with material type counts

## Local run

```bash
npm install
npm run dev
```

Open the app at `http://localhost:8787`.

## Build

```bash
npm run build
npm start
```

## DigitalOcean App Platform

Build command:

```bash
npm install && npm run build
```

Run command:

```bash
npm start
```

Port:

```bash
8787
```

## Required environment variables

```bash
PORT=8787
STAFFBOARD_ADMIN_USER=ali
STAFFBOARD_ADMIN_PASS=your-password
STAFFBOARD_AUTH_SECRET=make-this-a-long-random-secret
DO_SPACES_KEY=your-spaces-key
DO_SPACES_SECRET=your-spaces-secret
DO_SPACES_BUCKET=staffboard
DO_SPACES_REGION=nyc3
DO_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
DO_SPACES_KEY_PREFIX=staffboard-2/
```

For multiple admins, use:

```bash
STAFFBOARD_ADMINS_JSON=[{"username":"ali","password":"pass1","role":"admin"},{"username":"manager","password":"pass2","role":"admin"}]
```
