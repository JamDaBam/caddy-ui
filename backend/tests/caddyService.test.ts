import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BackendError } from "../src/backendTypes.js";
import { FileCaddyfileStore } from "../src/caddyfileStore.js";
import { CaddyService } from "../src/caddyService.js";
import type { AppConfig } from "../src/config.js";
import type { ConfigValidator } from "../src/configValidator.js";
import type { ReloadTarget } from "../src/reloadTarget.js";

describe("CaddyService", () => {
  let directory: string;
  let caddyfilePath: string;
  let config: AppConfig;
  let validator: ConfigValidator;
  let reloadTarget: ReloadTarget;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "caddy-service-test-"));
    caddyfilePath = join(directory, "Caddyfile");
    await writeFile(caddyfilePath, "example.com {\n\treverse_proxy localhost:8080\n}\n", "utf8");
    config = {
      port: 3001,
      storageMode: "local-file",
      reloadMode: "command",
      caddyfilePath,
      validateCommand: "caddy validate --config {config} --adapter caddyfile",
      reloadCommand: "systemctl reload caddy",
      adminApiUrl: "http://caddy:2019/load",
      adminApiTimeoutMs: 5000
    };
    validator = {
      validate: vi.fn(async () => ({ output: "valid" }))
    };
    reloadTarget = {
      reload: vi.fn(async () => ({ output: "reloaded" }))
    };
  });

  afterEach(async () => {
    await import("node:fs/promises").then(({ rm }) => rm(directory, { recursive: true, force: true }));
  });

  it("writes validated draft content through the store abstraction", async () => {
    const service = new CaddyService(config, {
      store: new FileCaddyfileStore("local-file", caddyfilePath),
      validator,
      reloadTarget
    });
    await service.updateEntry("entry-1", {
      label: "example.com",
      raw: "respond \"updated\""
    });

    const result = await service.apply({ reload: false });

    expect(result.success).toBe(true);
    expect(result.backend.storageMode).toBe("local-file");
    expect(await readFile(caddyfilePath, "utf8")).toContain("respond \"updated\"");
    expect(reloadTarget.reload).not.toHaveBeenCalled();
  });

  it("skips reload when reload mode is disabled", async () => {
    const service = new CaddyService({ ...config, reloadMode: "disabled" }, {
      store: new FileCaddyfileStore("local-file", caddyfilePath),
      validator,
      reloadTarget
    });

    const result = await service.apply({ reload: true });

    expect(result.success).toBe(true);
    expect(result.reloadOutput).toBe("");
    expect(reloadTarget.reload).not.toHaveBeenCalled();
  });

  it("returns mapped validation errors", async () => {
    validator = {
      validate: vi.fn(async () => {
        throw new BackendError(
          "VALIDATION_COMMAND_MISSING",
          "Validation could not start because the Caddy executable is not available. Install Caddy in the container or set CADDY_VALIDATE_COMMAND to the correct path."
        );
      })
    };

    const service = new CaddyService(config, {
      store: new FileCaddyfileStore("local-file", caddyfilePath),
      validator,
      reloadTarget
    });

    const result = await service.apply({ reload: false });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("VALIDATION_COMMAND_MISSING");
  });

  it("returns reload failures after a successful write", async () => {
    reloadTarget = {
      reload: vi.fn(async () => {
        throw new BackendError("ADMIN_API_UNREACHABLE", "Caddy Admin API is unreachable. fetch failed");
      })
    };

    const service = new CaddyService({ ...config, reloadMode: "admin-api" }, {
      store: new FileCaddyfileStore("shared-file", caddyfilePath),
      validator,
      reloadTarget
    });

    await service.updateEntry("entry-1", {
      label: "example.com",
      raw: "respond \"updated\""
    });
    const result = await service.apply({ reload: true });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("ADMIN_API_UNREACHABLE");
    expect(await readFile(caddyfilePath, "utf8")).toContain("respond \"updated\"");
    expect(reloadTarget.reload).toHaveBeenCalledWith("example.com {\n\trespond \"updated\"\n}\n");
  });
});
