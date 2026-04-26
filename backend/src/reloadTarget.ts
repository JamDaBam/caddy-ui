import type { BackendErrorCode } from "./backendTypes.js";
import { BackendError } from "./backendTypes.js";
import { CommandExecutionError, runCommand, summarizeCommandOutput } from "./commandRunner.js";

export interface ReloadResult {
  output: string;
}

export interface ReloadTarget {
  reload(config: string): Promise<ReloadResult>;
}

function isMissingCommandError(error: CommandExecutionError, commandName: string) {
  return (
    error.message.includes("ENOENT") &&
    (error.message.includes(`spawn ${commandName}`) || error.message.includes(`"${commandName}"`))
  );
}

export class DisabledReloadTarget implements ReloadTarget {
  async reload(): Promise<ReloadResult> {
    return { output: "" };
  }
}

export class CommandReloadTarget implements ReloadTarget {
  private command: string;

  constructor(command: string) {
    this.command = command;
  }

  async reload(): Promise<ReloadResult> {
    try {
      const result = await runCommand(this.command);
      return { output: summarizeCommandOutput(result.stdout, result.stderr) };
    } catch (error) {
      if (error instanceof CommandExecutionError) {
        if (isMissingCommandError(error, "systemctl")) {
          throw new BackendError(
            "RELOAD_COMMAND_MISSING",
            "Reload could not start because systemd is not available in this environment. Disable reload or set CADDY_RELOAD_COMMAND to a command that works in this container."
          );
        }

        const output = summarizeCommandOutput(error.stdout, error.stderr);
        throw new BackendError("RELOAD_FAILED", output ? `Config was saved, but reload failed. ${output}` : "Config was saved, but reload failed.");
      }

      throw new BackendError(
        "RELOAD_FAILED",
        error instanceof Error ? `Config was saved, but reload failed. ${error.message}` : "Config was saved, but reload failed."
      );
    }
  }
}

export interface AdminApiReloadOptions {
  url: string;
  token?: string;
  authHeader?: string;
  timeoutMs: number;
}

function buildAdminApiHeaders(options: AdminApiReloadOptions): HeadersInit {
  if (!options.token) {
    return {};
  }

  return {
    [options.authHeader || "Authorization"]: options.authHeader ? options.token : `Bearer ${options.token}`
  };
}

function mapAdminApiError(error: unknown): BackendError {
  if (error instanceof BackendError) {
    return error;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new BackendError("ADMIN_API_TIMEOUT", "Caddy Admin API request timed out.");
  }

  if (error instanceof TypeError) {
    return new BackendError(
      "ADMIN_API_UNREACHABLE",
      `Caddy Admin API is unreachable. ${error.message}`
    );
  }

  return new BackendError(
    "RELOAD_FAILED",
    error instanceof Error ? `Config was saved, but reload failed. ${error.message}` : "Config was saved, but reload failed."
  );
}

export class AdminApiReloadTarget implements ReloadTarget {
  private options: AdminApiReloadOptions;

  constructor(options: AdminApiReloadOptions) {
    this.options = options;
  }

  async reload(config: string): Promise<ReloadResult> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(this.options.url, {
        method: "POST",
        headers: {
          "Content-Type": "text/caddyfile",
          ...buildAdminApiHeaders(this.options)
        },
        body: config,
        signal: controller.signal
      });

      if (!response.ok) {
        const body = (await response.text()).trim();
        throw new BackendError(
          "ADMIN_API_RESPONSE_ERROR",
          body
            ? `Config was saved, but Caddy Admin API reload failed with ${response.status}. ${body}`
            : `Config was saved, but Caddy Admin API reload failed with ${response.status}.`
        );
      }

      const body = (await response.text()).trim();
      return { output: body };
    } catch (error) {
      throw mapAdminApiError(error);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function isReloadFailureCode(code: BackendErrorCode): boolean {
  return (
    code === "RELOAD_FAILED" ||
    code === "RELOAD_COMMAND_MISSING" ||
    code === "ADMIN_API_UNREACHABLE" ||
    code === "ADMIN_API_TIMEOUT" ||
    code === "ADMIN_API_RESPONSE_ERROR"
  );
}
