# Caddy UI

Small web app for editing a local Caddyfile on the same host that runs Caddy.

## Project layout

- `backend/`: Express API for reading, staging, validating, writing, and optionally reloading Caddy
- `frontend/`: React SPA for listing and editing top-level Caddyfile site entries
- `shared/`: Shared API and domain types

## Local development

1. Install dependencies:

```bash
npm install
```

2. Start the backend dev server:

```bash
npm run dev -w backend
```

3. In another shell, start the frontend:

```bash
npm run dev -w frontend
```

The frontend expects the backend on `http://localhost:3001` by default.

## Environment

Backend variables:

- `PORT`: API port, default `3001`
- `CADDYFILE_PATH`: live Caddyfile path, default `/etc/caddy/Caddyfile`
- `CADDY_VALIDATE_COMMAND`: validation command template, default `caddy validate --config {config} --adapter caddyfile`
- `CADDY_RELOAD_COMMAND`: reload command, default `systemctl reload caddy`
- `ENABLE_RELOAD`: set to `true` to enable reload requests

The validate command supports `{config}` and is executed against a temporary candidate file before the live file is replaced.

## Deployment

Recommended mode is native deployment on the Caddy host.

1. Build the app:

```bash
npm install
npm run build
```

2. Run the backend under a service account with narrow `sudo` access for helper commands.
3. Serve the frontend static assets from the backend or a separate service.
4. Configure a reverse proxy route in Caddy for the UI if desired.

### Example systemd unit

```ini
[Unit]
Description=Caddy UI
After=network.target

[Service]
WorkingDirectory=/opt/caddy-ui
Environment=PORT=3001
Environment=CADDYFILE_PATH=/etc/caddy/Caddyfile
Environment=ENABLE_RELOAD=true
ExecStart=/usr/bin/npm run start -w backend
User=caddy-ui
Group=caddy-ui
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### Example sudoers rules

These are examples only. Adjust paths and command wrappers to your environment.

```sudoers
caddy-ui ALL=(root) NOPASSWD: /usr/bin/caddy validate --config * --adapter caddyfile
caddy-ui ALL=(root) NOPASSWD: /bin/systemctl reload caddy
```

If you need root-owned writes, prefer a small audited helper binary or script over granting general shell access.

## Docker

Docker support is included for environments where bind mounts and host integration are acceptable, but native host deployment is the recommended default.

- `Dockerfile` builds frontend and backend assets
- `docker-compose.yml` shows bind-mounting `/etc/caddy/Caddyfile`
- Reload support from Docker is environment-specific because `systemctl` and host service control are not portable across container setups

## Security notes

- This app edits raw Caddyfile text. It is intentionally management-first, not a full syntax-aware Caddy builder.
- Validation happens before the live Caddyfile is replaced.
- Reload only runs after a successful write and only when explicitly requested.
- Keep privileged commands isolated and minimal.
- Restrict access to the UI. Anyone with write access to this app can change your reverse proxy config.

## Limitations

- The parser targets top-level site entries while preserving raw directive bodies.
- Unusual top-level constructs are preserved as raw segments, but only detected site entries are editable through the structured UI.
- Draft edits are kept in backend memory until applied or the process restarts.
