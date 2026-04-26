/** Distinguishes whether the backend edits a host-local file or a shared path. */
export type StorageMode = "local-file" | "shared-file";
/** Controls whether apply stops at persistence or also asks Caddy to reload. */
export type ReloadMode = "disabled" | "command" | "admin-api";

/** Stable error codes surfaced to the UI so messages can stay user-facing and transport-agnostic. */
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

/** Describes which storage and reload providers are active for the current backend instance. */
export interface BackendModeInfo {
  storageMode: StorageMode;
  reloadMode: ReloadMode;
  reloadEnabled: boolean;
  sourcePath: string;
  sourceDescription: string;
}

/** Lightweight warning shape reserved for parse or migration hints on entries and snapshots. */
export interface EntryWarning {
  code: string;
  message: string;
}

/** Editable top-level site entry exposed by the backend after raw Caddyfile parsing. */
export interface CaddyEntry {
  id: string;
  label: string;
  matcher: string;
  raw: string;
  order: number;
  isValidParse: boolean;
  warnings: EntryWarning[];
}

/** Snapshot returned after reads and draft mutations. */
export interface EntriesResponse {
  entries: CaddyEntry[];
  dirty: boolean;
  sourcePath: string;
  warnings: EntryWarning[];
  backend: BackendModeInfo;
}

/** Minimal write payload for staged entry edits. */
export interface EntryInput {
  label: string;
  matcher?: string;
  raw: string;
}

/** Apply can persist only, or persist and then trigger the configured reload mechanism. */
export interface ApplyRequest {
  reload?: boolean;
}

/** Apply response carries both validation/reload output and normalized backend errors. */
export interface ApplyResponse {
  success: boolean;
  dirty: boolean;
  validationOutput?: string;
  reloadOutput?: string;
  error?: string;
  errorCode?: BackendErrorCode;
  backend: BackendModeInfo;
}

/** Health response doubles as startup sanity-check plus active backend-mode disclosure for the UI. */
export interface HealthResponse {
  ok: boolean;
  dirty: boolean;
  reloadEnabled: boolean;
  sourcePath: string;
  backend: BackendModeInfo;
  error?: string;
  errorCode?: BackendErrorCode;
}
