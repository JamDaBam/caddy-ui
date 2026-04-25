import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  });

  afterEach(() => {
    cleanup();
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
});
