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
}

export interface HealthResponse {
  ok: boolean;
  dirty: boolean;
  reloadEnabled: boolean;
  sourcePath: string;
}

