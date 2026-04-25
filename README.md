# Caddy UI

Web UI for editing a Caddyfile with staged drafts, validation, and optional reload. The backend now supports separate storage and reload providers so it can run either on the Caddy host or beside it.

## Project layout

- `backend/`: Express API for reading, staging, validating, writing, and optionally reloading Caddy
- `frontend/`: React SPA for listing and editing top-level Caddyfile site entries
- `shared/`: Shared API and domain types
- `docs/architecture/remote-caddy-management.md`: note on the local-only assumptions removed in this branch

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

## Backend configuration

Core variables:

- `PORT`: API port, default `3001`
- `CADDY_STORAGE_MODE`: `local-file` or `shared-file`, default `local-file`
- `CADDYFILE_PATH`: path to the managed Caddyfile, default `/etc/caddy/Caddyfile`
- `CADDY_VALIDATE_COMMAND`: validation command template, default `caddy validate --config {config} --adapter caddyfile`
- `CADDY_RELOAD_MODE`: `disabled`, `command`, or `admin-api`
- `CADDY_RELOAD_COMMAND`: reload command for `command` mode, default `systemctl reload caddy`
- `CADDY_ADMIN_API_URL`: Admin API endpoint for `admin-api` mode, default `http://caddy:2019/load`
- `CADDY_ADMIN_API_TOKEN`: optional token for Admin API auth
- `CADDY_ADMIN_API_AUTH_HEADER`: optional custom auth header name; if omitted and a token is present, `Authorization: Bearer <token>` is used
- `CADDY_ADMIN_API_TIMEOUT_MS`: Admin API timeout, default `5000`

Backward compatibility:

- `ENABLE_RELOAD=true` still maps to `CADDY_RELOAD_MODE=command`

The validate command supports `{config}` and is executed against a temporary candidate file before the live file is replaced.

## Deployment modes

### Local host mode

Use this when the backend runs on the same machine as Caddy and can read the live Caddyfile directly.

Example:

```env
CADDY_STORAGE_MODE=local-file
CADDYFILE_PATH=/etc/caddy/Caddyfile
CADDY_RELOAD_MODE=command
CADDY_RELOAD_COMMAND=systemctl reload caddy
```

This matches the original design. It is still the simplest option when you can safely give the UI host local access to the Caddyfile and reload command.

### Shared file + Admin API mode

Use this when the backend runs in a separate container or service that can reach a shared Caddyfile path and the remote Caddy Admin API.

Example:

```env
CADDY_STORAGE_MODE=shared-file
CADDYFILE_PATH=/shared/Caddyfile
CADDY_RELOAD_MODE=admin-api
CADDY_ADMIN_API_URL=http://caddy:2019/load
```

This is the first remote-capable mode implemented in this branch.

## Limits of Admin API vs file-based workflows

- The UI still edits the Caddyfile, not JSON pushed directly into the Admin API.
- Validation still uses `caddy validate` against a temporary candidate file local to the backend process.
- Admin API reload happens only after a successful validated write.
- Draft state is still in backend memory; it is not shared across replicas or persisted.

## Deployment

1. Build the app:

```bash
npm install
npm run build
```

2. Run the backend under a service account with narrow `sudo` access for helper commands if you use `command` reload mode.
3. Serve the frontend static assets from the backend or a separate service.
4. Restrict access to the UI. Anyone with write access to this app can change your reverse proxy config.

### Example systemd unit

```ini
[Unit]
Description=Caddy UI
After=network.target

[Service]
WorkingDirectory=/opt/caddy-ui
Environment=PORT=3001
Environment=CADDY_STORAGE_MODE=local-file
Environment=CADDYFILE_PATH=/etc/caddy/Caddyfile
Environment=CADDY_RELOAD_MODE=command
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

`docker-compose.yml` now provides a real multi-service test rig:

- `caddyfile-init`: seeds a shared Caddyfile volume from `test/docker/Caddyfile`
- `caddy`: runs Caddy with the shared Caddyfile and exposes only HTTP port `8080` to the host
- `caddy-ui`: mounts the same shared Caddyfile and reloads Caddy through the internal Admin API endpoint

Useful samples:

- `test/docker/Caddyfile`
- `test/docker/local.env.example`
- `test/docker/remote.env.example`

Typical flow:

```bash
docker compose up --build
```

Then open `http://localhost:3001`.

To test broken remote reload handling, point `CADDY_ADMIN_API_URL` at a non-existent host or port. To test missing shared file handling, remove the seeded file from the shared volume before starting `caddy-ui`.

## Security notes

- This app edits raw Caddyfile text. It is intentionally management-first, not a full syntax-aware Caddy builder.
- Validation happens before the live Caddyfile is replaced.
- Reload only runs after a successful write and only when explicitly requested.
- Keep privileged commands isolated and minimal.

## Limitations

- The parser targets top-level site entries while preserving raw directive bodies.
- Unusual top-level constructs are preserved as raw segments, but only detected site entries are editable through the structured UI.
- Draft edits are kept in backend memory until applied or the process restarts.
