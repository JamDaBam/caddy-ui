/** Mirrors the shared storage mode but stays local to backend internals to avoid circular imports. */
export type StorageMode = "local-file" | "shared-file";
/** Mirrors the shared reload mode for backend-only provider wiring. */
export type ReloadMode = "disabled" | "command" | "admin-api";

/** Canonical backend error taxonomy used for API payloads and internal normalization. */
export type BackendErrorCode =
  | "VALIDATION_FAILED"
  | "VALIDATION_COMMAND_MISSING"
  | "RELOAD_COMMAND_MISSING"
  | "RELOAD_FAILED"
  | "ADMIN_API_UNREACHABLE"
  | "ADMIN_API_TIMEOUT"
  | "ADMIN_API_RESPONSE_ERROR"
  | "CADDYFILE_NOT_FOUND"
  | "CADDYFILE_PERMISSION_DENIED"
  | "CADDYFILE_READ_FAILED"
  | "CADDYFILE_WRITE_FAILED";

/** Runtime description of the active provider stack and source Caddyfile. */
export interface BackendModeInfo {
  storageMode: StorageMode;
  reloadMode: ReloadMode;
  reloadEnabled: boolean;
  sourcePath: string;
  sourceDescription: string;
}

/** Backend-specific error wrapper that preserves a stable UI-facing code beside the message text. */
export class BackendError extends Error {
  code: BackendErrorCode;

  constructor(code: BackendErrorCode, message: string) {
    super(message);
    this.name = "BackendError";
    this.code = code;
  }
}
