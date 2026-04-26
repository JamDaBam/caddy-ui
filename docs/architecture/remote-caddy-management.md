# Remote Caddy Management Note

Before this refactor, the backend assumed the Caddy UI process lived on the same host as the managed Caddy instance.

Local-only assumptions in the original design:

- The live Caddyfile was always a local filesystem path mounted directly into the backend.
- Validation always happened by shelling out to a local `caddy validate` binary.
- Reload always happened by shelling out to a local service command such as `systemctl reload caddy`.
- Health only reported the local source path and a boolean reload toggle, so the UI could not distinguish local mode from a remote-capable deployment.

This branch introduces separate storage and reload providers so deployments can combine:

- `local-file` or `shared-file` storage
- `command`, `admin-api`, or `disabled` reload behavior

The first remote-capable target is a shared Caddyfile plus remote Caddy Admin API reload. Draft edits remain in backend memory for now.
