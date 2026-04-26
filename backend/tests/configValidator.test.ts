import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const runCommandMock = vi.hoisted(() => vi.fn());
const summarizeCommandOutputMock = vi.hoisted(() => vi.fn(() => "ok"));

vi.mock("../src/commandRunner.js", () => ({
  CommandExecutionError: class CommandExecutionError extends Error {
    stdout: string;
    stderr: string;

    constructor(message: string, stdout: string, stderr: string) {
      super(message);
      this.stdout = stdout;
      this.stderr = stderr;
    }
  },
  runCommand: runCommandMock,
  summarizeCommandOutput: summarizeCommandOutputMock
}));

import { CommandConfigValidator } from "../src/configValidator.js";

describe("CommandConfigValidator", () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    vi.clearAllMocks();
    await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it("replaces missing trusted roots with a temp PEM during validation", async () => {
    const validator = new CommandConfigValidator("caddy validate --config {config} --adapter caddyfile");

    runCommandMock.mockImplementationOnce(async (_commandTemplate: string, configPath?: string) => {
      expect(configPath).toBeTruthy();
      const candidate = await readFile(configPath!, "utf8");
      const match = candidate.match(/trusted_roots ([^\n]+)/);

      expect(match?.[1]).toBeTruthy();
      expect(match?.[1]).not.toBe("/etc/root_CA.cert");
      await expect(access(match![1])).resolves.toBeUndefined();
      expect(await readFile(match![1], "utf8")).toContain("BEGIN CERTIFICATE");

      return { stdout: "valid", stderr: "" };
    });

    await validator.validate(
      [
        "example.com {",
        "  tls {",
        "    issuer acme {",
        "      trusted_roots /etc/root_CA.cert",
        "    }",
        "  }",
        "}"
      ].join("\n"),
      "/etc/caddy/Caddyfile"
    );

    expect(runCommandMock).toHaveBeenCalledTimes(1);
  });

  it("preserves trusted roots paths that already exist", async () => {
    const validator = new CommandConfigValidator("caddy validate --config {config} --adapter caddyfile");
    const directory = await mkdtemp(join(tmpdir(), "caddy-ui-validator-test-"));
    tempDirectories.push(directory);
    const existingCertPath = join(directory, "root.pem");
    await writeFile(existingCertPath, "existing cert", "utf8");

    runCommandMock.mockImplementationOnce(async (_commandTemplate: string, configPath?: string) => {
      expect(configPath).toBeTruthy();
      const candidate = await readFile(configPath!, "utf8");

      expect(candidate).toContain(`trusted_roots ${existingCertPath}`);
      return { stdout: "valid", stderr: "" };
    });

    await validator.validate(
      [
        "example.com {",
        "  tls {",
        "    issuer acme {",
        `      trusted_roots ${existingCertPath}`,
        "    }",
        "  }",
        "}"
      ].join("\n"),
      "/etc/caddy/Caddyfile"
    );

    expect(runCommandMock).toHaveBeenCalledTimes(1);
  });
});
