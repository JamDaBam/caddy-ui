export type StorageMode = "local-file" | "shared-file";
export type ReloadMode = "disabled" | "command" | "admin-api";

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

export interface BackendModeInfo {
  storageMode: StorageMode;
  reloadMode: ReloadMode;
  reloadEnabled: boolean;
  sourcePath: string;
  sourceDescription: string;
}

export class BackendError extends Error {
  code: BackendErrorCode;

  constructor(code: BackendErrorCode, message: string) {
    super(message);
    this.name = "BackendError";
    this.code = code;
  }
}
