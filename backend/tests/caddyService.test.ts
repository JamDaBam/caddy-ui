import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CaddyService } from "../src/caddyService.js";
import { CommandExecutionError, runCommand } from "../src/commandRunner.js";
import type { AppConfig } from "../src/config.js";

vi.mock("../src/commandRunner.js", async () => {
  const actual = await vi.importActual<typeof import("../src/commandRunner.js")>("../src/commandRunner.js");
  return {
    ...actual,
    runCommand: vi.fn(async () => ({ stdout: "ok", stderr: "" })),
    summarizeCommandOutput: (stdout: string, stderr: string) => [stdout, stderr].filter(Boolean).join("\n")
  };
});

describe("CaddyService", () => {
  let directory: string;
  let caddyfilePath: string;
  let config: AppConfig;

  beforeEach(async () => {
    vi.clearAllMocks();
    directory = await mkdtemp(join(tmpdir(), "caddy-service-test-"));
    caddyfilePath = join(directory, "Caddyfile");
    await writeFile(caddyfilePath, "example.com {\n\treverse_proxy localhost:8080\n}\n", "utf8");
    config = {
      port: 3001,
      caddyfilePath,
      validateCommand: "caddy validate --config {config} --adapter caddyfile",
      reloadCommand: "systemctl reload caddy",
      enableReload: true
    };
  });

  afterEach(async () => {
    await import("node:fs/promises").then(({ rm }) => rm(directory, { recursive: true, force: true }));
  });

  it("writes validated draft content", async () => {
    const service = new CaddyService(config);
    await service.updateEntry("entry-1", {
      label: "example.com",
      raw: "respond \"updated\""
    });

    const result = await service.apply({ reload: false });

    expect(result.success).toBe(true);
    expect(await readFile(caddyfilePath, "utf8")).toContain("respond \"updated\"");
  });

  it("skips reload when disabled", async () => {
    const service = new CaddyService({ ...config, enableReload: false });
    const result = await service.apply({ reload: true });

    expect(result.success).toBe(true);
    expect(result.reloadOutput).toBe("");
  });

  it("returns a human-readable error when caddy is missing", async () => {
    vi.mocked(runCommand).mockRejectedValueOnce(new CommandExecutionError("spawn caddy ENOENT", "", ""));

    const service = new CaddyService(config);
    const result = await service.apply({ reload: false });

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "Validation could not start because the Caddy executable is not available. Install Caddy in the container or set CADDY_VALIDATE_COMMAND to the correct path."
    );
  });

  it("includes validation output for regular validation failures", async () => {
    vi.mocked(runCommand).mockRejectedValueOnce(
      new CommandExecutionError("Command failed", "", "Error: adapting config using caddyfile: unexpected token")
    );

    const service = new CaddyService(config);
    const result = await service.apply({ reload: false });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Validation failed. Error: adapting config using caddyfile: unexpected token");
  });
});
