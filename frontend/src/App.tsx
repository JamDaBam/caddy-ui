import { useEffect, useState } from "react";

import type { BackendModeInfo, CaddyEntry } from "@caddy-ui/shared";

import { applyChanges, createEntry, deleteEntry, fetchEntries, fetchHealth, updateEntry } from "./api";
import { buildStructuredRaw, emptyStructuredEntryFields, parseStructuredEntry, type StructuredEntryFields } from "./structuredEntry";

interface EditorState {
  id?: string;
  label: string;
  raw: string;
}

const emptyEditor: EditorState = {
  label: "",
  raw: ""
};

type EditorTab = "guided" | "raw";

export function App() {
  const [entries, setEntries] = useState<CaddyEntry[]>([]);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [activeTab, setActiveTab] = useState<EditorTab>("guided");
  const [dirty, setDirty] = useState(false);
  const [applying, setApplying] = useState(false);
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
  const canValidateAndSave = dirty && !localDirty && !applying;
  const canSaveAndReload = reloadEnabled && !localDirty && !applying;
  const statusLabel = localDirty ? "Local edits not saved" : dirty ? "Draft staged" : "Live config";
  const statusClassName = localDirty ? "badge badge-alert" : dirty ? "badge badge-warn" : "badge";
  const backendSummary = backend ? `${backend.storageMode} storage • ${backend.reloadMode} reload` : null;
  const structuredParse = parseStructuredEntry(editor.label, editor.raw);
  const structuredFields = structuredParse.supported ? structuredParse.fields ?? emptyStructuredEntryFields : null;
  const structuredBuild = structuredFields ? buildStructuredRaw(structuredFields) : null;
  const guidedFieldErrors = structuredBuild?.errors ?? [];
  const canSaveFromGuided = structuredParse.supported && structuredBuild?.valid;

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
    if (activeTab === "guided" && !canSaveFromGuided) {
      setError("Complete the required guided fields or switch to Raw directives.");
      return;
    }

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
    if (applying) {
      return;
    }

    setError(null);
    setMessage(null);
    setApplying(true);
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
    } finally {
      setApplying(false);
    }
  }

  if (loading) {
    return <main className="shell"><section className="panel">Loading...</section></main>;
  }

  function updateStructuredFields(patch: Partial<StructuredEntryFields>) {
    const base = structuredFields ?? emptyStructuredEntryFields;
    const nextFields: StructuredEntryFields = {
      ...base,
      ...patch
    };
    const nextBuild = buildStructuredRaw(nextFields);
    setEditor((current) => ({
      ...current,
      label: nextBuild.label,
      raw: nextBuild.raw
    }));
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
            <p>Use the guided editor for the supported reverse-proxy shape, or fall back to raw directives for anything else.</p>
          </div>
        </div>

        {error ? <div className="banner banner-error">{error}</div> : null}
        {message ? <div className="banner banner-info">{message}</div> : null}

        <div className="tabs" role="tablist" aria-label="Entry editor mode">
          <button
            type="button"
            id="guided-editor-tab"
            role="tab"
            aria-selected={activeTab === "guided"}
            className={activeTab === "guided" ? "tab-button active" : "tab-button"}
            onClick={() => setActiveTab("guided")}
          >
            Guided editor
          </button>
          <button
            type="button"
            id="raw-directives-tab"
            role="tab"
            aria-selected={activeTab === "raw"}
            className={activeTab === "raw" ? "tab-button active" : "tab-button"}
            onClick={() => setActiveTab("raw")}
          >
            Raw directives
          </button>
        </div>

        {activeTab === "guided" ? (
          <div role="tabpanel" aria-labelledby="guided-editor-tab" className="guided-editor">
            {structuredFields ? (
              <>
                <label>
                  Domain names / hostnames
                  <input
                    value={structuredFields.hostnames.join(", ")}
                    onChange={(event) =>
                      updateStructuredFields({
                        hostnames: event.target.value
                          .split(",")
                          .map((hostname) => hostname.trim())
                          .filter((hostname) => hostname.length > 0)
                      })
                    }
                    placeholder="example.com, www.example.com"
                  />
                  {guidedFieldErrors.includes("At least one hostname is required.") ? (
                    <span className="field-error">Enter at least one hostname.</span>
                  ) : null}
                </label>

                <label>
                  ACME directory URL
                  <input
                    value={structuredFields.acmeDirectoryUrl}
                    onChange={(event) => updateStructuredFields({ acmeDirectoryUrl: event.target.value })}
                    placeholder="https://acme-v02.api.letsencrypt.org/directory"
                  />
                  {guidedFieldErrors.includes("ACME directory URL is required.") ? (
                    <span className="field-error">Enter the ACME directory URL.</span>
                  ) : null}
                </label>

                <label>
                  TLS email
                  <input
                    value={structuredFields.tlsEmail}
                    onChange={(event) => updateStructuredFields({ tlsEmail: event.target.value })}
                    placeholder="admin@example.com"
                  />
                </label>

                <label>
                  Trusted root CA path
                  <input
                    value={structuredFields.trustedRootCaPath}
                    onChange={(event) => updateStructuredFields({ trustedRootCaPath: event.target.value })}
                    placeholder="/etc/ssl/custom-root.pem"
                  />
                </label>

                <label>
                  Reverse proxy target
                  <input
                    value={structuredFields.reverseProxyTarget}
                    onChange={(event) =>
                      updateStructuredFields({
                        reverseProxyTarget: event.target.value,
                        tlsInsecureSkipVerify: event.target.value ? structuredFields.tlsInsecureSkipVerify : false
                      })
                    }
                    placeholder="https://localhost:8443"
                  />
                  {guidedFieldErrors.includes("Reverse proxy target is required.") ? (
                    <span className="field-error">Enter the upstream target.</span>
                  ) : null}
                </label>

                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={structuredFields.tlsInsecureSkipVerify}
                    disabled={!structuredFields.reverseProxyTarget.trim()}
                    onChange={(event) => updateStructuredFields({ tlsInsecureSkipVerify: event.target.checked })}
                  />
                  <span>Skip upstream TLS verification</span>
                </label>
              </>
            ) : (
              <div className="banner banner-warn">
                <strong>Guided editing unavailable.</strong>
                <p>
                  {structuredParse.errors[0] ?? "This entry does not match the supported guided pattern."} Use Raw directives to edit
                  this entry directly.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div role="tabpanel" aria-labelledby="raw-directives-tab">
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
          </div>
        )}

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
