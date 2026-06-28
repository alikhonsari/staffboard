# StaffBoard admin logins and VPS notes

## Multiple admin logins

Set `ADMINS_JSON` in DigitalOcean App Platform or on the VPS environment.

Example shape:

```json
[
  { "username": "ali", "password": "your-password", "role": "admin" },
  { "username": "manager", "password": "their-password", "role": "admin" }
]
```

Changing a password means editing `ADMINS_JSON`, saving the environment variable, and restarting or redeploying the app.

## Required runtime variables

- `PORT`
- `AUTH_TOKEN`
- `ADMINS_JSON`
- `SPACES_ENDPOINT`
- `SPACES_REGION`
- `SPACES_BUCKET`
- `SPACES_KEY`
- `SPACES_SECRET`
- `SPACES_OBJECT_KEY`
- `SPACES_HISTORY_KEY`

## VPS recommended run pattern

For a VPS, install dependencies and build the frontend once:

```bash
npm install --no-audit --no-fund
npm run build
npm start
```

Use a process manager such as PM2 or systemd to keep the app alive, and put Nginx/Caddy in front for HTTPS.

The app stores shared board data in DigitalOcean Spaces, so the VPS disk is not the source of truth.
