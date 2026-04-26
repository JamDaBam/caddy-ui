import { useEffect, useState } from "react";

import type { BackendModeInfo, CaddyEntry } from "@caddy-ui/shared";

import { applyChanges, createEntry, deleteEntry, fetchEntries, fetchHealth, updateEntry } from "./api";

interface EditorState {
  id?: string;
  label: string;
  raw: string;
}

const emptyEditor: EditorState = {
  label: "",
  raw: ""
};

export function App() {
  const [entries, setEntries] = useState<CaddyEntry[]>([]);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadEnabled, setReloadEnabled] = useState(false);
  const [backend, setBackend] = useState<BackendModeInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const activeEntry = editor.id ? entries.find((entry) => entry.id === editor.id) ?? null : null;
  const localDirty = activeEntry
    ? activeEntry.label !== editor.label || activeEntry.raw !== editor.raw
    : editor.label.trim().length > 0 || editor.raw.trim().length > 0;
  const canSaveDraft = Boolean(editor.label.trim()) && localDirty;
  const canValidateAndSave = dirty && !localDirty;
  const canSaveAndReload = reloadEnabled && !localDirty;
  const statusLabel = localDirty ? "Local edits not saved" : dirty ? "Draft staged" : "Live config";
  const statusClassName = localDirty ? "badge badge-alert" : dirty ? "badge badge-warn" : "badge";
  const backendSummary = backend ? `${backend.storageMode} storage • ${backend.reloadMode} reload` : null;

  function setEditorFromEntry(entry: CaddyEntry | null) {
    setEditor(
      entry
        ? {
            id: entry.id,
            label: entry.label,
            raw: entry.raw
          }
        : emptyEditor
    );
  }

  async function load(syncEditorId?: string | null) {
    setLoading(true);
    setError(null);
    try {
      const [entriesResponse, healthResponse] = await Promise.all([fetchEntries(), fetchHealth()]);
      setEntries(entriesResponse.entries);
      setDirty(entriesResponse.dirty);
      setReloadEnabled(healthResponse.reloadEnabled);
      setBackend(healthResponse.backend ?? entriesResponse.backend);
      if (syncEditorId !== undefined) {
        const syncedEntry = syncEditorId
          ? entriesResponse.entries.find((entry) => entry.id === syncEditorId) ?? entriesResponse.entries[0] ?? null
          : entriesResponse.entries[0] ?? null;
        setEditorFromEntry(syncedEntry);
      } else if (entriesResponse.entries.length > 0 && !editor.id) {
        setEditorFromEntry(entriesResponse.entries[0]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!localDirty) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [localDirty]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") {
        return;
      }

      event.preventDefault();
      if (canSaveDraft) {
        void saveEntry();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [canSaveDraft, editor]);

  function confirmDiscardLocalChanges(): boolean {
    return !localDirty || window.confirm("Discard your local edits?");
  }

  function selectEntry(entry: CaddyEntry) {
    if (!confirmDiscardLocalChanges()) {
      return;
    }

    setEditorFromEntry(entry);
    setMessage(null);
    setError(null);
  }

  async function saveEntry() {
    if (!editor.label.trim()) {
      setError("Entry label is required");
      return;
    }

    setError(null);
    setMessage(null);
    try {
      const response = editor.id
        ? await updateEntry(editor.id, { label: editor.label, raw: editor.raw })
        : await createEntry({ label: editor.label, raw: editor.raw });

      setEntries(response.entries);
      setDirty(response.dirty);
      setBackend(response.backend);
      const latest = response.entries.find((entry) => entry.label === editor.label) ?? response.entries.at(-1);
      setEditorFromEntry(latest ?? null);
      setMessage("Draft updated");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save draft");
    }
  }

  async function removeEntry() {
    if (localDirty && !window.confirm("Delete this entry and discard your local edits?")) {
      return;
    }

    if (!editor.id) {
      setEditor(emptyEditor);
      return;
    }

    setError(null);
    setMessage(null);
    try {
      const response = await deleteEntry(editor.id);
      setEntries(response.entries);
      setDirty(response.dirty);
      setBackend(response.backend);
      setEditorFromEntry(response.entries[0] ?? null);
      setMessage("Entry removed from draft");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Failed to delete entry");
    }
  }

  async function apply(reload: boolean) {
    setError(null);
    setMessage(null);
    try {
      const response = await applyChanges({ reload });
      if (!response.success) {
        throw new Error(response.error ?? "Apply failed");
      }
      setDirty(false);
      setBackend(response.backend);
      setMessage(reload ? "Config saved and reload requested" : "Config validated and saved");
      await load(editor.id ?? null);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Apply failed");
    }
  }

  if (loading) {
    return <main className="shell"><section className="panel">Loading...</section></main>;
  }

  return (
    <main className="shell">
      <section className="panel sidebar">
        <div className="panel-header">
          <div>
            <h1>Caddy UI</h1>
            <p>Top-level site entries</p>
          </div>
          <button
            className="ghost"
            onClick={() => {
              if (!confirmDiscardLocalChanges()) {
                return;
              }
              setEditor(emptyEditor);
              setMessage(null);
              setError(null);
            }}
          >
            New entry
          </button>
        </div>
        <div className="status-row">
          <span className={statusClassName}>{statusLabel}</span>
          <span className="status-note">
            {localDirty ? "Save draft before validating or switching entries." : dirty ? "Server draft differs from the live Caddyfile." : "Editor matches the active config snapshot."}
          </span>
        </div>
        {backend && backendSummary ? (
          <div className="status-row">
            <span className="badge">{backendSummary}</span>
            <span className="status-note">{backend.sourceDescription}</span>
          </div>
        ) : null}
        {entries.length === 0 ? (
          <div className="empty-state">No site entries detected.</div>
        ) : (
          <ul className="entry-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <button
                  className={editor.id === entry.id ? "entry-button active" : "entry-button"}
                  onClick={() => selectEntry(entry)}
                >
                  <strong>{entry.label}</strong>
                  <span>{entry.raw.split("\n")[0] ?? "Empty block"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel editor">
        <div className="panel-header">
          <div>
            <h2>{editor.id ? "Edit entry" : "Create entry"}</h2>
            <p>Raw block content stays editable, including comments and nested blocks.</p>
          </div>
        </div>

        {error ? <div className="banner banner-error">{error}</div> : null}
        {message ? <div className="banner banner-info">{message}</div> : null}

        <label>
          Site label or matcher
          <input
            value={editor.label}
            onChange={(event) => setEditor((current) => ({ ...current, label: event.target.value }))}
            placeholder="example.com"
          />
        </label>

        <label>
          Raw directives
          <textarea
            rows={16}
            value={editor.raw}
            onChange={(event) => setEditor((current) => ({ ...current, raw: event.target.value }))}
            placeholder={"reverse_proxy localhost:8080"}
          />
        </label>

        <div className="actions">
          <button onClick={() => void saveEntry()} disabled={!canSaveDraft}>
            Save draft
          </button>
          <button className="ghost" onClick={() => void removeEntry()} disabled={!editor.id && !localDirty}>
            Delete entry
          </button>
          <button className="secondary" onClick={() => void apply(false)} disabled={!canValidateAndSave}>
            Validate and save
          </button>
          <button className="secondary" onClick={() => void apply(true)} disabled={!canSaveAndReload}>
            Save and reload
          </button>
        </div>
        <p className="action-hint">
          {localDirty ? "Your current form changes are only local until you save the draft." : "Tip: press Ctrl+S or Cmd+S to save the current draft."}
        </p>
      </section>
    </main>
  );
}
