import type { ReloadMode, StorageMode } from "./backendTypes.js";

/** Normalized process configuration for storage, validation, and reload providers. */
export interface AppConfig {
  port: number;
  storageMode: StorageMode;
  reloadMode: ReloadMode;
  caddyfilePath: string;
  validateCommand: string;
  reloadCommand: string;
  adminApiUrl: string;
  adminApiToken?: string;
  adminApiAuthHeader?: string;
  adminApiTimeoutMs: number;
}

/** Defaults to the original local-file behavior so existing single-host deployments keep working. */
function parseStorageMode(value: string | undefined): StorageMode {
  return value === "shared-file" ? "shared-file" : "local-file";
}

/** Preserves legacy ENABLE_RELOAD support while preferring the explicit multi-mode reload setting. */
function parseReloadMode(value: string | undefined, legacyEnableReload: string | undefined): ReloadMode {
  if (value === "disabled" || value === "command" || value === "admin-api") {
    return value;
  }

  return String(legacyEnableReload ?? "false").toLowerCase() === "true" ? "command" : "disabled";
}

/** Reads env once and fills deployment-safe defaults so the backend can boot with minimal configuration. */
export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 3001),
    storageMode: parseStorageMode(env.CADDY_STORAGE_MODE),
    reloadMode: parseReloadMode(env.CADDY_RELOAD_MODE, env.ENABLE_RELOAD),
    caddyfilePath: env.CADDYFILE_PATH ?? "/etc/caddy/Caddyfile",
    validateCommand:
      env.CADDY_VALIDATE_COMMAND ??
      "caddy validate --config {config} --adapter caddyfile",
    reloadCommand: env.CADDY_RELOAD_COMMAND ?? "systemctl reload caddy",
    adminApiUrl: env.CADDY_ADMIN_API_URL ?? "http://caddy:2019/load",
    adminApiToken: env.CADDY_ADMIN_API_TOKEN,
    adminApiAuthHeader: env.CADDY_ADMIN_API_AUTH_HEADER,
    adminApiTimeoutMs: Number(env.CADDY_ADMIN_API_TIMEOUT_MS ?? 5000)
  };
}
