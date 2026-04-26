import type { ApplyResponse, EntryInput, EntriesResponse, HealthResponse } from "@caddy-ui/shared";

import type { AppConfig } from "./config.js";
import type { BackendModeInfo } from "./backendTypes.js";
import { BackendError } from "./backendTypes.js";
import type { CaddyfileStore } from "./caddyfileStore.js";
import { FileCaddyfileStore } from "./caddyfileStore.js";
import type { ConfigValidator } from "./configValidator.js";
import { CommandConfigValidator } from "./configValidator.js";
import { DraftStore } from "./draftStore.js";
import type { ReloadTarget } from "./reloadTarget.js";
import { AdminApiReloadTarget, CommandReloadTarget, DisabledReloadTarget } from "./reloadTarget.js";

/** Converts internal errors into the smaller apply payload shape the API returns to the UI. */
function formatUnexpectedError(error: unknown, fallback: string): { error: string; errorCode?: ApplyResponse["errorCode"] } {
  if (error instanceof BackendError) {
    return {
      error: error.message,
      errorCode: error.code
    };
  }

  return {
    error: error instanceof Error ? error.message : fallback
  };
}

/** Builds the backend mode description once so every response advertises the active provider stack. */
function buildModeInfo(config: AppConfig, store: CaddyfileStore): BackendModeInfo {
  return {
    ...store.getModeInfo(),
    reloadMode: config.reloadMode,
    reloadEnabled: config.reloadMode !== "disabled"
  };
}

/**
 * Backend orchestration layer for draft editing, validation, persistence, and optional reload.
 * Store, validator, and reload target stay swappable so local-host and remote-provider deployments share the same API.
 */
export class CaddyService {
  private draftStore: DraftStore;
  private store: CaddyfileStore;
  private validator: ConfigValidator;
  private reloadTarget: ReloadTarget;
  private modeInfo: BackendModeInfo;

  constructor(
    config: AppConfig,
    dependencies?: {
      store?: CaddyfileStore;
      validator?: ConfigValidator;
      reloadTarget?: ReloadTarget;
    }
  ) {
    this.store = dependencies?.store ?? new FileCaddyfileStore(config.storageMode, config.caddyfilePath);
    this.validator = dependencies?.validator ?? new CommandConfigValidator(config.validateCommand);
    this.reloadTarget =
      dependencies?.reloadTarget ??
      (config.reloadMode === "command"
        ? new CommandReloadTarget(config.reloadCommand)
        : config.reloadMode === "admin-api"
          ? new AdminApiReloadTarget({
              url: config.adminApiUrl,
              token: config.adminApiToken,
              authHeader: config.adminApiAuthHeader,
              timeoutMs: config.adminApiTimeoutMs
            })
          : new DisabledReloadTarget());
    this.modeInfo = buildModeInfo(config, this.store);
    this.draftStore = new DraftStore(this.store);
  }

  /** Normalizes draft snapshots into the API response shape returned by entry endpoints. */
  private toEntriesResponse(snapshot: Awaited<ReturnType<DraftStore["getSnapshot"]>>): EntriesResponse {
    return {
      entries: snapshot.entries,
      dirty: snapshot.dirty,
      sourcePath: snapshot.sourcePath,
      warnings: [],
      backend: this.modeInfo
    };
  }

  async getEntries(): Promise<EntriesResponse> {
    const snapshot = await this.draftStore.getSnapshot();
    return this.toEntriesResponse(snapshot);
  }

  async createEntry(input: EntryInput): Promise<EntriesResponse> {
    const snapshot = await this.draftStore.create(input);
    return this.toEntriesResponse(snapshot);
  }

  async updateEntry(id: string, input: EntryInput): Promise<EntriesResponse | null> {
    const snapshot = await this.draftStore.update(id, input);
    if (!snapshot) {
      return null;
    }

    return this.toEntriesResponse(snapshot);
  }

  async deleteEntry(id: string): Promise<EntriesResponse | null> {
    const snapshot = await this.draftStore.remove(id);
    if (!snapshot) {
      return null;
    }

    return this.toEntriesResponse(snapshot);
  }

  /** Validates the staged draft before replacing the live file, then optionally triggers reload. */
  async apply(options: { reload?: boolean }): Promise<ApplyResponse> {
    const draft = await this.draftStore.renderDraft();

    try {
      const validation = await this.validator.validate(draft, this.modeInfo.sourcePath);
      await this.store.write(draft);

      let reloadOutput = "";
      if (options.reload && this.modeInfo.reloadEnabled) {
        try {
          const reload = await this.reloadTarget.reload(draft);
          reloadOutput = reload.output;
        } catch (error) {
          const mapped = formatUnexpectedError(error, "Config was saved, but reload failed.");
          return {
            success: false,
            dirty: false,
            error: mapped.error,
            errorCode: mapped.errorCode,
            validationOutput: validation.output,
            backend: this.modeInfo
          };
        }
      }

      this.draftStore.clearDraft();
      return {
        success: true,
        dirty: false,
        validationOutput: validation.output,
        reloadOutput,
        backend: this.modeInfo
      };
    } catch (error) {
      const mapped = formatUnexpectedError(error, "Validation failed.");
      return {
        success: false,
        dirty: this.draftStore.isDirty(),
        error: mapped.error,
        errorCode: mapped.errorCode,
        backend: this.modeInfo
      };
    }
  }

  async getHealth(): Promise<HealthResponse> {
    await this.store.read();
    return {
      ok: true,
      dirty: this.draftStore.isDirty(),
      reloadEnabled: this.modeInfo.reloadEnabled,
      sourcePath: this.modeInfo.sourcePath,
      backend: this.modeInfo
    };
  }
}
