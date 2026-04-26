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

export interface EntryWarning {
  code: string;
  message: string;
}

export interface CaddyEntry {
  id: string;
  label: string;
  matcher: string;
  raw: string;
  order: number;
  isValidParse: boolean;
  warnings: EntryWarning[];
}

export interface EntriesResponse {
  entries: CaddyEntry[];
  dirty: boolean;
  sourcePath: string;
  warnings: EntryWarning[];
  backend: BackendModeInfo;
}

export interface EntryInput {
  label: string;
  matcher?: string;
  raw: string;
}

export interface ApplyRequest {
  reload?: boolean;
}

export interface ApplyResponse {
  success: boolean;
  dirty: boolean;
  validationOutput?: string;
  reloadOutput?: string;
  error?: string;
  errorCode?: BackendErrorCode;
  backend: BackendModeInfo;
}

export interface HealthResponse {
  ok: boolean;
  dirty: boolean;
  reloadEnabled: boolean;
  sourcePath: string;
  backend: BackendModeInfo;
  error?: string;
  errorCode?: BackendErrorCode;
}
