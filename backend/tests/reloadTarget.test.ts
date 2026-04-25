import { afterEach, describe, expect, it, vi } from "vitest";

import { BackendError } from "../src/backendTypes.js";
import { CommandExecutionError, runCommand } from "../src/commandRunner.js";
import { AdminApiReloadTarget } from "../src/reloadTarget.js";

vi.mock("../src/commandRunner.js", async () => {
  const actual = await vi.importActual<typeof import("../src/commandRunner.js")>("../src/commandRunner.js");
  return {
    ...actual,
    runCommand: vi.fn(async () => ({ stdout: "", stderr: "" }))
  };
});

describe("AdminApiReloadTarget", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("returns body text on success", async () => {
    global.fetch = vi.fn(async () => new Response("reloaded", { status: 200 })) as typeof fetch;

    const target = new AdminApiReloadTarget({
      url: "http://caddy:2019/load",
      timeoutMs: 1000
    });

    await expect(target.reload(":80 {\n\trespond \"ok\"\n}\n")).resolves.toEqual({ output: "reloaded" });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://caddy:2019/load",
      expect.objectContaining({
        method: "POST",
        body: ":80 {\n\trespond \"ok\"\n}\n",
        headers: expect.objectContaining({
          "Content-Type": "text/caddyfile"
        })
      })
    );
  });

  it("maps unreachable host failures", async () => {
    global.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;

    const target = new AdminApiReloadTarget({
      url: "http://missing:2019/load",
      timeoutMs: 1000
    });

    await expect(target.reload(":80 {\n\trespond \"ok\"\n}\n")).rejects.toEqual(
      expect.objectContaining<Partial<BackendError>>({
        code: "ADMIN_API_UNREACHABLE"
      })
    );
  });

  it("maps non-2xx responses", async () => {
    global.fetch = vi.fn(async () => new Response("bad gateway", { status: 502 })) as typeof fetch;

    const target = new AdminApiReloadTarget({
      url: "http://caddy:2019/load",
      timeoutMs: 1000
    });

    await expect(target.reload(":80 {\n\trespond \"ok\"\n}\n")).rejects.toEqual(
      expect.objectContaining<Partial<BackendError>>({
        code: "ADMIN_API_RESPONSE_ERROR"
      })
    );
  });

  it("maps timeout failures", async () => {
    global.fetch = vi.fn(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new DOMException("Aborted", "AbortError")), 0);
        })
    ) as typeof fetch;

    const target = new AdminApiReloadTarget({
      url: "http://caddy:2019/load",
      timeoutMs: 1
    });

    await expect(target.reload(":80 {\n\trespond \"ok\"\n}\n")).rejects.toEqual(
      expect.objectContaining<Partial<BackendError>>({
        code: "ADMIN_API_TIMEOUT"
      })
    );
  });
});
