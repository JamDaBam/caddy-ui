import { chmod, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { BackendError } from "../src/backendTypes.js";
import { FileCaddyfileStore } from "../src/caddyfileStore.js";

describe("FileCaddyfileStore", () => {
  const cleanupDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupDirs.splice(0).map(async (directory) => {
        await import("node:fs/promises").then(({ rm }) => rm(directory, { recursive: true, force: true }));
      })
    );
  });

  it("reads and writes through the configured path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "caddy-store-test-"));
    cleanupDirs.push(directory);
    const caddyfilePath = join(directory, "Caddyfile");
    await writeFile(caddyfilePath, "example.com {\n\trespond \"ok\"\n}\n", "utf8");

    const store = new FileCaddyfileStore("shared-file", caddyfilePath);

    expect(await store.read()).toContain("respond");
    await store.write("example.com {\n\trespond \"updated\"\n}\n");
    expect(await store.read()).toContain("updated");
    expect(store.describeSource()).toBe(`Shared Caddyfile at ${caddyfilePath}`);
  });

  it("maps missing file errors", async () => {
    const store = new FileCaddyfileStore("shared-file", "/tmp/definitely-missing-caddyfile");

    await expect(store.read()).rejects.toEqual(
      expect.objectContaining<Partial<BackendError>>({
        code: "CADDYFILE_NOT_FOUND"
      })
    );
  });

  it("maps permission denied errors during read", async () => {
    const directory = await mkdtemp(join(tmpdir(), "caddy-store-test-"));
    cleanupDirs.push(directory);
    const lockedDir = join(directory, "locked");
    await mkdir(lockedDir);
    const caddyfilePath = join(lockedDir, "Caddyfile");
    await writeFile(caddyfilePath, "example.com {\n}\n", "utf8");
    await chmod(lockedDir, 0o000);

    const store = new FileCaddyfileStore("local-file", caddyfilePath);

    try {
      await expect(store.read()).rejects.toEqual(
        expect.objectContaining<Partial<BackendError>>({
          code: "CADDYFILE_PERMISSION_DENIED"
        })
      );
    } finally {
      await chmod(lockedDir, 0o755);
    }
  });
});
