import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import type { ApplyResponse, EntryInput, EntriesResponse, HealthResponse } from "@caddy-ui/shared";

import type { AppConfig } from "./config.js";
import { CommandExecutionError, runCommand, summarizeCommandOutput } from "./commandRunner.js";
import { DraftStore } from "./draftStore.js";

function isMissingCommandError(error: CommandExecutionError, commandName: string) {
  return (
    error.message.includes("ENOENT") &&
    (error.message.includes(`spawn ${commandName}`) || error.message.includes(`"${commandName}"`))
  );
}

function formatApplyError(error: unknown, context: "validate" | "reload") {
  if (error instanceof CommandExecutionError) {
    if (context === "validate" && isMissingCommandError(error, "caddy")) {
      return "Validation could not start because the Caddy executable is not available. Install Caddy in the container or set CADDY_VALIDATE_COMMAND to the correct path.";
    }

    if (context === "reload" && isMissingCommandError(error, "systemctl")) {
      return "Reload could not start because systemd is not available in this environment. Disable reload or set CADDY_RELOAD_COMMAND to a command that works in this container.";
    }

    const output = summarizeCommandOutput(error.stdout, error.stderr);
    if (context === "validate" && output) {
      return `Validation failed. ${output}`;
    }

    if (context === "reload" && output) {
      return `Config was saved, but reload failed. ${output}`;
    }
  }

  if (context === "validate") {
    return error instanceof Error ? error.message : "Validation failed.";
  }

  return error instanceof Error ? `Config was saved, but reload failed. ${error.message}` : "Config was saved, but reload failed.";
}

export class CaddyService {
  private config: AppConfig;
  private draftStore: DraftStore;

  constructor(config: AppConfig) {
    this.config = config;
    this.draftStore = new DraftStore(config.caddyfilePath);
  }

  async getEntries(): Promise<EntriesResponse> {
    const snapshot = await this.draftStore.getSnapshot();
    return {
      entries: snapshot.entries,
      dirty: snapshot.dirty,
      sourcePath: snapshot.sourcePath,
      warnings: []
    };
  }

  async createEntry(input: EntryInput): Promise<EntriesResponse> {
    const snapshot = await this.draftStore.create(input);
    return {
      entries: snapshot.entries,
      dirty: snapshot.dirty,
      sourcePath: snapshot.sourcePath,
      warnings: []
    };
  }

  async updateEntry(id: string, input: EntryInput): Promise<EntriesResponse | null> {
    const snapshot = await this.draftStore.update(id, input);
    if (!snapshot) {
      return null;
    }

    return {
      entries: snapshot.entries,
      dirty: snapshot.dirty,
      sourcePath: snapshot.sourcePath,
      warnings: []
    };
  }

  async deleteEntry(id: string): Promise<EntriesResponse | null> {
    const snapshot = await this.draftStore.remove(id);
    if (!snapshot) {
      return null;
    }

    return {
      entries: snapshot.entries,
      dirty: snapshot.dirty,
      sourcePath: snapshot.sourcePath,
      warnings: []
    };
  }

  async apply(options: { reload?: boolean }): Promise<ApplyResponse> {
    const tempDir = await mkdtemp(join(tmpdir(), "caddy-ui-"));
    const tempConfigPath = join(tempDir, basename(this.config.caddyfilePath));
    const draft = await this.draftStore.renderDraft();

    try {
      await writeFile(tempConfigPath, draft, "utf8");
      const validation = await runCommand(this.config.validateCommand, tempConfigPath);

      const liveTempPath = join(dirname(this.config.caddyfilePath), `.${basename(this.config.caddyfilePath)}.tmp`);
      await writeFile(liveTempPath, draft, "utf8");
      await rename(liveTempPath, this.config.caddyfilePath);

      let reloadOutput = "";
      if (options.reload && this.config.enableReload) {
        try {
          const reload = await runCommand(this.config.reloadCommand);
          reloadOutput = summarizeCommandOutput(reload.stdout, reload.stderr);
        } catch (error) {
          return {
            success: false,
            dirty: false,
            error: formatApplyError(error, "reload"),
            validationOutput: summarizeCommandOutput(validation.stdout, validation.stderr)
          };
        }
      }

      this.draftStore.clearDraft();
      return {
        success: true,
        dirty: false,
        validationOutput: summarizeCommandOutput(validation.stdout, validation.stderr),
        reloadOutput
      };
    } catch (error) {
      const output =
        error instanceof CommandExecutionError
          ? summarizeCommandOutput(error.stdout, error.stderr)
          : undefined;
      const message = formatApplyError(error, "validate");
      return {
        success: false,
        dirty: this.draftStore.isDirty(),
        error: message,
        validationOutput: output
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  async getHealth(): Promise<HealthResponse> {
    await readFile(this.config.caddyfilePath, "utf8");
    return {
      ok: true,
      dirty: this.draftStore.isDirty(),
      reloadEnabled: this.config.enableReload,
      sourcePath: this.config.caddyfilePath
    };
  }
}
