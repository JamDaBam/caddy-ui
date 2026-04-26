import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";

const apiMocks = vi.hoisted(() => ({
  fetchEntries: vi.fn(async () => ({
    entries: [
      {
        id: "entry-1",
        label: "example.com",
        matcher: "example.com",
        raw: "reverse_proxy localhost:8080",
        order: 0,
        isValidParse: true,
        warnings: []
      }
    ],
    dirty: false,
    sourcePath: "/etc/caddy/Caddyfile",
    warnings: [],
    backend: {
      storageMode: "local-file",
      reloadMode: "command",
      reloadEnabled: true,
      sourcePath: "/etc/caddy/Caddyfile",
      sourceDescription: "Local Caddyfile at /etc/caddy/Caddyfile"
    }
  })),
  fetchHealth: vi.fn(async () => ({
    ok: true,
    dirty: false,
    reloadEnabled: true,
    sourcePath: "/etc/caddy/Caddyfile",
    backend: {
      storageMode: "local-file",
      reloadMode: "command",
      reloadEnabled: true,
      sourcePath: "/etc/caddy/Caddyfile",
      sourceDescription: "Local Caddyfile at /etc/caddy/Caddyfile"
    }
  })),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  applyChanges: vi.fn()
}));

vi.mock("../src/api", () => ({
  ...apiMocks
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders entries after load", async () => {
    render(<App />);
    expect(await screen.findByText("example.com")).toBeTruthy();
    expect(screen.getByText("Top-level site entries")).toBeTruthy();
    expect(screen.getByText("local-file storage • command reload")).toBeTruthy();
  });

  it("shows local edit state and enables saving after editing", async () => {
    render(<App />);

    const labelInput = await screen.findByLabelText("Site label or matcher");
    const saveButton = screen.getByRole("button", { name: "Save draft" });

    expect(screen.getByText("Live config")).toBeTruthy();
    expect(saveButton).toHaveProperty("disabled", true);

    fireEvent.change(labelInput, { target: { value: "example.org" } });

    expect(screen.getByText("Local edits not saved")).toBeTruthy();
    expect(screen.getByText("Save draft before validating or switching entries.")).toBeTruthy();
    expect(saveButton).toHaveProperty("disabled", false);
  });

  it("keeps save and reload available after validate and save", async () => {
    apiMocks.fetchEntries.mockResolvedValueOnce({
      entries: [
        {
          id: "entry-1",
          label: "example.com",
          matcher: "example.com",
          raw: "reverse_proxy localhost:8080",
          order: 0,
          isValidParse: true,
          warnings: []
        }
      ],
      dirty: false,
      sourcePath: "/etc/caddy/Caddyfile",
      warnings: [],
      backend: {
        storageMode: "local-file",
        reloadMode: "command",
        reloadEnabled: true,
        sourcePath: "/etc/caddy/Caddyfile",
        sourceDescription: "Local Caddyfile at /etc/caddy/Caddyfile"
      }
    });
    apiMocks.fetchEntries.mockResolvedValueOnce({
      entries: [
        {
          id: "entry-1",
          label: "example.com",
          matcher: "example.com",
          raw: "respond \"updated\"",
          order: 0,
          isValidParse: true,
          warnings: []
        }
      ],
      dirty: false,
      sourcePath: "/etc/caddy/Caddyfile",
      warnings: [],
      backend: {
        storageMode: "local-file",
        reloadMode: "command",
        reloadEnabled: true,
        sourcePath: "/etc/caddy/Caddyfile",
        sourceDescription: "Local Caddyfile at /etc/caddy/Caddyfile"
      }
    });
    apiMocks.fetchHealth.mockResolvedValueOnce({
      ok: true,
      dirty: false,
      reloadEnabled: true,
      sourcePath: "/etc/caddy/Caddyfile",
      backend: {
        storageMode: "local-file",
        reloadMode: "command",
        reloadEnabled: true,
        sourcePath: "/etc/caddy/Caddyfile",
        sourceDescription: "Local Caddyfile at /etc/caddy/Caddyfile"
      }
    });
    apiMocks.fetchHealth.mockResolvedValueOnce({
      ok: true,
      dirty: false,
      reloadEnabled: true,
      sourcePath: "/etc/caddy/Caddyfile",
      backend: {
        storageMode: "local-file",
        reloadMode: "command",
        reloadEnabled: true,
        sourcePath: "/etc/caddy/Caddyfile",
        sourceDescription: "Local Caddyfile at /etc/caddy/Caddyfile"
      }
    });
    apiMocks.updateEntry.mockResolvedValueOnce({
      entries: [
        {
          id: "entry-1",
          label: "example.com",
          matcher: "example.com",
          raw: "respond \"updated\"\n# ui verify",
          order: 0,
          isValidParse: true,
          warnings: []
        }
      ],
      dirty: true,
      sourcePath: "/etc/caddy/Caddyfile",
      warnings: [],
      backend: {
        storageMode: "local-file",
        reloadMode: "command",
        reloadEnabled: true,
        sourcePath: "/etc/caddy/Caddyfile",
        sourceDescription: "Local Caddyfile at /etc/caddy/Caddyfile"
      }
    });
    apiMocks.applyChanges.mockResolvedValueOnce({
      success: true,
      dirty: false,
      backend: {
        storageMode: "local-file",
        reloadMode: "command",
        reloadEnabled: true,
        sourcePath: "/etc/caddy/Caddyfile",
        sourceDescription: "Local Caddyfile at /etc/caddy/Caddyfile"
      }
    });
    apiMocks.applyChanges.mockResolvedValueOnce({
      success: true,
      dirty: false,
      backend: {
        storageMode: "local-file",
        reloadMode: "command",
        reloadEnabled: true,
        sourcePath: "/etc/caddy/Caddyfile",
        sourceDescription: "Local Caddyfile at /etc/caddy/Caddyfile"
      }
    });

    render(<App />);

    const textarea = await screen.findByLabelText("Raw directives");
    fireEvent.change(textarea, { target: { value: "respond \"updated\"\n# ui verify" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    const validateButton = screen.getByRole("button", { name: "Validate and save" });
    const reloadButton = screen.getByRole("button", { name: "Save and reload" });

    await waitFor(() => {
      expect(validateButton).toHaveProperty("disabled", false);
      expect(reloadButton).toHaveProperty("disabled", false);
    });

    fireEvent.click(validateButton);

    expect(await screen.findByText("Config validated and saved")).toBeTruthy();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Raw directives")).toHaveProperty("value", "respond \"updated\"");
    expect(reloadButton).toHaveProperty("disabled", false);

    fireEvent.click(reloadButton);

    expect(apiMocks.applyChanges).toHaveBeenNthCalledWith(1, { reload: false });
    expect(apiMocks.applyChanges).toHaveBeenNthCalledWith(2, { reload: true });
  });
});
