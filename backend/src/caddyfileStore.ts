import { readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type { BackendModeInfo, StorageMode } from "./backendTypes.js";
import { BackendError } from "./backendTypes.js";

export interface CaddyfileStore {
  read(): Promise<string>;
  write(content: string): Promise<void>;
  describeSource(): string;
  getModeInfo(): BackendModeInfo;
}

function mapReadError(error: unknown, sourcePath: string): BackendError {
  if (typeof error === "object" && error && "code" in error) {
    const code = String(error.code);
    if (code === "ENOENT") {
      return new BackendError("CADDYFILE_NOT_FOUND", `Caddyfile not found at ${sourcePath}.`);
    }

    if (code === "EACCES" || code === "EPERM") {
      return new BackendError(
        "CADDYFILE_PERMISSION_DENIED",
        `Permission denied while reading Caddyfile at ${sourcePath}.`
      );
    }
  }

  return new BackendError(
    "CADDYFILE_READ_FAILED",
    error instanceof Error ? `Failed to read Caddyfile. ${error.message}` : "Failed to read Caddyfile."
  );
}

function mapWriteError(error: unknown, sourcePath: string): BackendError {
  if (typeof error === "object" && error && "code" in error) {
    const code = String(error.code);
    if (code === "ENOENT") {
      return new BackendError("CADDYFILE_NOT_FOUND", `Caddyfile not found at ${sourcePath}.`);
    }

    if (code === "EACCES" || code === "EPERM") {
      return new BackendError(
        "CADDYFILE_PERMISSION_DENIED",
        `Permission denied while writing Caddyfile at ${sourcePath}.`
      );
    }
  }

  return new BackendError(
    "CADDYFILE_WRITE_FAILED",
    error instanceof Error ? `Failed to write Caddyfile. ${error.message}` : "Failed to write Caddyfile."
  );
}

export class FileCaddyfileStore implements CaddyfileStore {
  private mode: StorageMode;
  private sourcePath: string;

  constructor(mode: StorageMode, sourcePath: string) {
    this.mode = mode;
    this.sourcePath = sourcePath;
  }

  async read(): Promise<string> {
    try {
      return await readFile(this.sourcePath, "utf8");
    } catch (error) {
      throw mapReadError(error, this.sourcePath);
    }
  }

  async write(content: string): Promise<void> {
    const liveTempPath = join(dirname(this.sourcePath), `.${basename(this.sourcePath)}.tmp`);

    try {
      await writeFile(liveTempPath, content, "utf8");
      await rename(liveTempPath, this.sourcePath);
    } catch (error) {
      throw mapWriteError(error, this.sourcePath);
    }
  }

  describeSource(): string {
    return this.mode === "shared-file"
      ? `Shared Caddyfile at ${this.sourcePath}`
      : `Local Caddyfile at ${this.sourcePath}`;
  }

  getModeInfo(): BackendModeInfo {
    return {
      storageMode: this.mode,
      reloadMode: "disabled",
      reloadEnabled: false,
      sourcePath: this.sourcePath,
      sourceDescription: this.describeSource()
    };
  }
}
