import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const supportedRaw = [
  "tls {",
  "  issuer acme {",
  "    dir https://acme-v02.api.letsencrypt.org/directory",
  "    email admin@example.com",
  "  }",
  "}",
  "",
  "reverse_proxy https://localhost:8443 {",
  "  transport http {",
  "    tls_insecure_skip_verify",
  "  }",
  "}"
].join("\n");

const apiMocks = vi.hoisted(() => ({
  fetchEntries: vi.fn(async () => ({
    entries: [
      {
        id: "entry-1",
        label: "example.com",
        matcher: "example.com",
        raw: supportedRaw,
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

  it("renders entries and both editor tabs after load", async () => {
    render(<App />);

    expect(await screen.findByText("example.com")).toBeTruthy();
    expect(screen.getByText("Top-level site entries")).toBeTruthy();
    expect(screen.getByText("local-file storage • command reload")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Guided editor" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Raw directives" }).getAttribute("aria-selected")).toBe("false");
  });

  it("updates raw directives from guided field edits and preserves them across tabs", async () => {
    render(<App />);

    const targetInput = await screen.findByLabelText(/^Reverse proxy target/);
    fireEvent.change(targetInput, { target: { value: "https://backend.internal:9443" } });

    fireEvent.click(screen.getByRole("tab", { name: "Raw directives" }));

    expect(screen.getByLabelText("Site label or matcher")).toHaveProperty("value", "example.com");
    expect(screen.getByRole("textbox", { name: "Raw directives" })).toHaveProperty(
      "value",
      [
        "tls {",
        "  issuer acme {",
        "    dir https://acme-v02.api.letsencrypt.org/directory",
        "    email admin@example.com",
        "  }",
        "}",
        "",
        "reverse_proxy https://backend.internal:9443 {",
        "  transport http {",
        "    tls_insecure_skip_verify",
        "  }",
        "}"
      ].join("\n")
    );

    fireEvent.click(screen.getByRole("tab", { name: "Guided editor" }));
    expect(screen.getByLabelText(/^Reverse proxy target/)).toHaveProperty("value", "https://backend.internal:9443");
  });

  it("shows guided validation errors and blocks saving incomplete guided entries", async () => {
    render(<App />);

    await screen.findByText("example.com");
    fireEvent.click(screen.getByRole("button", { name: "New entry" }));

    fireEvent.change(screen.getByLabelText(/^Domain names \/ hostnames/), { target: { value: "example.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(screen.getByText("Complete the required guided fields or switch to Raw directives.")).toBeTruthy();
    expect(screen.getByText("Enter the ACME directory URL.")).toBeTruthy();
    expect(screen.getByText("Enter the upstream target.")).toBeTruthy();
    expect(apiMocks.createEntry).not.toHaveBeenCalled();
  });

  it("keeps the existing raw editor save and apply flow working", async () => {
    const reloadApply = deferred<{
      success: boolean;
      dirty: boolean;
      backend: {
        storageMode: "local-file";
        reloadMode: "command";
        reloadEnabled: true;
        sourcePath: string;
        sourceDescription: string;
      };
    }>();

    apiMocks.fetchEntries.mockResolvedValueOnce({
      entries: [
        {
          id: "entry-1",
          label: "example.com",
          matcher: "example.com",
          raw: supportedRaw,
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
          raw: "respond \"updated\"",
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
    apiMocks.applyChanges.mockReturnValueOnce(reloadApply.promise);

    render(<App />);

    await screen.findByText("example.com");
    fireEvent.click(screen.getByRole("tab", { name: "Raw directives" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Raw directives" }), { target: { value: "respond \"updated\"" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    const validateButton = screen.getByRole("button", { name: "Validate and save" });
    const reloadButton = screen.getByRole("button", { name: "Save and reload" });

    await waitFor(() => {
      expect(validateButton).toHaveProperty("disabled", false);
      expect(reloadButton).toHaveProperty("disabled", false);
    });

    fireEvent.click(validateButton);

    expect(await screen.findByText("Config validated and saved")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Raw directives" })).toHaveProperty("value", "respond \"updated\"");
    expect(reloadButton).toHaveProperty("disabled", false);

    fireEvent.click(reloadButton);
    await waitFor(() => {
      expect(reloadButton).toHaveProperty("disabled", true);
      expect(validateButton).toHaveProperty("disabled", true);
    });

    reloadApply.resolve({
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

    expect(apiMocks.applyChanges).toHaveBeenNthCalledWith(1, { reload: false });
    expect(apiMocks.applyChanges).toHaveBeenNthCalledWith(2, { reload: true });
    expect(await screen.findByText("Config saved and reload requested")).toBeTruthy();
  });

  it("re-parses manual raw edits back into the guided fields", async () => {
    render(<App />);

    await screen.findByText("example.com");
    fireEvent.click(screen.getByRole("tab", { name: "Raw directives" }));
    fireEvent.change(screen.getByLabelText("Site label or matcher"), { target: { value: "api.example.com, admin.example.com" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Raw directives" }), {
      target: {
        value: [
          "tls {",
          "  issuer acme {",
          "    dir https://acme-staging-v02.api.letsencrypt.org/directory",
          "    trusted_roots /etc/ssl/internal.pem",
          "  }",
          "}",
          "",
          "reverse_proxy https://internal.service:9443"
        ].join("\n")
      }
    });

    fireEvent.click(screen.getByRole("tab", { name: "Guided editor" }));

    expect(screen.getByLabelText(/^Domain names \/ hostnames/)).toHaveProperty("value", "api.example.com, admin.example.com");
    expect(screen.getByLabelText(/^ACME directory URL/)).toHaveProperty(
      "value",
      "https://acme-staging-v02.api.letsencrypt.org/directory"
    );
    expect(screen.getByLabelText(/^Trusted root CA path/)).toHaveProperty("value", "/etc/ssl/internal.pem");
    expect(screen.getByLabelText(/^Reverse proxy target/)).toHaveProperty("value", "https://internal.service:9443");
  });

  it("shows unsupported raw entries in guided mode and preserves raw editing", async () => {
    render(<App />);

    await screen.findByText("example.com");
    fireEvent.click(screen.getByRole("tab", { name: "Raw directives" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Raw directives" }), {
      target: { value: "respond \"hello\"" }
    });

    fireEvent.click(screen.getByRole("tab", { name: "Guided editor" }));
    expect(screen.getByText("Guided editing unavailable.")).toBeTruthy();
    expect(screen.getByText("This entry contains directives outside the supported guided pattern. Use Raw directives to edit this entry directly.")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Raw directives" }));
    expect(screen.getByRole("textbox", { name: "Raw directives" })).toHaveProperty("value", "respond \"hello\"");
  });

  it("creates a new supported entry from the guided editor", async () => {
    apiMocks.createEntry.mockResolvedValueOnce({
      entries: [
        {
          id: "entry-2",
          label: "example.org, www.example.org",
          matcher: "example.org, www.example.org",
          raw: [
            "tls {",
            "  issuer acme {",
            "    dir https://acme-v02.api.letsencrypt.org/directory",
            "  }",
            "}",
            "",
            "reverse_proxy https://origin.example.org:8443"
          ].join("\n"),
          order: 1,
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

    render(<App />);

    await screen.findByText("example.com");
    fireEvent.click(screen.getByRole("button", { name: "New entry" }));
    fireEvent.change(screen.getByLabelText(/^Domain names \/ hostnames/), {
      target: { value: "example.org, www.example.org" }
    });
    fireEvent.change(screen.getByLabelText(/^ACME directory URL/), {
      target: { value: "https://acme-v02.api.letsencrypt.org/directory" }
    });
    fireEvent.change(screen.getByLabelText(/^Reverse proxy target/), {
      target: { value: "https://origin.example.org:8443" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(apiMocks.createEntry).toHaveBeenCalledWith({
      label: "example.org, www.example.org",
      raw: [
        "tls {",
        "  issuer acme {",
        "    dir https://acme-v02.api.letsencrypt.org/directory",
        "  }",
        "}",
        "",
        "reverse_proxy https://origin.example.org:8443"
      ].join("\n")
    });
    expect(await screen.findByText("Draft updated")).toBeTruthy();
  });
});
