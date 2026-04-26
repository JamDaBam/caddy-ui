import type { ApplyRequest, ApplyResponse, EntriesResponse, EntryInput, HealthResponse } from "@caddy-ui/shared";

/** Converts backend JSON error payloads into thrown UI errors so callers can stay promise/error oriented. */
async function readJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });

  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload;
}

export function fetchEntries(): Promise<EntriesResponse> {
  return readJson("/api/entries");
}

export function fetchHealth(): Promise<HealthResponse> {
  return readJson("/api/health");
}

export function createEntry(input: EntryInput): Promise<EntriesResponse> {
  return readJson("/api/entries", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateEntry(id: string, input: EntryInput): Promise<EntriesResponse> {
  return readJson(`/api/entries/${id}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function deleteEntry(id: string): Promise<EntriesResponse> {
  return readJson(`/api/entries/${id}`, {
    method: "DELETE"
  });
}

export function applyChanges(input: ApplyRequest): Promise<ApplyResponse> {
  return readJson("/api/apply", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
