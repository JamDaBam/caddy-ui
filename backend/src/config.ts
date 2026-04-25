export interface AppConfig {
  port: number;
  caddyfilePath: string;
  validateCommand: string;
  reloadCommand: string;
  enableReload: boolean;
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 3001),
    caddyfilePath: env.CADDYFILE_PATH ?? "/etc/caddy/Caddyfile",
    validateCommand:
      env.CADDY_VALIDATE_COMMAND ??
      "caddy validate --config {config} --adapter caddyfile",
    reloadCommand: env.CADDY_RELOAD_COMMAND ?? "systemctl reload caddy",
    enableReload: String(env.ENABLE_RELOAD ?? "false").toLowerCase() === "true"
  };
}

